import { pins, Pin } from '@assetmapping/shared-types';
import { eq, desc, gte } from 'drizzle-orm'; // Import Drizzle query helpers

import { db } from '../db'; // Import the Drizzle db instance
import { mapPinDbToPin, sanitizePinForDb, safeJsonStringParse } from '../db/utils';
import { logger } from '../utils/logger';

import { StorageService } from './storage.service';

export class PinService {
  static async getAllPins(): Promise<Pin[]> {
    logger.info('Fetching all pins');
    try {
      const data = await db.select().from(pins).orderBy(desc(pins.createdAt));

      logger.info('Successfully fetched pins', { count: data?.length || 0 });
      return (data || []).map((pin) => mapPinDbToPin(pin));
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
      return (data || []).map((pin) => mapPinDbToPin(pin));
    } catch (error) {
      logger.error('Error fetching pins since timestamp', { error, timestamp });
      throw error;
    }
  }

  static async getPinById(id: string): Promise<Pin> {
    logger.info('Fetching single pin', { pinId: id });
    try {
      const data = await db.select().from(pins).where(eq(pins.id, id)).limit(1);

      if (!data || data.length === 0) {
        logger.warn('Pin not found', { pinId: id });
        throw new Error('Pin not found');
      }

      logger.info('Successfully fetched pin', { pinId: id });
      return mapPinDbToPin(data[0]);
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

      const images = data?.[0]?.images ?? null;
      if (!images) return [];

      try {
        return safeJsonStringParse(images);
      } catch (parseError) {
        logger.warn('Failed to parse pin images JSON', { pinId, error: parseError });
        return [];
      }
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
    const pinData = sanitizePinForDb(data, version);

    try {
      const result = await db
        .insert(pins)
        .values(pinData)
        .onConflictDoUpdate({
          target: pins.id,
          set: pinData,
        })
        .returning();

      return mapPinDbToPin(result[0]);
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
}
