/**
 * Global Test Fixtures
 * Pre-seeded data reusable across test suites for efficiency
 *
 * IMPORTANT: These fixtures are READ-ONLY. Do not modify in tests.
 * For tests that need to modify data, create test-specific entities.
 */

import { supabase } from '../../src/config/supabase';
import { PinTestData, FormTestData } from './test-data';
import { logger } from '../../src/utils/logger';

/**
 * Global fixtures - seeded once, reused across all test suites
 */
export const FIXTURES = {
  READONLY_PINS: {
    HOSPITAL_1: {
      id: '00000000-0000-4000-8000-000000000001',
      lat: 11.5564,
      lng: 104.9282,
      name: 'Central Hospital',
      type: 'hospital',
      address: '123 Medical Street',
      cityVillage: 'Phnom Penh',
      description: 'Main city hospital fixture',
      images: '[]',
      localImages: '[]',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
      version: 1,
      status: 'synced',
    } as PinTestData,

    SCHOOL_1: {
      id: '00000000-0000-4000-8000-000000000002',
      lat: 13.3671,
      lng: 103.8448,
      name: 'Primary School',
      type: 'school',
      address: '456 Education Road',
      cityVillage: 'Siem Reap',
      description: 'Primary school fixture',
      images: '[]',
      localImages: '[]',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
      version: 1,
      status: 'synced',
    } as PinTestData,

    TEMPLE_1: {
      id: '00000000-0000-4000-8000-000000000003',
      lat: 13.4125,
      lng: 103.867,
      name: 'Ancient Temple',
      type: 'temple',
      address: '789 Heritage Lane',
      cityVillage: 'Siem Reap',
      description: 'Historic temple fixture',
      images: '[]',
      localImages: '[]',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
      version: 1,
      status: 'synced',
    } as PinTestData,

    MARKET_1: {
      id: '00000000-0000-4000-8000-000000000004',
      lat: 12.111,
      lng: 104.9095,
      name: 'Central Market',
      type: 'market',
      address: '101 Commerce Street',
      cityVillage: 'Battambang',
      description: 'Central market fixture',
      images: '[]',
      localImages: '[]',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
      version: 1,
      status: 'synced',
    } as PinTestData,

    GOVERNMENT_1: {
      id: '00000000-0000-4000-8000-000000000005',
      lat: 11.55,
      lng: 104.9167,
      name: 'Government Office',
      type: 'government',
      address: '202 Admin Boulevard',
      cityVillage: 'Phnom Penh',
      description: 'Government office fixture',
      images: '[]',
      localImages: '[]',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
      version: 1,
      status: 'synced',
    } as PinTestData,
  },

  READONLY_FORMS: {
    HOSPITAL_FORM_1: {
      id: '00000000-0000-4000-8000-000000000101',
      pinId: '00000000-0000-4000-8000-000000000001',
      name: 'Hospital Health Inspection',
      village: 'Phnom Penh District 1',
      villageId: 'village-001',
      status: 'synced',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      version: 1,
      canAttend: 'yes',
      brushTeeth: 'yes',
      handBeforeMeal: 'yes',
      handAfterToilet: 'yes',
      eatCleanFood: 'yes',
    } as FormTestData,

    SCHOOL_FORM_1: {
      id: '00000000-0000-4000-8000-000000000102',
      pinId: '00000000-0000-4000-8000-000000000002',
      name: 'School Health Survey',
      village: 'Siem Reap Village',
      villageId: 'village-002',
      status: 'synced',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      version: 1,
      canAttend: 'yes',
      brushTeeth: 'sometimes',
      handBeforeMeal: 'yes',
      handAfterToilet: 'yes',
      eatCleanFood: 'yes',
    } as FormTestData,

    TEMPLE_FORM_1: {
      id: '00000000-0000-4000-8000-000000000103',
      pinId: '00000000-0000-4000-8000-000000000003',
      name: 'Temple Community Survey',
      village: 'Angkor Village',
      villageId: 'village-003',
      status: 'synced',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      version: 1,
      canAttend: 'no',
      brushTeeth: 'yes',
      handBeforeMeal: 'sometimes',
      handAfterToilet: 'yes',
      eatCleanFood: 'no',
    } as FormTestData,
  },
};

/**
 * Manages global test fixtures
 */
export class FixtureManager {
  private static isSeeded = false;
  private static seedTimestamp: string | null = null;

  /**
   * Seed global fixtures once before all tests
   */
  static async seedGlobalFixtures(): Promise<void> {
    if (this.isSeeded) {
      logger.info('Fixtures already seeded, skipping...');
      return;
    }

    try {
      logger.info('🌱 Seeding global test fixtures...');

      // First, cleanup everything
      await this.cleanup();

      // Seed pins
      const pins = Object.values(FIXTURES.READONLY_PINS);
      const { error: pinsError } = await supabase.from('pins').insert(pins);

      if (pinsError) {
        logger.error('Error seeding fixture pins', { error: pinsError });
        throw pinsError;
      }

      // Seed forms
      const forms = Object.values(FIXTURES.READONLY_FORMS);
      const { error: formsError } = await supabase.from('forms').insert(forms);

      if (formsError) {
        logger.error('Error seeding fixture forms', { error: formsError });
        throw formsError;
      }

      this.isSeeded = true;
      this.seedTimestamp = new Date().toISOString();

      logger.info(`✅ Global fixtures seeded successfully`, {
        pins: pins.length,
        forms: forms.length,
        timestamp: this.seedTimestamp,
      });
    } catch (error) {
      logger.error('Failed to seed global fixtures', { error });
      throw error;
    }
  }

