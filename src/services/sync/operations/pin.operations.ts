import supabase from '../../../config/supabase';
import { PinData, OperationType } from '../../../types';
import { logger } from '../../../utils/logger';
import { versionManagerService } from '../../infrastructure/version-manager.service';
import { imageService } from '../../image.service';

/**
 * Pin Operations Service
 *
 * Responsibility: Handle database operations for pins
 * - Create, update, delete pins
 * - Prepare pin data for storage
 * - Coordinate with version manager
 * - Clean up associated images in Supabase storage
 */
export class PinOperations {
  /**
   * Sync a pin to the database (with version tracking)
   */
  async syncPin(
    operation: OperationType,
    data: PinData
  ): Promise<PinData | { id: string; deleted: boolean }> {
    logger.info('Syncing pin', { operation, pinId: data.id });

    if (operation === 'delete') {
      return this.deletePin(data.id);
    }

    return this.upsertPin(data);
  }

  /**
   * Delete a pin from the database (soft delete)
   * Also deletes all associated images from Supabase storage
   */
  private async deletePin(pinId: string | undefined): Promise<{ id: string; deleted: boolean }> {
    if (!pinId) {
      throw new Error('Pin ID is required for delete operation');
    }

    // Fetch pin to get image URLs before soft deleting
    const { data: pin } = await supabase.from('pins').select('images').eq('id', pinId).single();

    // Soft delete by setting deletedAt timestamp
    const { error } = await supabase
      .from('pins')
      .update({ deletedAt: new Date().toISOString() })
      .eq('id', pinId);

    if (error) throw error;

    // Delete all associated images from storage
    if (pin?.images) {
      try {
        const imageUrls: string[] = JSON.parse(pin.images || '[]');
        if (imageUrls.length > 0) {
          logger.info('Deleting all images for deleted pin', { pinId, count: imageUrls.length });
          await imageService.deleteImages(imageUrls);
        }
      } catch (error) {
        logger.error('Error deleting images for deleted pin', { error, pinId });
        // Don't throw - image deletion failure shouldn't block pin deletion
      }
    }

    return { id: pinId, deleted: true };
  }

