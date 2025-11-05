/**
 * TEST: Long Offline Period Handling
 * Validates behavior when device is offline for extended periods.
 * INPUT: queued operations, large payloads, expired keys → OUTPUT: graceful handling
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Long Offline Period', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Large batch processing (simulating week offline).
   * INPUT: 50 operations queued → OUTPUT: all process successfully
   */
  test('should process large queued batch', async () => {
    const pins = TestDataGenerator.generatePins(50);
    createdPinIds.push(...pins.map((p) => p.id!));

    const requests = pins.map((pin) => ({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'create' as const,
      payload: pin,
    }));

    // Process in chunks of 10 (simulating chunked sync)
    const chunkSize = 10;
    for (let i = 0; i < requests.length; i += chunkSize) {
      const chunk = requests.slice(i, i + chunkSize);
      const results = await Promise.all(chunk.map((req) => apiClient.syncItem(req)));

      const successCount = results.filter((r) => r.success).length;
      expect(successCount).toBe(chunk.length);
    }

    // Verify all pins created
    const allPins = await DatabaseHelper.getAllPins();
    pins.forEach((pin) => {
      const found = allPins.filter((p) => p.id === pin.id);
      expect(found.length).toBe(1);
    });
  }, 60000);

  /**
   * Mixed operations in batch.
   * INPUT: creates, updates, deletes → OUTPUT: all succeed in order
   */
  test('should handle mixed operations in batch', async () => {
    // Create 3 pins
    const pins = TestDataGenerator.generatePins(3);
    createdPinIds.push(...pins.map((p) => p.id!));

    // First, create all pins
    const createOps = pins.map((pin) => ({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'create' as const,
      payload: pin,
    }));

    const createResults = await Promise.all(createOps.map((op) => apiClient.syncItem(op)));
    expect(createResults.every((r) => r.success)).toBe(true);

    // Wait for creates to settle
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Then perform updates and delete
    const updateOp = {
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'update' as const,
      payload: { ...pins[0], name: 'Updated Name' },
    };

    const deleteOp = {
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'delete' as const,
      payload: { id: pins[1].id },
    };

    const [updateResult, deleteResult] = await Promise.all([
      apiClient.syncItem(updateOp),
      apiClient.syncItem(deleteOp),
    ]);

    expect(updateResult.success).toBe(true);
    expect(deleteResult.success).toBe(true);

    // Wait for operations to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify final state
    const pin0 = await DatabaseHelper.getPin(pins[0].id!);
    const pin1 = await DatabaseHelper.getPin(pins[1].id!);
    const pin2 = await DatabaseHelper.getPin(pins[2].id!);

    expect(pin0?.name).toBe('Updated Name');
    expect(pin0?.version).toBe(2);
    expect(pin1?.deletedAt).not.toBeNull();
    expect(pin2?.version).toBe(1);
  }, 30000);

  /**
   * Retry batch after partial success.
   * INPUT: batch partially succeeds, retry all → OUTPUT: no duplicates
   */
  test('should handle partial batch retry', async () => {
    const pins = TestDataGenerator.generatePins(10);
    createdPinIds.push(...pins.map((p) => p.id!));

    const requests = pins.map((pin) => ({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'create' as const,
      payload: pin,
    }));

    // First attempt: process first 5
    const firstBatch = requests.slice(0, 5);
    await Promise.all(firstBatch.map((req) => apiClient.syncItem(req)));

    // Second attempt: retry all (including successful ones)
    const retryResults = await Promise.all(requests.map((req) => apiClient.syncItem(req)));
    expect(retryResults.every((r) => r.success)).toBe(true);

    // Verify: exactly 10 pins, no duplicates
    const allPins = await DatabaseHelper.getAllPins();
    pins.forEach((pin) => {
      const found = allPins.filter((p) => p.id === pin.id);
      expect(found.length).toBe(1);
    });
  }, 30000);

  /**
   * Sequential operations with delays.
   * INPUT: operations spaced out over time → OUTPUT: all succeed
   */
  test('should handle operations with delays between', async () => {
    const pins = TestDataGenerator.generatePins(5);
    createdPinIds.push(...pins.map((p) => p.id!));

    for (const pin of pins) {
      const result = await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'create',
        payload: pin,
      });
      expect(result.success).toBe(true);

      // Simulate delay between operations
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Verify all created
    for (const pin of pins) {
      const exists = await DatabaseHelper.verifyExists('pin', pin.id!);
      expect(exists).toBe(true);
    }
  }, 20000);

  /**
   * High volume updates on same entity.
   * INPUT: 10 updates to same pin → OUTPUT: final version is 11
   */
  test('should handle rapid updates to same entity', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    // Create pin
    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    // Perform 10 updates
    for (let i = 1; i <= 10; i++) {
      const result = await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'update',
        payload: { ...pin, name: `Update ${i}` },
      });
      expect(result.success).toBe(true);
    }

    // Verify final state
    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.name).toBe('Update 10');
    expect(dbPin?.version).toBe(11); // 1 create + 10 updates
  }, 30000);
});
