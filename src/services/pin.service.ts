// filepath: /Users/luciusyeojunjie/Desktop/repos/ProjectSothea/AssetMapping-Backend/src/services/pin.service.ts
import supabase from '../config/supabase';
import { logger } from '../utils/logger';

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
}