  /**
   * Create or update a pin in the database
   * Uses Last-Write-Wins conflict resolution based on updatedAt timestamp
   *
   * ATOMICITY STRATEGY:
   * - Identify images to delete BEFORE DB operation
   * - Perform DB operation first (fail fast if DB issues)
   * - Delete images AFTER successful DB write
   * - Image deletion failures are logged but don't rollback DB changes
   *   (deliberate trade-off: prefer data consistency over storage cleanup)
   */
  private async upsertPin(data: PinData): Promise<PinData> {
    // Check if this is an update with an old version - use timestamp to resolve
    if (data.id && data.version) {
      const currentVersion = await versionManagerService.getCurrentVersion('pins', data.id);

      // If entity exists and client's version is behind
      if (currentVersion > 0 && data.version < currentVersion) {
        // Fetch current server data to compare timestamps
        const { data: serverData } = await supabase
          .from('pins')
          .select('updatedAt')
          .eq('id', data.id)
          .single();

        if (serverData) {
          const clientTime = new Date(data.updatedAt || 0).getTime();
          const serverTime = new Date(serverData.updatedAt || 0).getTime();

          // If server data is newer, reject the update
          if (serverTime >= clientTime) {
            logger.warn('Rejecting older update - server data is newer', {
              pinId: data.id,
              clientVersion: data.version,
              serverVersion: currentVersion,
              clientTime: new Date(clientTime).toISOString(),
              serverTime: new Date(serverTime).toISOString(),
            });

            throw new Error(
              `Conflict: Server has newer data (updated ${new Date(serverTime).toISOString()}). ` +
                `Your changes are from ${new Date(clientTime).toISOString()}. Please pull latest data.`
            );
          }

          // Client data is newer - allow it to overwrite (Last-Write-Wins)
          logger.info('Accepting newer update despite version conflict', {
            pinId: data.id,
            clientVersion: data.version,
            serverVersion: currentVersion,
            clientTime: new Date(clientTime).toISOString(),
            serverTime: new Date(serverTime).toISOString(),
          });
        }
      }
    }

    // Collect images to delete BEFORE making changes
    // We'll only delete them AFTER successful DB operation
    let imagesToDelete: string[] = [];
    if (data.id) {
      imagesToDelete = await this.getImagesToDelete(data.id, data.images);
    }

    // Determine version: check if entity exists in database
    let version = 1; // Default for new entities

    if (data.id) {
      const { data: existing } = await supabase
        .from('pins')
        .select('version')
        .eq('id', data.id)
        .single();

      if (existing) {
        // Entity exists - increment version
        version = (existing.version || 1) + 1;
        logger.info('Incrementing version for existing pin', {
          pinId: data.id,
          oldVersion: existing.version,
          newVersion: version,
        });
      } else {
        // Entity doesn't exist - use version 1
        logger.info('Creating new pin with version 1', { pinId: data.id });
      }
    } else {
      logger.info('Creating new pin without ID (will be assigned by DB)');
    }

    const pinData = this.preparePinData(data, version);

    // Perform DB operation first - fail fast if DB has issues
    const { data: result, error } = await supabase
      .from('pins')
      .upsert(pinData, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      logger.error('Error syncing pin to database', { error, data });
      throw error;
    }

    // DB write succeeded - now attempt image cleanup
    // Delete images AFTER successful DB operation
    if (imagesToDelete.length > 0) {
      try {
        logger.info('Deleting images after successful pin update', {
          pinId: result.id,
          count: imagesToDelete.length,
        });
        await imageService.deleteImages(imagesToDelete);
        logger.info('Image cleanup completed successfully', {
          pinId: result.id,
          deletedCount: imagesToDelete.length,
        });
      } catch (imageError) {
        // Image deletion failed - log for audit but don't rollback DB changes
        // This is a deliberate trade-off: we prioritize data consistency
        // Orphaned images can be cleaned up via background job
        logger.error('Image cleanup failed after pin update', {
          error: imageError,
          pinId: result.id,
          orphanedImages: imagesToDelete,
          message: 'Images may need manual cleanup',
        });
        // Note: We intentionally don't throw here to maintain DB consistency
      }
    }

    logger.info('Pin synced successfully', { pinId: result.id, version: result.version });
    return result as PinData;
  }

  /**
   * Prepare pin data with version and timestamps
   * Excludes local-only columns that should not be saved to the database
   */
  private preparePinData(data: PinData, version: number): PinData {
    const isCreate = !data.id;
    const now = new Date().toISOString();

    // Create a copy and exclude local-only columns
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { localImages, failureReason, lastSyncedAt, lastFailedSyncAt, ...cleanData } = data;

    return {
      ...cleanData,
      version,
      updatedAt: now,
      ...(isCreate && { createdAt: now }),
    } as PinData;
  }

  /**
   * Get list of images to delete when a pin is updated
   * Returns array of image URLs that were removed
   */
  private async getImagesToDelete(pinId: string, newImages?: string | null): Promise<string[]> {
    try {
      // Fetch current pin data to compare images
      const { data: currentPin } = await supabase
        .from('pins')
        .select('images')
        .eq('id', pinId)
        .single();

      if (!currentPin || !currentPin.images) {
        // No existing images to delete
        return [];
      }

      // Parse image arrays
      const oldImageUrls: string[] = JSON.parse(currentPin.images || '[]');
      const newImageUrls: string[] = JSON.parse(newImages || '[]');

      // Find images that were removed
      const deletedImageUrls = oldImageUrls.filter((url) => !newImageUrls.includes(url));

      if (deletedImageUrls.length > 0) {
        logger.info('Images to delete identified', {
          pinId,
          count: deletedImageUrls.length,
        });
      }

      return deletedImageUrls;
    } catch (error) {
      logger.error('Error identifying images to delete', { error, pinId });
      return []; // Return empty array on error - don't block operation
    }
  }
}

export const pinOperations = new PinOperations();