  /**
   * Cleanup only mutable test data (preserves fixtures)
   */
  static async cleanupMutableData(): Promise<void> {
    try {
      const fixtureIds = this.getFixtureIds();

      // Delete forms not in fixtures (using NOT IN with array)
      const { data: deletedForms, error: formsError } = await supabase
        .from('forms')
        .delete()
        .not('id', 'in', `(${fixtureIds.forms.join(',')})`)
        .select('id, name');

      // Delete pins not in fixtures (using NOT IN with array)
      const { data: deletedPins, error: pinsError } = await supabase
        .from('pins')
        .delete()
        .not('id', 'in', `(${fixtureIds.pins.join(',')})`)
        .select('id, name');

      if (formsError) {
        logger.error('Error cleaning mutable forms', { error: formsError });
      } else if (deletedForms && deletedForms.length > 0) {
        logger.info(`🧹 Deleted ${deletedForms.length} non-fixture form(s)`, {
          forms: deletedForms.map((f) => f.name),
        });
      }

      if (pinsError) {
        logger.error('Error cleaning mutable pins', { error: pinsError });
      } else if (deletedPins && deletedPins.length > 0) {
        logger.info(`🧹 Deleted ${deletedPins.length} non-fixture pin(s)`, {
          pins: deletedPins.map((p) => p.name),
        });
      }

      logger.info('✅ Mutable test data cleanup completed (fixtures preserved)');
    } catch (error) {
      logger.error('Error during mutable cleanup', { error });
      throw error;
    }
  }

  /**
   * Full cleanup including fixtures
   */
  static async cleanup(): Promise<void> {
    try {
      const { error: formsError } = await supabase
        .from('forms')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      const { error: pinsError } = await supabase
        .from('pins')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (formsError) logger.error('Error in full cleanup forms', { error: formsError });
      if (pinsError) logger.error('Error in full cleanup pins', { error: pinsError });

      logger.info('🧹 Full database cleanup completed');
    } catch (error) {
      logger.error('Error during full cleanup', { error });
      throw error;
    }
  }

  /**
   * Reset fixtures (cleanup + reseed)
   */
  static async reset(): Promise<void> {
    logger.info('🔄 Resetting fixtures...');
    this.isSeeded = false;
    this.seedTimestamp = null;
    await this.cleanup();
    await this.seedGlobalFixtures();
  }

  /**
   * Verify fixtures are properly seeded
   */
  static async verifyFixtures(): Promise<boolean> {
    try {
      const { data: pinData } = await supabase
        .from('pins')
        .select('id')
        .eq('id', FIXTURES.READONLY_PINS.HOSPITAL_1.id)
        .single();

      const { data: formData } = await supabase
        .from('forms')
        .select('id')
        .eq('id', FIXTURES.READONLY_FORMS.HOSPITAL_FORM_1.id)
        .single();

      return !!pinData && !!formData;
    } catch (error) {
      logger.error('Fixture verification failed', { error });
      return false;
    }
  }

  /**
   * Get fixture IDs for cleanup operations
   */
  static getFixtureIds(): { pins: string[]; forms: string[] } {
    return {
      pins: Object.values(FIXTURES.READONLY_PINS).map((p) => p.id!),
      forms: Object.values(FIXTURES.READONLY_FORMS).map((f) => f.id!),
    };
  }

  /**
   * Get fixture count
   */
  static getFixtureCounts(): { pins: number; forms: number } {
    return {
      pins: Object.keys(FIXTURES.READONLY_PINS).length,
      forms: Object.keys(FIXTURES.READONLY_FORMS).length,
    };
  }

  /**
   * Check if seeded
   */
  static isFixturesSeeded(): boolean {
    return this.isSeeded;
  }

  /**
   * Get seed timestamp
   */
  static getSeedTimestamp(): string | null {
    return this.seedTimestamp;
  }
}

/**
 * Helper to get all fixture entities as arrays
 */
export const getAllFixtures = () => {
  return {
    pins: Object.values(FIXTURES.READONLY_PINS),
    forms: Object.values(FIXTURES.READONLY_FORMS),
  };
};

/**
 * Helper to find a fixture by ID
 */
export const findFixtureById = (id: string): PinTestData | FormTestData | undefined => {
  const allPins = Object.values(FIXTURES.READONLY_PINS);
  const allForms = Object.values(FIXTURES.READONLY_FORMS);

  return allPins.find((p) => p.id === id) || allForms.find((f) => f.id === id);
};
