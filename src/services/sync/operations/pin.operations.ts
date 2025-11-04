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
   * Delete a pin from the database
   */
  private async deletePin(pinId: string | undefined): Promise<{ id: string; deleted: boolean }> {
    if (!pinId) {
      throw new Error('Pin ID is required for delete operation');
    }

    const { error } = await supabase.from('pins').delete().eq('id', pinId);
    if (error) throw error;

    return { id: pinId, deleted: true };
  }

  /**
   * Create or update a pin in the database
   */
  private async upsertPin(data: PinData): Promise<PinData> {
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
