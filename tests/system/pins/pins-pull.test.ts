/**
 * TEST: Pin Pull/Fetch Operations
 * Validates fetching pins from server.
 * INPUT: GET request → OUTPUT: array of pins with correct structure
 *
 * OPTIMIZED: Uses pre-seeded fixtures instead of creating test data
 */

import { ApiClient } from '../../helpers/api-client';
import { FIXTURES, FixtureManager } from '../../helpers/fixtures';

describe('Pin Pull', () => {
  let apiClient: ApiClient;

  beforeAll(async () => {
    apiClient = new ApiClient();
    // Verify fixtures are seeded
    const fixturesExist = await FixtureManager.verifyFixtures();
    if (!fixturesExist) {
      throw new Error('Fixtures not properly seeded');
    }
  });

  /**
   * Fetching all pins - uses pre-seeded fixtures
   */
  test('should fetch all pins', async () => {
    const response = await apiClient.getPins();

    expect(response.success).toBe(true);
    expect(Array.isArray(response.data)).toBe(true);
    expect((response.data as any).length).toBeGreaterThanOrEqual(5);

    // Verify specific fixture exists
    const hospital = (response.data as any).find(
      (p: any) => p.id === FIXTURES.READONLY_PINS.HOSPITAL_1.id
    );
    expect(hospital).toBeDefined();
  });

  /**
   * Fetched pins have correct structure
   */
  test('should return pins with correct structure', async () => {
    const response = await apiClient.getPins();
    const pins = response.data as any[];

    expect(pins.length).toBeGreaterThan(0);

    const pin = pins[0];
    expect(pin).toHaveProperty('id');
    expect(pin).toHaveProperty('lat');
    expect(pin).toHaveProperty('lng');
    expect(pin).toHaveProperty('version');
    expect(pin).toHaveProperty('createdAt');
    expect(pin).toHaveProperty('updatedAt');
  });

  /**
   * Data integrity check using fixtures
   */
  test('should maintain data integrity', async () => {
    const response = await apiClient.getPins();
    const pulledPin = (response.data as any).find(
      (p: any) => p.id === FIXTURES.READONLY_PINS.HOSPITAL_1.id
    );

    expect(pulledPin.name).toBe(FIXTURES.READONLY_PINS.HOSPITAL_1.name);
    expect(pulledPin.type).toBe(FIXTURES.READONLY_PINS.HOSPITAL_1.type);
    expect(pulledPin.lat).toBe(FIXTURES.READONLY_PINS.HOSPITAL_1.lat);
    expect(pulledPin.lng).toBe(FIXTURES.READONLY_PINS.HOSPITAL_1.lng);
  });

  /**
   * Performance check - should be fast with fixtures
   */
  test('should handle fetching efficiently', async () => {
    const startTime = Date.now();
    const response = await apiClient.getPins();
    const endTime = Date.now();

    expect(response.success).toBe(true);
    expect((response.data as any).length).toBeGreaterThanOrEqual(5);
    expect(endTime - startTime).toBeLessThan(2000);
  });
});
