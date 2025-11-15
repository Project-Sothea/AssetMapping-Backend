import supabase from '../config/supabase';
import { logger } from '../utils/logger';
import { PinData } from '../types'; // Add this import if not present

export class PinService {
  static async getAllPins() {
    logger.info('Fetching all pins');
    const { data, error } = await supabase
      .from('pins')
      .select('*')
      .is('deletedAt', null)
      .order('createdAt', { ascending: false });

    if (error) {
      logger.error('Error fetching pins', { error });
      throw error;
    }

    logger.info('Successfully fetched pins', { count: data?.length || 0 });
    return data || [];
  }

  static async getPinsSince(timestamp: number) {
    logger.info('Fetching pins since timestamp', { timestamp });
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid timestamp');
    }

    const { data, error } = await supabase
      .from('pins')
      .select('*')
      .is('deletedAt', null)
      .gte('updatedAt', date.toISOString())
      .order('updatedAt', { ascending: true });

    if (error) {
      logger.error('Error fetching pins since timestamp', { error, timestamp });
      throw error;
    }

    logger.info('Successfully fetched pins since timestamp', {
      timestamp,
      count: data?.length || 0,
    });
    return data || [];
  }

  static async getPinById(id: string) {
    logger.info('Fetching single pin', { pinId: id });
    const { data, error } = await supabase
      .from('pins')
      .select('*')
      .eq('id', id)
      .is('deletedAt', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logger.warn('Pin not found', { pinId: id });
        throw new Error('Pin not found');
      }
      logger.error('Error fetching pin', { error, pinId: id });
      throw error;
    }

    logger.info('Successfully fetched pin', { pinId: id });
    return data;
  }

  /**
   * Get images for a pin (for cleanup during delete)
   */
  static async getPinImages(pinId: string): Promise<string[]> {
    const { data } = await supabase.from('pins').select('images').eq('id', pinId).single();

    return data?.images ? JSON.parse(data.images) : [];
  }

  /**
   * Soft delete a pin by setting deletedAt
   */
  static async deletePin(pinId: string): Promise<void> {
    const { error } = await supabase
      .from('pins')
      .update({ deletedAt: new Date().toISOString() })
      .eq('id', pinId);

    if (error) throw error;
  }

  /**
   * Upsert a pin with version and conflict resolution
   */
  static async upsertPin(data: PinData, version: number): Promise<PinData> {
    const pinData = this.preparePinData(data, version);

    const { data: result, error } = await supabase
      .from('pins')
      .upsert(pinData, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      logger.error('Error upserting pin', { error, data });
      throw error;
    }

    return result as PinData;
  }

  /**
   * Get current version of a pin
   */
  static async getPinVersion(pinId: string): Promise<number | null> {
    const { data } = await supabase.from('pins').select('version').eq('id', pinId).single();

    return data?.version || null;
  }

  /**
   * Get updatedAt timestamp for conflict resolution
   */
  static async getPinUpdatedAt(pinId: string): Promise<string | null> {
    const { data } = await supabase.from('pins').select('updatedAt').eq('id', pinId).single();

    return data?.updatedAt || null;
  }

  /**
   * Get list of images to delete when a pin is updated
   */
  static async getImagesToDelete(pinId: string, newImages?: string | null): Promise<string[]> {
    try {
      const { data: currentPin } = await supabase
        .from('pins')
        .select('images')
        .eq('id', pinId)
        .single();

      if (!currentPin || !currentPin.images) {
        return [];
      }

      const oldImageUrls: string[] = JSON.parse(currentPin.images || '[]');
      const newImageUrls: string[] = JSON.parse(newImages || '[]');

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
      return [];
    }
  }

  /**
   * Prepare pin data (moved from PinOperations for reuse)
   */
  private static preparePinData(data: PinData, version: number): PinData {
    const isCreate = !data.id;
    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { localImages, failureReason, lastSyncedAt, lastFailedSyncAt, ...cleanData } = data;

    return {
      ...cleanData,
      version,
      updatedAt: now,
      ...(isCreate && { createdAt: now }),
    } as PinData;
  }
}
