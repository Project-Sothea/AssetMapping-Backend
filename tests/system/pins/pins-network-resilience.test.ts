/**
 * TEST: Network Resilience
 * Validates system behavior under poor network conditions.
 * Simulates rural Cambodia connectivity: intermittent, high latency, partial failures.
 */

import { ApiClient, type ApiResponse } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';
import { ImageHelper } from '../../helpers/image-helper';
import supabase from '../../../src/config/supabase';

describe('Network Resilience', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];
  let originalUpsert: any;

  beforeAll(() => {
    apiClient = new ApiClient();
  });

  beforeEach(() => {
    originalUpsert = supabase.from('pins').upsert;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Stable connection operations.
   * INPUT: create pin → OUTPUT: succeeds immediately
   */
  test('should succeed on stable connection', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    expect(response.success).toBe(true);

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin).not.toBeNull();
  });

  /**
   * High latency operations.
   * INPUT: slow network (100ms delay) → OUTPUT: succeeds despite delay
   */
  test('should handle high latency operations', async () => {
    const pin = ImageHelper.createPinWithImages(TestDataGenerator.generatePin(), 2);
    createdPinIds.push(pin.id!);

    jest.spyOn(supabase.from('pins'), 'upsert').mockImplementation(
      () =>
        ({
          select: () => ({
            single: async () => {
              await new Promise((resolve) => setTimeout(resolve, 100));
              return originalUpsert.call(supabase.from('pins')).select().single();
            },
          }),
        }) as any
    );

    const startTime = Date.now();
    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });
    const duration = Date.now() - startTime;

    expect(response.success).toBe(true);
    expect(duration).toBeGreaterThan(90);

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.images).toBe(pin.images);
  });

  /**
   * Batch operations complete successfully.
   * INPUT: 6 pins → OUTPUT: all succeed
   */
  test('should complete batch operations successfully', async () => {
    const pins = TestDataGenerator.generatePins(6);
    createdPinIds.push(...pins.map((p) => p.id!));

    const results = await apiClient.batchSync(
      pins.map((pin) => ({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin' as const,
        operation: 'create' as const,
        payload: pin,
      }))
    );

    const successCount = results.filter((r) => r.success).length;
    expect(successCount).toBe(6);

    for (const pin of pins) {
      const dbPin = await DatabaseHelper.getPin(pin.id!);
      expect(dbPin).not.toBeNull();
    }
  });

  /**
   * Multiple create operations in sequence.
   * INPUT: 6 pins in 3 cycles → OUTPUT: all succeed
   */
  test('should handle multiple sequential operations', async () => {
    const allPins: any[] = [];

    for (let cycle = 0; cycle < 3; cycle++) {
      const cyclePins = TestDataGenerator.generatePins(2).map((p) => ({
        ...p,
        name: `Cycle ${cycle + 1} - ${p.name}`,
      }));
      allPins.push(...cyclePins);
      createdPinIds.push(...cyclePins.map((p) => p.id!));

      for (const pin of cyclePins) {
        const response = await apiClient.syncItem({
          idempotencyKey: apiClient.generateIdempotencyKey(),
          entityType: 'pin',
          operation: 'create',
          payload: pin,
        });

        expect(response.success).toBe(true);
      }
    }

    // All pins should be in database
    for (const pin of allPins) {
      const dbPin = await DatabaseHelper.getPin(pin.id!);
      expect(dbPin).not.toBeNull();
    }
  });

  /**
   * Idempotency during retry storms.
   * INPUT: same request 5 times → OUTPUT: all succeed, only 1 DB entry
   */
  test('should respect idempotency during retry storms', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    const idempotencyKey = apiClient.generateIdempotencyKey();

    const results: ApiResponse[] = [];
    for (let i = 0; i < 5; i++) {
      const response = await apiClient.syncItem({
        idempotencyKey,
        entityType: 'pin',
        operation: 'create',
        payload: pin,
      });
      results.push(response);
      await apiClient.delay(50);
    }

    expect(results.every((r) => r.success)).toBe(true);

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin).not.toBeNull();
    expect(dbPin?.version).toBe(1);

    const allPins = await DatabaseHelper.getAllPins();
    const matchingPins = allPins.filter((p) => p.name === pin.name);
    expect(matchingPins.length).toBe(1);
  });

  /**
   * Mixed success/failure in batch with images.
   * INPUT: 5 pins with images, 50% failure rate → OUTPUT: isolated failures
   */
  test('should isolate failures in batch operations with images', async () => {
    const pins = TestDataGenerator.generatePins(5).map((pin) =>
      ImageHelper.createPinWithImages(pin, 2)
    );
    createdPinIds.push(...pins.map((p) => p.id!));

    jest.spyOn(supabase.from('pins'), 'upsert').mockImplementation(() => {
      const shouldFail = Math.random() < 0.5;
      if (shouldFail) {
        throw new Error('Network unstable');
      }
      return originalUpsert.call(supabase.from('pins'));
    });

    const results = await apiClient.batchSync(
      pins.map((pin) => ({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin' as const,
        operation: 'create' as const,
        payload: pin,
      }))
    );

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    expect(successCount + failureCount).toBe(5);
    expect(successCount).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) {
      const dbPin = await DatabaseHelper.getPin(pins[i].id!);
      if (results[i].success) {
        expect(dbPin).not.toBeNull();
        expect(dbPin?.images).toBe(pins[i].images);
      } else {
        expect(dbPin).toBeNull();
      }
    }
  });

  /**
   * Large queue processing after prolonged offline.
   * INPUT: 15 operations queued → OUTPUT: all process successfully
   */
  test('should process large queue after prolonged offline period', async () => {
    const pins = TestDataGenerator.generatePins(15).map((pin, index) => ({
      ...pin,
      name: `Queued ${index + 1}`,
      images: JSON.stringify(index % 3 === 0 ? ImageHelper.generateImageUrls(pin.id!, 2) : []),
    }));
    createdPinIds.push(...pins.map((p) => p.id!));

    const results = await apiClient.batchSync(
      pins.map((pin) => ({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin' as const,
        operation: 'create' as const,
        payload: pin,
      }))
    );

    expect(results.every((r) => r.success)).toBe(true);

    for (const pin of pins) {
      const dbPin = await DatabaseHelper.getPin(pin.id!);
      expect(dbPin).not.toBeNull();
      expect(dbPin?.images).toBe(pin.images);
    }
  });
});
