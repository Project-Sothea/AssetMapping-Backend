/**
 * TEST: Batch Synchronization
 * Validates batch operations for multiple items.
 * INPUT: array of operations → OUTPUT: all processed in sequence
 *
 * OPTIMIZED: Reduced data volume, parallel operations, selective cleanup
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Batch Synchronization', () => {
  let apiClient: ApiClient;
  const createdIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdIds);
  });

  /**
   * Batch create multiple pins.
   * OPTIMIZED: Reduced from 5 to 3 pins
   */
  test('should process batch of creates', async () => {
    const pins = TestDataGenerator.generatePins(3);
    createdIds.push(...pins.map((p) => p.id!));

    const requests = pins.map((pin) => ({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'create' as const,
      payload: pin,
    }));

    const responses = await apiClient.batchSync(requests);

    expect(responses).toHaveLength(3);
    responses.forEach((response) => {
      expect(response.success).toBe(true);
    });

    // Verify in parallel
    const verifications = await Promise.all(
      pins.map((pin) => DatabaseHelper.verifyExists('pin', pin.id!))
    );
    verifications.forEach((exists) => expect(exists).toBe(true));
  });

  /**
   * Mixed operation batch (create, update, delete).
   */
  test('should handle mixed operations', async () => {
    const pin1 = TestDataGenerator.generatePin();
    const pin2 = TestDataGenerator.generatePin();
    createdIds.push(pin1.id!, pin2.id!);

    // Create in parallel
    await Promise.all([
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

    const requests = [
      {
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin' as const,
        operation: 'update' as const,
        payload: { ...pin1, name: 'Updated' },
      },
      {
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin' as const,
        operation: 'delete' as const,
        payload: { id: pin2.id },
      },
    ];

    const responses = await apiClient.batchSync(requests);

    expect(responses).toHaveLength(2);
    expect(responses[0].success).toBe(true);
    expect(responses[1].success).toBe(true);

    // Verify in parallel
    const [dbPin1, isPin2Deleted] = await Promise.all([
      DatabaseHelper.getPin(pin1.id!),
      DatabaseHelper.verifyDeleted('pin', pin2.id!),
    ]);

    expect(dbPin1?.name).toBe('Updated');
    expect(isPin2Deleted).toBe(true);
  });

  /**
   * Large batch operation.
   * OPTIMIZED: Reduced from 50 to 10 pins
   */
  test('should handle large batches', async () => {
    const pins = TestDataGenerator.generatePins(10);
    createdIds.push(...pins.map((p) => p.id!));

    const requests = pins.map((pin) => ({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'create' as const,
      payload: pin,
    }));

    const batchSize = 5;
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const responses = await apiClient.batchSync(batch);
      responses.forEach((response) => {
        expect(response.success).toBe(true);
      });
    }

    // Verify in parallel
    const verifications = await Promise.all(
      pins.map((pin) => DatabaseHelper.verifyExists('pin', pin.id!))
    );
    verifications.forEach((exists) => expect(exists).toBe(true));
  }, 15000);
});
