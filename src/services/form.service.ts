import supabase from '../config/supabase';
import { logger } from '../utils/logger';
import { FormData } from '../types';

export class FormService {
  static async getAllForms() {
    logger.info('Fetching all forms');
    const { data, error } = await supabase
      .from('forms')
      .select('*')
      .is('deletedAt', null)
      .order('createdAt', { ascending: false });

    if (error) {
      logger.error('Error fetching forms', { error });
      throw error;
    }

    logger.info('Successfully fetched forms', { count: data?.length || 0 });
    return data || [];
  }

  static async getFormsSince(timestamp: number) {
    logger.info('Fetching forms since timestamp', { timestamp });
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid timestamp');
    }

    const { data, error } = await supabase
      .from('forms')
      .select('*')
      .is('deletedAt', null)
      .gte('updatedAt', date.toISOString())
      .order('updatedAt', { ascending: true });

    if (error) {
      logger.error('Error fetching forms since timestamp', { error, timestamp });
      throw error;
    }

    logger.info('Successfully fetched forms since timestamp', {
      timestamp,
      count: data?.length || 0,
    });
    return data || [];
  }

  static async getFormById(id: string) {
    logger.info('Fetching single form', { formId: id });
    const { data, error } = await supabase
      .from('forms')
      .select('*')
      .eq('id', id)
      .is('deletedAt', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logger.warn('Form not found', { formId: id });
        throw new Error('Form not found');
      }
      logger.error('Error fetching form', { error, formId: id });
      throw error;
    }

    logger.info('Successfully fetched form', { formId: id });
    return data;
  }

  /**
   * Soft delete a form by setting deletedAt
   */
  static async deleteForm(formId: string): Promise<void> {
    const { error } = await supabase
      .from('forms')
      .update({ deletedAt: new Date().toISOString() })
      .eq('id', formId);

    if (error) throw error;
  }

  /**
   * Upsert a form with version and conflict resolution
   */
  static async upsertForm(data: FormData, version: number): Promise<FormData> {
    const formData = this.prepareFormData(data, version);

    const { data: result, error } = await supabase
      .from('forms')
      .upsert(formData, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      logger.error('Error upserting form', { error, data });
      throw error;
    }

    return result as FormData;
  }

  /**
   * Get current version of a form
   */
  static async getFormVersion(formId: string): Promise<number | null> {
    const { data } = await supabase.from('forms').select('version').eq('id', formId).single();

    return data?.version || null;
  }

  /**
   * Get updatedAt timestamp for conflict resolution
   */
  static async getFormUpdatedAt(formId: string): Promise<string | null> {
    const { data } = await supabase.from('forms').select('updatedAt').eq('id', formId).single();

    return data?.updatedAt || null;
  }

  /**
   * Prepare form data
   */
  private static prepareFormData(data: FormData, version: number): FormData {
    const isCreate = !data.id;
    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { failureReason, lastSyncedAt, lastFailedSyncAt, ...cleanData } = data;

    return {
      ...cleanData,
      version,
      status: data.status || 'synced',
      updatedAt: now,
      ...(isCreate && { createdAt: now }),
    } as FormData;
  }
}
