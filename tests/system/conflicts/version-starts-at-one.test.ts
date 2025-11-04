/**
 * TEST: Version Starts at 1
 * Validates that new entities start at version 1, not version 2.
 * This test was added after fixing a bug where new entities were incorrectly
 * starting at version 2 because the backend always called getNextVersion().
 *
 * INPUT: create new pin/form → OUTPUT: version should be 1
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Version Starts at 1', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * CRITICAL: New pins should start at version 1.
   * Before fix: version was 2 (bug - getNextVersion() on non-existent entity)
   * After fix: version is 1 (correct - check if entity exists first)
   */
  test('should create new pin with version 1', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    expect(response.success).toBe(true);
    const version = (response.data as any).version;

    console.log(`📊 Created pin version: ${version}`);
    expect(version).toBe(1); // MUST be 1, not 2!

    // Verify in database too
    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.version).toBe(1);
  });

  /**
   * New forms should also start at version 1.
   */
  test('should create new form with version 1', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const form = TestDataGenerator.generateForm(pin.id);

    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'form',
      operation: 'create',
      payload: form,
    });

    expect(response.success).toBe(true);
    const version = (response.data as any).version;

    console.log(`📊 Created form version: ${version}`);
    expect(version).toBe(1); // MUST be 1, not 2!

    const dbForm = await DatabaseHelper.getForm(form.id!);
    expect(dbForm?.version).toBe(1);
  });

  /**
   * First update should increment to version 2.
   * Confirms that version increments work after starting at 1.
   */
  test('should increment from version 1 to 2 on first update', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    // Create pin (should be v1)
    const createResponse = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const createdPin = createResponse.data as any;
    expect(createdPin.version).toBe(1);

    // Update pin (should be v2)
    const updateResponse = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: { ...createdPin, name: 'Updated Name' },
    });

    const updatedPin = updateResponse.data as any;
    expect(updatedPin.version).toBe(2);

    console.log(`✅ Version sequence correct: 1 → 2`);
  });

  /**
   * Multiple creates should all start at version 1.
   * Ensures the fix works consistently for all new entities.
   */
  test('should create multiple entities all starting at version 1', async () => {
    const pins = TestDataGenerator.generatePins(5);
    createdPinIds.push(...pins.map((p) => p.id!));

    for (const pin of pins) {
      const response = await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'create',
        payload: pin,
      });

      expect(response.success).toBe(true);
      expect((response.data as any).version).toBe(1);
    }

    console.log(`✅ All 5 pins created with version 1`);
  });
});
