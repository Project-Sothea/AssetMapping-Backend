/**
 * TEST: Idempotent Create Operations
 * Validates that duplicate create requests don't create duplicates.
 * INPUT: same create request sent multiple times → OUTPUT: only 1 record created
 *
 * OPTIMIZED: Selective cleanup, reduced retry count
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';
import { FIXTURES } from '../../helpers/fixtures';

describe('Idempotent Create Operations', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];
  const createdFormIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
    await DatabaseHelper.cleanupSpecific('form', createdFormIds);
  });

  /**
   * Duplicate create with same key returns same result.
   */
  test('should handle duplicate create requests', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);
    const idempotencyKey = apiClient.generateIdempotencyKey();

    const response1 = await apiClient.syncItem({
      idempotencyKey,
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const response2 = await apiClient.syncItem({
      idempotencyKey, // Same key
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    expect(response1.success).toBe(true);
    expect(response2.success).toBe(true);
    expect((response1.data as any).id).toBe((response2.data as any).id);
    expect((response1.data as any).version).toBe((response2.data as any).version);

    const allPins = await DatabaseHelper.getAllPins();
    const matchingPins = allPins.filter((p) => p.id === pin.id);
    expect(matchingPins.length).toBe(1);
  });

  /**
   * Multiple retries with same key.
   * OPTIMIZED: Reduced from 5 to 3 retries, uses fixture pin
   */
  test('should handle multiple retries', async () => {
    const form = TestDataGenerator.generateForm(FIXTURES.READONLY_PINS.HOSPITAL_1.id);
    createdFormIds.push(form.id!);
    const idempotencyKey = apiClient.generateIdempotencyKey();
    const responses: Array<{ success: boolean; data?: any; error?: string }> = [];

    for (let i = 0; i < 3; i++) {
      const response = await apiClient.syncItem({
        idempotencyKey,
        entityType: 'form',
        operation: 'create',
        payload: form,
      });
      responses.push(response);
    }

    responses.forEach((response) => {
      expect(response.success).toBe(true);
      expect((response.data as any).id).toBe(form.id);
    });

    const allForms = await DatabaseHelper.getAllForms();
    const matchingForms = allForms.filter((f) => f.id === form.id);
    expect(matchingForms.length).toBe(1);
  });

  /**
   * Different keys create separate records.
   */
  test('should treat different keys as separate operations', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);
    const key1 = apiClient.generateIdempotencyKey();
    const key2 = apiClient.generateIdempotencyKey();

    const response1 = await apiClient.syncItem({
      idempotencyKey: key1,
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const response2 = await apiClient.syncItem({
      idempotencyKey: key2,
      entityType: 'pin',
      operation: 'create',
      payload: { ...pin, name: 'Different Update' },
    });

    expect(response1.success).toBe(true);
    expect(response2.success).toBe(true);

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.name).toBe('Different Update');
  });

  /**
   * Concurrent creates with different keys.
   */
  test('should handle concurrent different operations', async () => {
    const pin1 = TestDataGenerator.generatePin();
    const pin2 = TestDataGenerator.generatePin();
    createdPinIds.push(pin1.id!, pin2.id!);

    const [response1, response2] = await Promise.all([
      apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'create',
        payload: pin1,
      }),
      apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'create',
        payload: pin2,
      }),
    ]);

    expect(response1.success).toBe(true);
    expect(response2.success).toBe(true);

    const [exists1, exists2] = await Promise.all([
      DatabaseHelper.verifyExists('pin', pin1.id!),
      DatabaseHelper.verifyExists('pin', pin2.id!),
    ]);
    expect(exists1).toBe(true);
    expect(exists2).toBe(true);
  });
});
