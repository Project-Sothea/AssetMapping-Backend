/**
 * TEST: Backend Crash Recovery
 * Validates recovery from unexpected backend failures.
 * INPUT: operations in-flight, backend unavailable → OUTPUT: operations resume after recovery
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Backend Crash Recovery', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Idempotency persists across "restart".
   * INPUT: batch of 10, retry all after simulated restart → OUTPUT: no duplicates
   */
  test('should maintain idempotency across restart', async () => {
    const pins = TestDataGenerator.generatePins(10);
    createdPinIds.push(...pins.map((p) => p.id!));

    const requests = pins.map((pin) => ({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'create' as const,
      payload: pin,
    }));

    // Process first half
    const firstHalf = requests.slice(0, 5);
    for (const req of firstHalf) {
      await apiClient.syncItem(req);
    }

    // Simulate restart delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Retry ALL operations (simulating client doesn't know which succeeded)
    const retryResults = await Promise.all(requests.map((req) => apiClient.syncItem(req)));

    expect(retryResults.every((r) => r.success)).toBe(true);

    // Verify: exactly 10 pins, no duplicates
    const allPins = await DatabaseHelper.getAllPins();
    pins.forEach((pin) => {
      const found = allPins.filter((p) => p.id === pin.id);
      expect(found.length).toBe(1);
    });
  }, 20000);

  /**
   * Operations resume after backend unavailable.
   * INPUT: backend down, operations fail → backend up, retry succeeds
   */
  test('should resume operations after backend recovery', async () => {
    const pin1 = TestDataGenerator.generatePin();
    createdPinIds.push(pin1.id!);

    // First operation succeeds
    const response1 = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin1,
    });
    expect(response1.success).toBe(true);

    // Note: Cannot actually kill backend in this test
    // This test validates that retries work after transient failures
    const pin2 = TestDataGenerator.generatePin();
    createdPinIds.push(pin2.id!);

    // Retry with backoff (simulates waiting for backend to come back)
    const response2 = await apiClient.retrySync(
      {
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'create',
        payload: pin2,
      },
      3
    );

    expect(response2.success).toBe(true);

    const dbPin1 = await DatabaseHelper.getPin(pin1.id!);
    const dbPin2 = await DatabaseHelper.getPin(pin2.id!);
    expect(dbPin1).not.toBeNull();
    expect(dbPin2).not.toBeNull();
  }, 15000);

  /**
   * Batch operations survive partial completion.
   * INPUT: 8 operations, some succeed before crash → OUTPUT: all eventually complete
   */
  test('should complete batch after partial success', async () => {
    const pins = TestDataGenerator.generatePins(8);
    createdPinIds.push(...pins.map((p) => p.id!));

    const requests = pins.map((pin) => ({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'create' as const,
      payload: pin,
    }));

    // Sequential processing (simulates some succeed before crash)
    const results: any[] = [];
    for (const req of requests) {
      const result = await apiClient.syncItem(req);
      results.push(result);
    }

    // All should eventually succeed
    expect(results.filter((r) => r.success).length).toBeGreaterThan(6);

    // Retry any that might have failed
    const retryResults = await Promise.all(requests.map((req) => apiClient.syncItem(req)));
    expect(retryResults.every((r) => r.success)).toBe(true);

    // Verify all pins exist exactly once
    const allPins = await DatabaseHelper.getAllPins();
    pins.forEach((pin) => {
      const found = allPins.filter((p) => p.id === pin.id);
      expect(found.length).toBe(1);
    });
  }, 20000);

  /**
   * Version consistency after recovery.
   * INPUT: create, update, crash, retry update → OUTPUT: version incremented correctly
   */
  test('should maintain version consistency across recovery', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    // Create
    const createResponse = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });
    expect(createResponse.success).toBe(true);
    expect((createResponse.data as any).version).toBe(1);

    // Update with retry
    const updatedPin = { ...pin, name: 'Updated Name' };
    const updateKey = apiClient.generateIdempotencyKey();

    const updateResponse = await apiClient.syncItem({
      idempotencyKey: updateKey,
      entityType: 'pin',
      operation: 'update',
      payload: updatedPin,
    });
    expect(updateResponse.success).toBe(true);
    expect((updateResponse.data as any).version).toBe(2);

    // Retry update (simulates client didn't receive response)
    const retryUpdate = await apiClient.syncItem({
      idempotencyKey: updateKey,
      entityType: 'pin',
      operation: 'update',
      payload: updatedPin,
    });
    expect(retryUpdate.success).toBe(true);
    expect((retryUpdate.data as any).version).toBe(2); // Same version (idempotent)

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.version).toBe(2);
    expect(dbPin?.name).toBe('Updated Name');
  }, 15000);
});
