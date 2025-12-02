import { db } from '../db'; // Import the Drizzle db instance
import { pins } from '../db/schema'; // Import the pins table schema
import { eq, isNull, desc, gte, and } from 'drizzle-orm'; // Import Drizzle query helpers
import { logger } from '../utils/logger';
import { PinData } from '../types';

export class PinService {
  static async getAllPins() {
    logger.info('Fetching all pins');
    try {
      const data = await db
        .select()
        .from(pins)
        .where(isNull(pins.deletedAt))
        .orderBy(desc(pins.createdAt));

      logger.info('Successfully fetched pins', { count: data?.length || 0 });
      return data || [];
    } catch (error) {
      logger.error('Error fetching pins', { error });
      throw error;
    }
  }

  static async getPinsSince(timestamp: number) {
    logger.info('Fetching pins since timestamp', { timestamp });
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid timestamp');
    }

    try {
      const data = await db
        .select()
        .from(pins)
        .where(and(isNull(pins.deletedAt), gte(pins.updatedAt, date)))
        .orderBy(pins.updatedAt);

      logger.info('Successfully fetched pins since timestamp', {
        timestamp,
        count: data?.length || 0,
      });
      return data || [];
    } catch (error) {
      logger.error('Error fetching pins since timestamp', { error, timestamp });
      throw error;
    }
  }

  static async getPinById(id: string) {
    logger.info('Fetching single pin', { pinId: id });
    try {
      const data = await db
        .select()
        .from(pins)
        .where(and(eq(pins.id, id), isNull(pins.deletedAt)))
        .limit(1);

      if (!data || data.length === 0) {
        logger.warn('Pin not found', { pinId: id });
        throw new Error('Pin not found');
      }

      logger.info('Successfully fetched pin', { pinId: id });
      return data[0];
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
   * Soft delete a pin by setting deletedAt
   */
  static async deletePin(pinId: string): Promise<void> {
    try {
      await db.update(pins).set({ deletedAt: new Date() }).where(eq(pins.id, pinId));
    } catch (error) {
      logger.error('Error deleting pin', { error, pinId });
      throw error;
    }
  }

  /**
   * Upsert a pin with version and conflict resolution
   */
  static async upsertPin(data: PinData, version: number): Promise<PinData> {
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

      return result[0] as PinData;
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
  static async getImagesToDelete(pinId: string, newImages?: string | null): Promise<string[]> {
    try {
      const data = await db
        .select({ images: pins.images })
        .from(pins)
        .where(eq(pins.id, pinId))
        .limit(1);

      if (!data || !data[0]?.images) {
        return [];
      }

      const oldImageUrls: string[] = JSON.parse(data[0].images || '[]');
      const newImageUrls: string[] = JSON.parse(newImages || '[]');

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
  private static preparePinData(data: PinData, version: number): PinData {
    const isCreate = !data.id;
    const now = new Date();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { failureReason, lastSyncedAt, lastFailedSyncAt, ...cleanData } = data;

    return {
      ...cleanData,
      version,
      updatedAt: now,
      ...(isCreate && { createdAt: now }),
    } as PinData;
  }
}
