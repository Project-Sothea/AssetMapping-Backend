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

    // AFTER version check passes, handle image deletions
    // This ensures we only delete images if the update will actually be applied
    if (data.id) {
      await this.handleImageDeletions(data.id, data.images);
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

    const { data: result, error } = await supabase
      .from('pins')
      .upsert(pinData, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      logger.error('Error syncing pin', { error, data });
      throw error;
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
   * Handle image deletions when a pin is updated
   * Compares old and new image lists and deletes removed images from Supabase storage
   */
  private async handleImageDeletions(pinId: string, newImages?: string | null): Promise<void> {
    try {
      // Fetch current pin data to compare images
      const { data: currentPin } = await supabase
        .from('pins')
        .select('images')
        .eq('id', pinId)
        .single();

      if (!currentPin || !currentPin.images) {
        // No existing images to delete
        return;
      }

      // Parse image arrays
      const oldImageUrls: string[] = JSON.parse(currentPin.images || '[]');
      const newImageUrls: string[] = JSON.parse(newImages || '[]');

      // Find images that were removed
      const deletedImageUrls = oldImageUrls.filter((url) => !newImageUrls.includes(url));

      if (deletedImageUrls.length > 0) {
        logger.info('Deleting removed images from storage', {
          pinId,
          count: deletedImageUrls.length,
          urls: deletedImageUrls,
        });

        // Delete images from Supabase storage
        await imageService.deleteImages(deletedImageUrls);
      }
    } catch (error) {
      logger.error('Error handling image deletions', { error, pinId });
      // Don't throw - image deletion failure shouldn't block pin updates
    }
  }
}

export const pinOperations = new PinOperations();
