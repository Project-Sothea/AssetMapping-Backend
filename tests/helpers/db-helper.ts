/**
 * Database Helper for System Tests
 * Provides utilities to setup, cleanup, and verify database state
 */

import { supabase } from '../../src/config/supabase';
import { logger } from '../../src/utils/logger';
import { PinTestData, FormTestData } from './test-data';

export class DatabaseHelper {
  /**
   * Clean up all test data
   */
  static async cleanup(): Promise<void> {
    try {
      // Delete ALL forms and pins (be more aggressive for test cleanup)
      // This is safe in test environment
      const { error: formsError } = await supabase
        .from('forms')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      const { error: pinsError } = await supabase
        .from('pins')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (formsError) logger.error('Error deleting forms', { error: formsError });
      if (pinsError) logger.error('Error deleting pins', { error: pinsError });

      logger.info('Database cleanup completed');
    } catch (error) {
      logger.error('Error during database cleanup', { error });
      throw error;
    }
  }

  /**
   * Get a pin by ID
   */
  static async getPin(id: string): Promise<PinTestData | null> {
    const { data, error } = await supabase.from('pins').select('*').eq('id', id).single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw error;
    }

    return data as PinTestData;
  }

  /**
   * Get a form by ID
   */
  static async getForm(id: string): Promise<FormTestData | null> {
    const { data, error } = await supabase.from('forms').select('*').eq('id', id).single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw error;
    }

    return data as FormTestData;
  }

  /**
   * Get all pins
   */
  static async getAllPins(): Promise<PinTestData[]> {
    const { data, error } = await supabase
      .from('pins')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) throw error;
    return (data as PinTestData[]) || [];
  }

  /**
   * Get all forms
   */
  static async getAllForms(): Promise<FormTestData[]> {
    const { data, error } = await supabase
      .from('forms')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) throw error;
    return (data as FormTestData[]) || [];
  }

  /**
   * Verify entity exists
   */
  static async verifyExists(entityType: 'pin' | 'form', id: string): Promise<boolean> {
    const entity =
      entityType === 'pin' ? await DatabaseHelper.getPin(id) : await DatabaseHelper.getForm(id);

    return entity !== null;
  }

  /**
   * Verify entity deleted (soft delete - has deletedAt timestamp)
   */
  static async verifyDeleted(entityType: 'pin' | 'form', id: string): Promise<boolean> {
    const entity =
      entityType === 'pin' ? await DatabaseHelper.getPin(id) : await DatabaseHelper.getForm(id);

    // Entity is deleted if deletedAt is set
    return entity !== null && (entity as any).deletedAt !== null;
  }

  /**
   * Verify version
   */
  static async verifyVersion(
    entityType: 'pin' | 'form',
    id: string,
    expectedVersion: number
  ): Promise<boolean> {
    const entity =
      entityType === 'pin' ? await DatabaseHelper.getPin(id) : await DatabaseHelper.getForm(id);

    return entity?.version === expectedVersion;
  }

  /**
   * Get entity version
   */
  static async getVersion(entityType: 'pin' | 'form', id: string): Promise<number | null> {
    const entity =
      entityType === 'pin' ? await DatabaseHelper.getPin(id) : await DatabaseHelper.getForm(id);

    return entity?.version || null;
  }

  /**
   * Seed initial data for testing
   */
  static async seedTestData(): Promise<{
    pins: PinTestData[];
    forms: FormTestData[];
  }> {
    // Insert test pins
    const pins: PinTestData[] = [
      {
        id: 'test-pin-1',
        lat: 11.5564,
        lng: 104.9282,
        name: 'Test Pin 1',
        type: 'hospital',
        address: '123 Test St',
        cityVillage: 'Phnom Penh',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'test-pin-2',
        lat: 13.3671,
        lng: 103.8448,
        name: 'Test Pin 2',
        type: 'school',
        address: '456 Test Ave',
        cityVillage: 'Siem Reap',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const { error: pinsError } = await supabase.from('pins').insert(pins);
    if (pinsError) throw pinsError;

    // Insert test forms
    const forms: FormTestData[] = [
      {
        id: 'test-form-1',
        pinId: 'test-pin-1',
        name: 'Test Form 1',
        village: 'Test Village',
        status: 'synced',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        canAttend: 'yes',
        brushTeeth: 'yes',
      },
    ];

    const { error: formsError } = await supabase.from('forms').insert(forms);
    if (formsError) throw formsError;

    logger.info('Test data seeded successfully');
    return { pins, forms };
  }

  /**
   * Cleanup specific entities by ID (for selective cleanup)
   */
  static async cleanupSpecific(entityType: 'pin' | 'form', ids: string[]): Promise<void> {
    if (ids.length === 0) {
      logger.debug('No IDs to cleanup');
      return;
    }

    try {
      const table = entityType === 'pin' ? 'pins' : 'forms';
      const { error } = await supabase.from(table).delete().in('id', ids);

      if (error) {
        logger.error(`Error cleaning up specific ${entityType}s`, { error, ids });
        throw error;
      }

      logger.debug(`Cleaned up ${ids.length} ${entityType}(s)`, { ids });
    } catch (error) {
      logger.error(`Failed to cleanup specific ${entityType}s`, { error });
      throw error;
    }
  }

  /**
   * Cleanup by ID pattern (e.g., all test-generated data with specific prefix)
   */
  static async cleanupByPattern(entityType: 'pin' | 'form', pattern: string): Promise<void> {
    try {
      const table = entityType === 'pin' ? 'pins' : 'forms';
      const { error } = await supabase.from(table).delete().like('id', `${pattern}%`);

      if (error) {
        logger.error(`Error cleaning up by pattern ${pattern}`, { error });
        throw error;
      }

      logger.debug(`Cleaned up ${entityType}s matching pattern: ${pattern}`);
    } catch (error) {
      logger.error('Failed to cleanup by pattern', { error });
      throw error;
    }
  }

  /**
   * Get count of entities in database
   */
  static async getCount(entityType: 'pin' | 'form'): Promise<number> {
    try {
      const table = entityType === 'pin' ? 'pins' : 'forms';
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) throw error;
      return count || 0;
    } catch (error) {
      logger.error(`Failed to get ${entityType} count`, { error });
      return 0;
    }
  }

  /**
   * Cleanup entities created after a specific timestamp
   */
  static async cleanupAfterTimestamp(entityType: 'pin' | 'form', timestamp: string): Promise<void> {
    try {
      const table = entityType === 'pin' ? 'pins' : 'forms';
      const { error } = await supabase.from(table).delete().gt('createdAt', timestamp);

      if (error) {
        logger.error(`Error cleaning up after timestamp ${timestamp}`, { error });
        throw error;
      }

      logger.debug(`Cleaned up ${entityType}s created after ${timestamp}`);
    } catch (error) {
      logger.error('Failed to cleanup after timestamp', { error });
      throw error;
    }
  }
}
