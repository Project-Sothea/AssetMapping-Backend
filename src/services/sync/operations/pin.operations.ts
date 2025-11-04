import supabase from '../../../config/supabase';
import { PinData, OperationType } from '../../../types';
import { logger } from '../../../utils/logger';
import { versionManagerService } from '../../infrastructure/version-manager.service';

/**
 * Pin Operations Service
 *
 * Responsibility: Handle database operations for pins
 * - Create, update, delete pins
 * - Prepare pin data for storage
 * - Coordinate with version manager
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
   */
  private async deletePin(pinId: string | undefined): Promise<{ id: string; deleted: boolean }> {
    if (!pinId) {
      throw new Error('Pin ID is required for delete operation');
    }

    // Soft delete by setting deletedAt timestamp
    const { error } = await supabase
      .from('pins')
      .update({ deletedAt: new Date().toISOString() })
      .eq('id', pinId);

    if (error) throw error;

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

    const nextVersion = await versionManagerService.getNextVersion('pins', data.id);
    const pinData = this.preparePinData(data, nextVersion);

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
   */
  private preparePinData(data: PinData, version: number): PinData {
    const isCreate = !data.id;
    const now = new Date().toISOString();

    return {
      ...data,
      version,
      updatedAt: now,
      ...(isCreate && { createdAt: now }),
    } as PinData;
  }
}

export const pinOperations = new PinOperations();
