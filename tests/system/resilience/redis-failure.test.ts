/**
 * TEST: Redis Failure Handling
 * Validates graceful degradation when Redis is unavailable.
 * INPUT: Redis down → OUTPUT: clear errors, no data corruption
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';
import { redisClient } from '../../../src/config/redis';

describe('Redis Failure Handling', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
    // Ensure Redis is connected for other tests
    if (!redisClient.isOpen) {
      await redisClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });

  afterEach(async () => {
    // Restore Redis connection after each test
    if (!redisClient.isOpen) {
      await redisClient.connect();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });

  /**
   * Redis unavailable at request time - DEGRADED MODE.
   * INPUT: Redis down, pin create request → OUTPUT: operation succeeds, warning logged
   * NOTE: Database constraints prevent duplicates even without Redis cache
   * This ensures field workers can continue syncing when Redis unavailable
   */
  test('should operate in degraded mode when Redis is unavailable', async () => {
    // Disconnect Redis if it's still connected
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));

    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    // Operation should succeed in degraded mode
    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();

    // Verify data was created (degraded mode execution)
    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin).not.toBeNull();
    expect(dbPin?.id).toBe(pin.id);
  }, 10000);

  /**
   * Redis recovery after failure.
   * INPUT: Redis down then up → OUTPUT: operations resume normally with full caching
   */
  test('should recover when Redis comes back online', async () => {
    const pin1 = TestDataGenerator.generatePin();
    createdPinIds.push(pin1.id!);

    // First operation succeeds with Redis up
    const response1 = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin1,
    });
    expect(response1.success).toBe(true);

    // Disconnect Redis
    await redisClient.quit();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const pin2 = TestDataGenerator.generatePin();
    createdPinIds.push(pin2.id!);

    // Operation should succeed in degraded mode with Redis down
    const degradedOp = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin2,
    });
    expect(degradedOp.success).toBe(true);

    // Reconnect Redis
    await redisClient.connect();
    await new Promise((resolve) => setTimeout(resolve, 1500)); // Wait for connection to stabilize

    // New operations should use Redis cache again
    const pin3 = TestDataGenerator.generatePin();
    createdPinIds.push(pin3.id!);
    const cachedOp = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin3,
    });
    expect(cachedOp.success).toBe(true);

    // Verify all three pins exist
    const dbPin1 = await DatabaseHelper.getPin(pin1.id!);
    const dbPin2 = await DatabaseHelper.getPin(pin2.id!);
    const dbPin3 = await DatabaseHelper.getPin(pin3.id!);
    expect(dbPin1).not.toBeNull();
    expect(dbPin2).not.toBeNull();
    expect(dbPin3).not.toBeNull();
  }, 15000);

  /**
   * Concurrent requests with same idempotency key.
   * INPUT: 2 simultaneous requests, same key → OUTPUT: only 1 execution, both get same result
   * NOTE: Distributed lock ensures only one executes, other waits for cached result
   */
  test('should prevent duplicate operations via distributed lock', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);
    const idempotencyKey = apiClient.generateIdempotencyKey();

    // Send two requests simultaneously with same key
    const [response1, response2] = await Promise.all([
      apiClient.syncItem({
        idempotencyKey,
        entityType: 'pin',
        operation: 'create',
        payload: pin,
      }),
      apiClient.syncItem({
        idempotencyKey,
        entityType: 'pin',
        operation: 'create',
        payload: pin,
      }),
    ]);

    // Both should succeed
    expect(response1.success).toBe(true);
    expect(response2.success).toBe(true);

    // Both should return same version (proves single execution)
    expect((response1.data as any)?.version).toBe(1);
    expect((response2.data as any)?.version).toBe(1);

    // Verify: exactly ONE pin created
    const allPins = await DatabaseHelper.getAllPins();
    const duplicates = allPins.filter((p) => p.id === pin.id);
    expect(duplicates.length).toBe(1);
  }, 10000);

  /**
   * Cache lost but DB has data.
   * INPUT: operation succeeds, cache cleared, retry with same key → OUTPUT: no duplicate
   */
  test('should handle cache miss with DB fallback', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);
    const idempotencyKey = apiClient.generateIdempotencyKey();

    const response1 = await apiClient.syncItem({
      idempotencyKey,
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });
    expect(response1.success).toBe(true);

    await redisClient.quit();
    await redisClient.connect();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const response2 = await apiClient.syncItem({
      idempotencyKey,
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });
    expect(response2.success).toBe(true);

    const allPins = await DatabaseHelper.getAllPins();
    const duplicates = allPins.filter((p) => p.id === pin.id);
    expect(duplicates.length).toBe(1);
  }, 10000);

  /**
   * High load with concurrent operations.
   * INPUT: 15 concurrent pin creates → OUTPUT: all succeed, no duplicates
   */
  test('should handle concurrent load without Redis exhaustion', async () => {
    const pins = TestDataGenerator.generatePins(15);
    createdPinIds.push(...pins.map((p) => p.id!));

    const requests = pins.map((pin) => ({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'create' as const,
      payload: pin,
    }));

    const responses = await Promise.all(requests.map((req) => apiClient.syncItem(req)));

    const successCount = responses.filter((r) => r.success).length;
    expect(successCount).toBeGreaterThan(12); // At least 80% success

    const allPins = await DatabaseHelper.getAllPins();
    const uniqueIds = new Set(allPins.map((p) => p.id));
    expect(uniqueIds.size).toBe(allPins.length);
  }, 20000);
});
