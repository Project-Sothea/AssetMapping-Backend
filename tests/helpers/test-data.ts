/**
 * Test Data Generators for System Tests
 * Simulates realistic data that would come from the frontend
 */

import { v4 as uuidv4 } from 'uuid';

export interface PinTestData {
  id?: string;
  lat: number;
  lng: number;
  name?: string;
  type?: string;
  address?: string;
  cityVillage?: string;
  description?: string;
  images?: string; // JSON array string
  localImages?: string; // JSON array string
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  version?: number;
  status?: string | null;
  failureReason?: string | null;
  lastSyncedAt?: string | null;
  lastFailedSyncAt?: string | null;
}

export interface FormTestData {
  id?: string;
  pinId?: string;
  name?: string;
  village?: string | null;
  villageId?: string | null;
  status?: string | null;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  // Health survey fields - optional for tests
  canAttend?: unknown;
  brushTeeth?: unknown;
  handBeforeMeal?: unknown;
  handAfterToilet?: unknown;
  eatCleanFood?: unknown;
}

export class TestDataGenerator {
  /**
   * Generate a test pin
   */
  static generatePin(overrides?: Partial<PinTestData>): PinTestData {
    const lat = TestDataGenerator.randomLatitude();
    const lng = TestDataGenerator.randomLongitude();

    return {
      id: uuidv4(),
      lat,
      lng,
      name: `Test Pin ${Math.floor(Math.random() * 1000)}`,
      type: TestDataGenerator.randomPinType(),
      address: `${Math.floor(Math.random() * 999)} Main Street`,
      cityVillage: TestDataGenerator.randomCity(),
      description: 'Test pin created for system testing',
      images: '[]', // JSON array string
      localImages: '[]', // JSON array string
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      // Don't set version - let backend assign it
      status: null,
      ...overrides,
    };
  }

  /**
   * Generate a test form
   */
  static generateForm(pinId?: string, overrides?: Partial<FormTestData>): FormTestData {
    return {
      id: uuidv4(),
      pinId: pinId || uuidv4(),
      name: `Test Form ${Math.floor(Math.random() * 1000)}`,
      village: TestDataGenerator.randomCity(),
      status: 'synced',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Sample health survey data
      canAttend: 'yes',
      brushTeeth: 'yes',
      handBeforeMeal: 'yes',
      handAfterToilet: 'yes',
      eatCleanFood: 'yes',
      ...overrides,
    };
  }

  /**
   * Generate multiple pins
   */
  static generatePins(count: number): PinTestData[] {
    return Array.from({ length: count }, () => TestDataGenerator.generatePin());
  }

  /**
   * Generate multiple forms
   */
  static generateForms(count: number, pinId?: string): FormTestData[] {
    return Array.from({ length: count }, () => TestDataGenerator.generateForm(pinId));
  }

  /**
   * Generate a conflicting update (same entity, different data)
   * Note: Don't auto-increment version - let backend handle it
   */
  static generateConflictingUpdate(
    original: PinTestData | FormTestData,
    deviceId: string
  ): PinTestData | FormTestData {
    if ('lat' in original) {
      // It's a pin
      return {
        ...original,
        name: `Updated by ${deviceId}`,
        description: `Conflicting update from ${deviceId}`,
        updatedAt: new Date().toISOString(),
        // Don't modify version - send what we have or let backend assign
      };
    } else {
      // It's a form
      return {
        ...original,
        name: `Updated by ${deviceId}`,
        village: `Village updated by ${deviceId}`,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Random helpers
   */
  private static randomLatitude(): number {
    // Cambodia: 10-15°N
    return 10 + Math.random() * 5;
  }

  private static randomLongitude(): number {
    // Cambodia: 102-108°E
    return 102 + Math.random() * 6;
  }

  private static randomPinType(): string {
    const types = ['hospital', 'school', 'temple', 'market', 'government'];
    return types[Math.floor(Math.random() * types.length)];
  }

  private static randomCity(): string {
    const cities = ['Phnom Penh', 'Siem Reap', 'Battambang', 'Sihanoukville', 'Kampot'];
    return cities[Math.floor(Math.random() * cities.length)];
  }
}
