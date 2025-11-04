import supabase from '../../config/supabase';
import { PinCreatedEvent, PinUpdatedEvent, PinDeletedEvent } from '../../types/events';
import { logger } from '../../utils/logger';

/**
 * Pin Projection Handler
 *
 * Responsibility: Handle projection updates for Pin aggregates
 * - Create pin read models
 * - Update pin read models with optimistic locking
 * - Delete pin read models
 */
export class PinProjectionHandler {
  /**
   * Handle PinCreated event
   */
  async handleCreated(event: PinCreatedEvent): Promise<void> {
    const { payload } = event;

    // Check if already exists (idempotency)
    const { data: existing } = await supabase
      .from('pins')
      .select('id')
      .eq('id', payload.id)
      .single();

    if (existing) {
      logger.debug('Pin already exists, skipping', { pinId: payload.id });
      return;
    }

    const { error } = await supabase.from('pins').insert({
      id: payload.id,
      title: payload.title,
      description: payload.description,
      latitude: payload.latitude,
      longitude: payload.longitude,
      version: event.version,
      createdAt: payload.createdAt,
      updatedAt: payload.createdAt,
      userId: payload.createdBy,
    });

    if (error) {
      logger.error('Failed to insert pin', { error, pinId: payload.id });
      throw error;
    }

    logger.info('Pin created in read model', { pinId: payload.id });
  }

  /**
   * Handle PinUpdated event
   */
  async handleUpdated(event: PinUpdatedEvent): Promise<void> {
    const { payload, version } = event;

    // Update with optimistic locking
    const { error } = await supabase
      .from('pins')
      .update({
        ...payload.changes,
        version,
        updatedAt: payload.updatedAt,
      })
      .eq('id', payload.id)
      .lt('version', version); // Only update if our version is newer

    if (error) {
      logger.error('Failed to update pin', { error, pinId: payload.id });
      throw error;
    }

    logger.info('Pin updated in read model', { pinId: payload.id, version });
  }

  /**
   * Handle PinDeleted event
   */
  async handleDeleted(event: PinDeletedEvent): Promise<void> {
    const { payload } = event;

    const { error } = await supabase.from('pins').delete().eq('id', payload.id);

    if (error) {
      logger.error('Failed to delete pin', { error, pinId: payload.id });
      throw error;
    }

    logger.info('Pin deleted from read model', { pinId: payload.id });
  }
}

export const pinProjectionHandler = new PinProjectionHandler();
