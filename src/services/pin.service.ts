import { db } from '../db'; // Import the Drizzle db instance
import { eq, desc, gte } from 'drizzle-orm'; // Import Drizzle query helpers
import { logger } from '../utils/logger';
import { pins, Pin, PinDB } from '@assetmapping/shared-types';
import { StorageService } from './storage.service';

export class PinService {
  static async getAllPins(): Promise<Pin[]> {
    logger.info('Fetching all pins');
    try {
      const data = await db
        .select()
        .from(pins)
        .orderBy(desc(pins.createdAt));

      logger.info('Successfully fetched pins', { count: data?.length || 0 });
      return (data || []).map((pin) => this.parsePin(pin));
    } catch (error) {
      logger.error('Error fetching pins', { error });
      throw error;
    }
  }

  static async getPinsSince(timestamp: number): Promise<Pin[]> {
    logger.info('Fetching pins since timestamp', { timestamp });
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid timestamp');
    }

    try {
      const data = await db
        .select()
        .from(pins)
        .where(gte(pins.updatedAt, date))
        .orderBy(pins.updatedAt);

      logger.info('Successfully fetched pins since timestamp', {
        timestamp,
        count: data?.length || 0,
      });
      return (data || []).map((pin) => this.parsePin(pin));
    } catch (error) {
      logger.error('Error fetching pins since timestamp', { error, timestamp });
      throw error;
    }
  }

  static async getPinById(id: string): Promise<Pin> {
    logger.info('Fetching single pin', { pinId: id });
    try {
      const data = await db
        .select()
        .from(pins)
        .where(eq(pins.id, id))
        .limit(1);

      if (!data || data.length === 0) {
        logger.warn('Pin not found', { pinId: id });
        throw new Error('Pin not found');
      }

      logger.info('Successfully fetched pin', { pinId: id });
      return this.parsePin(data[0]);
    } catch (error) {
      logger.error('Error fetching pin', { error, pinId: id });
      throw error;
    }
  }

  /**
   * Get images for a pin (for cleanup during delete)
   */
  static async getPinImages(pinId: string): Promise<string[]> {
    try {
      const data = await db
        .select({ images: pins.images })
        .from(pins)
        .where(eq(pins.id, pinId))
        .limit(1);

      return data?.[0]?.images ? JSON.parse(data[0].images) : [];
    } catch (error) {
      logger.error('Error fetching pin images', { error, pinId });
      throw error;
    }
  }

  /**
   * Hard delete a pin and associated images
   */
  static async deletePin(pinId: string): Promise<void> {
    try {
      // Fetch associated images
      const images = await this.getPinImages(pinId);
      // Derive keys: if value already looks like a key with '/', use as-is; else compose `pins/${pinId}/${imageId}`
      const keys = images.map((img) => (img.includes('/') ? img : `pins/${pinId}/${img}`));

      if (keys.length > 0) {
        try {
          await StorageService.deleteByKeys(keys);
        } catch (deleteError) {
          // Log but do not block pin soft-delete
          logger.error('Failed deleting pin images from bucket', { pinId, error: deleteError });
        }
      }

      // Hard delete the pin
      await db.delete(pins).where(eq(pins.id, pinId));
    } catch (error) {
      logger.error('Error deleting pin', { error, pinId });
      throw error;
    }
  }

  /**
   * Upsert a pin with version and conflict resolution
   */
  static async upsertPin(data: Pin, version: number): Promise<Pin> {
    const pinData = this.preparePinData(data, version);

    try {
      const result = await db
        .insert(pins)
        .values(pinData)
        .onConflictDoUpdate({
          target: pins.id,
          set: pinData,
        })
        .returning();

      return this.parsePin(result[0]);
    } catch (error) {
      logger.error('Error upserting pin', { error, data });
      throw error;
    }
  }

  /**
   * Get current version of a pin
   */
  static async getPinVersion(pinId: string): Promise<number | null> {
    try {
      const data = await db
        .select({ version: pins.version })
        .from(pins)
        .where(eq(pins.id, pinId))
        .limit(1);

      return data?.[0]?.version || null;
    } catch (error) {
      logger.error('Error fetching pin version', { error, pinId });
      throw error;
    }
  }

  /**
   * Get updatedAt timestamp for conflict resolution
   */
  static async getPinUpdatedAt(pinId: string): Promise<Date | null> {
    try {
      const data = await db
        .select({ updatedAt: pins.updatedAt })
        .from(pins)
        .where(eq(pins.id, pinId))
        .limit(1);

      return data?.[0]?.updatedAt || null;
    } catch (error) {
      logger.error('Error fetching pin updatedAt', { error, pinId });
      throw error;
    }
  }

  /**
   * Get list of images to delete when a pin is updated
   */
  static async getImagesToDelete(pinId: string, newImages?: string[] | null): Promise<string[]> {
    try {
      const data = await db
        .select({ images: pins.images })
        .from(pins)
        .where(eq(pins.id, pinId))
        .limit(1);

      if (!data || !data[0]?.images) {
        return [];
      }

      const oldImageUrls: string[] = JSON.parse((data[0].images as string) || '[]');
      const newImageUrls: string[] = Array.isArray(newImages)
        ? newImages
        : JSON.parse((newImages as unknown as string) || '[]');

      const imageUrlsToDelete = oldImageUrls.filter((url) => !newImageUrls.includes(url));

      if (imageUrlsToDelete.length > 0) {
        logger.info('Images to delete identified', {
          pinId,
          count: imageUrlsToDelete.length,
        });
      }

      return imageUrlsToDelete;
    } catch (error) {
      logger.error('Error identifying images to delete', { error, pinId });
      return [];
    }
  }

  /**
   * Prepare pin data (moved from PinOperations for reuse)
   */
  private static preparePinData(data: Pin, version: number): PinDB {
    const isCreate = !data.id;
    const now = new Date();

    return {
      ...data,
      version,
      updatedAt: now,
      ...(isCreate && { createdAt: now }),
      images: JSON.stringify(data.images ?? []),
    } as PinDB;
  }

  static parsePin(data: PinDB): Pin {
    let images: string[] | null = null;
    if (Array.isArray(data.images)) {
      images = data.images.map((img) => String(img));
    } else if (typeof data.images === 'string' && data.images) {
      try {
        const parsed = JSON.parse(data.images);
        images = Array.isArray(parsed) ? parsed.map((img) => String(img)) : null;
      } catch {
        images = null;
      }
    }

    return {
      ...data,
      images,
    };
  }
}
