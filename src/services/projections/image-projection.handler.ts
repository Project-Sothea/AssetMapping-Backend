import supabase from '../../config/supabase';
import { ImageUploadedEvent } from '../../types/events';
import { logger } from '../../utils/logger';

/**
 * Image Projection Handler
 *
 * Responsibility: Handle projection updates for Image events
 * - Link uploaded images to entities (pins/forms)
 * - Update entity image arrays
 * - Handle idempotency for image uploads
 */
export class ImageProjectionHandler {
  /**
   * Handle ImageUploaded event
   */
  async handleUploaded(event: ImageUploadedEvent): Promise<void> {
    const { payload } = event;

    // Update the entity (pin or form) with the new image URL
    const tableName = payload.entityType === 'pin' ? 'pins' : 'forms';

    // Get current images array
    const { data: current } = await supabase
      .from(tableName)
      .select('images')
      .eq('id', payload.entityId)
      .single();

    if (!current) {
      logger.warn('Entity not found for image upload', {
        entityType: payload.entityType,
        entityId: payload.entityId,
      });
      return;
    }

    const currentImages = (current.images as string[]) || [];

    // Add new image if not already present (idempotency)
    if (!currentImages.includes(payload.url)) {
      currentImages.push(payload.url);

      const { error } = await supabase
        .from(tableName)
        .update({ images: currentImages })
        .eq('id', payload.entityId);

      if (error) {
        logger.error('Failed to update entity with image', {
          error,
          entityType: payload.entityType,
          entityId: payload.entityId,
        });
        throw error;
      }

      logger.info('Image added to entity', {
        entityType: payload.entityType,
        entityId: payload.entityId,
        imageUrl: payload.url,
      });
    } else {
      logger.debug('Image already linked to entity', {
        entityType: payload.entityType,
        entityId: payload.entityId,
      });
    }
  }
}

export const imageProjectionHandler = new ImageProjectionHandler();
