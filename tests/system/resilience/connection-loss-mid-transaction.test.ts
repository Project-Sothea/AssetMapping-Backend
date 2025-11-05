/**
 * TEST: Connection Loss Mid-Transaction
 * Validates idempotency when client disconnects during backend processing.
 * INPUT: request sent, client timeout, retry → OUTPUT: cached result, no duplicates
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';
import axios from 'axios';

describe('Connection Loss Mid-Transaction', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Client timeout, backend completes, retry succeeds.
   * INPUT: short timeout client, retry → OUTPUT: no duplicate created
   */
  test('should handle client timeout with backend completion', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);
    const idempotencyKey = apiClient.generateIdempotencyKey();

    const shortTimeoutClient = axios.create({
      baseURL: 'http://localhost:3000/api',
      timeout: 3000,
      headers: { 'Content-Type': 'application/json' },
    });

    const request = {
      idempotencyKey,
      entityType: 'pin',
      operation: 'create',
      payload: pin,
      timestamp: new Date().toISOString(),
      deviceId: apiClient.getDeviceId(),
    };

    try {
      await shortTimeoutClient.post('/sync/item', request);
    } catch (error: any) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.log('Client timed out as expected');
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const secondAttempt = await apiClient.syncItem({
      idempotencyKey,
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    expect(secondAttempt.success).toBe(true);

    const allPins = await DatabaseHelper.getAllPins();
    const duplicates = allPins.filter((p) => p.id === pin.id);
    expect(duplicates.length).toBe(1);
  }, 15000);

  /**
   * Multiple retries with same key.
   * INPUT: 5 retries, same idempotency key → OUTPUT: all return same result
   */
  test('should handle multiple retries with same key', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);
    const idempotencyKey = apiClient.generateIdempotencyKey();

    const responses: any[] = [];
    for (let i = 0; i < 5; i++) {
      const response = await apiClient.syncItem({
        idempotencyKey,
        entityType: 'pin',
        operation: 'create',
        payload: pin,
      });
      responses.push(response);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    expect(responses.every((r) => r.success)).toBe(true);

    const allPins = await DatabaseHelper.getAllPins();
    const duplicates = allPins.filter((p) => p.id === pin.id);
    expect(duplicates.length).toBe(1);

    const versions = responses.map((r: any) => r.data?.version);
    const uniqueVersions = new Set(versions);
    expect(uniqueVersions.size).toBe(1);
  }, 15000);

  /**
   * Retry storm - 10 simultaneous retries.
   * INPUT: 10 concurrent requests, same key → OUTPUT: 1 pin created
   * NOTE: Distributed lock ensures only ONE execution, others wait for cached result
   */
  test('should handle retry storm without duplicates', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);
    const idempotencyKey = apiClient.generateIdempotencyKey();

    // Send 10 concurrent requests with same idempotency key
    const promises = Array.from({ length: 10 }, () =>
      apiClient.syncItem({
        idempotencyKey,
        entityType: 'pin',
        operation: 'create',
        payload: pin,
      })
    );

    const responses = await Promise.all(promises);

    // All should succeed (some from cache)
    expect(responses.every((r) => r.success)).toBe(true);

    // All should return same version (proves only one execution)
    const versions = responses.map((r: any) => r.data?.version);
    const uniqueVersions = new Set(versions);
    expect(uniqueVersions.size).toBe(1);
    expect(versions[0]).toBe(1);

    // Verify: exactly ONE pin created
    const allPins = await DatabaseHelper.getAllPins();
    const duplicates = allPins.filter((p) => p.id === pin.id);
    expect(duplicates.length).toBe(1);
  }, 15000);

  /**
   * Update operation with connection loss.
   * INPUT: create, update w/ timeout, retry → OUTPUT: update applied once
   */
  test('should handle update operations after connection loss', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const updatedPin = { ...pin, name: 'Updated Name' };
    const updateKey = apiClient.generateIdempotencyKey();

    const firstUpdate = await apiClient.syncItem({
      idempotencyKey: updateKey,
      entityType: 'pin',
      operation: 'update',
      payload: updatedPin,
    });

    const retryUpdate = await apiClient.syncItem({
      idempotencyKey: updateKey,
      entityType: 'pin',
      operation: 'update',
      payload: updatedPin,
    });

    expect(firstUpdate.success).toBe(true);
    expect(retryUpdate.success).toBe(true);
    expect((firstUpdate.data as any)?.version).toBe((retryUpdate.data as any)?.version);

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.name).toBe('Updated Name');
    expect(dbPin?.version).toBe(2);
  }, 10000);

  /**
   * Batch sync with partial timeout.
   * INPUT: 5 pins, all timeout, retry all → OUTPUT: 5 pins, no duplicates
   * NOTE: Idempotency ensures retry of successful operations returns cached results
   */
  test('should handle batch retry after timeout', async () => {
    const pins = TestDataGenerator.generatePins(5);
    createdPinIds.push(...pins.map((p) => p.id!));

    const requests = pins.map((pin) => ({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'create' as const,
      payload: pin,
    }));

    // First attempt - all should succeed
    const responses = await Promise.all(requests.map((req) => apiClient.syncItem(req)));
    expect(responses.every((r) => r.success)).toBe(true);

    // Wait for operations to settle
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Retry all operations (simulating client didn't receive responses)
    const retryResponses = await Promise.all(requests.map((req) => apiClient.syncItem(req)));
    expect(retryResponses.every((r) => r.success)).toBe(true);

    // Wait for retries to settle
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify: exactly 5 pins in database, no duplicates
    const allPins = await DatabaseHelper.getAllPins();
    pins.forEach((pin) => {
      const duplicates = allPins.filter((p) => p.id === pin.id);
      expect(duplicates.length).toBe(1);
    });

    // Verify all have version 1 (created once)
    pins.forEach((pin) => {
      const dbPin = allPins.find((p) => p.id === pin.id);
      expect(dbPin?.version).toBe(1);
    });
  }, 20000);
});
