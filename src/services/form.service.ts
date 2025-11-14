// filepath: /Users/luciusyeojunjie/Desktop/repos/ProjectSothea/AssetMapping-Backend/src/services/form.service.ts
import supabase from '../config/supabase';
import { logger } from '../utils/logger';

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
}
