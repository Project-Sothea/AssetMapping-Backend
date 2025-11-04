import supabase from '../../config/supabase';
import { FormCreatedEvent, FormUpdatedEvent, FormDeletedEvent } from '../../types/events';
import { logger } from '../../utils/logger';

/**
 * Form Projection Handler
 *
 * Responsibility: Handle projection updates for Form aggregates
 * - Create form read models
 * - Update form read models with optimistic locking
 * - Delete form read models
 */
export class FormProjectionHandler {
  /**
   * Handle FormCreated event
   */
  async handleCreated(event: FormCreatedEvent): Promise<void> {
    const { payload } = event;

    // Check if already exists (idempotency)
    const { data: existing } = await supabase
      .from('forms')
      .select('id')
      .eq('id', payload.id)
      .single();

    if (existing) {
      logger.debug('Form already exists, skipping', { formId: payload.id });
      return;
    }

    const { error } = await supabase.from('forms').insert({
      id: payload.id,
      pinId: payload.pinId,
      formType: payload.formType,
      data: payload.data,
      version: event.version,
      createdAt: payload.createdAt,
      updatedAt: payload.createdAt,
      userId: payload.createdBy,
      status: 'synced',
    });

    if (error) {
      logger.error('Failed to insert form', { error, formId: payload.id });
      throw error;
    }

    logger.info('Form created in read model', { formId: payload.id });
  }

  /**
   * Handle FormUpdated event
   */
  async handleUpdated(event: FormUpdatedEvent): Promise<void> {
    const { payload, version } = event;

    const { error } = await supabase
      .from('forms')
      .update({
        ...payload.changes,
        version,
        updatedAt: payload.updatedAt,
      })
      .eq('id', payload.id)
      .lt('version', version);

    if (error) {
      logger.error('Failed to update form', { error, formId: payload.id });
      throw error;
    }

    logger.info('Form updated in read model', { formId: payload.id, version });
  }

  /**
   * Handle FormDeleted event
   */
  async handleDeleted(event: FormDeletedEvent): Promise<void> {
    const { payload } = event;

    const { error } = await supabase.from('forms').delete().eq('id', payload.id);

    if (error) {
      logger.error('Failed to delete form', { error, formId: payload.id });
      throw error;
    }

    logger.info('Form deleted from read model', { formId: payload.id });
  }
}

export const formProjectionHandler = new FormProjectionHandler();
