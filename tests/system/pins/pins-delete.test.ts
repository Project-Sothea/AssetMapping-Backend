/**
 * TEST: Pin Deletion
 * Validates soft/hard deletion of pins.
 * INPUT: existing pin → OUTPUT: pin marked deleted or removed from DB
 *
 * OPTIMIZED: Selective cleanup, reduced data volume
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Pin Deletion', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Deleting an existing pin.
   * INPUT: pin id → OUTPUT: pin marked as deleted
   */
  test('should delete a pin', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'delete',
      payload: { id: pin.id },
    });

    expect(response.success).toBe(true);
    expect((response.data as any).deleted).toBe(true);

    const isDeleted = await DatabaseHelper.verifyDeleted('pin', pin.id!);
    expect(isDeleted).toBe(true);
  });

  /**
   * Deleting multiple pins independently.
   * OPTIMIZED: Reduced from 3 to 2 pins
   */
  test('should delete multiple pins', async () => {
    const pins = TestDataGenerator.generatePins(2);
    createdPinIds.push(...pins.map((p) => p.id!));

    for (const pin of pins) {
      await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'create',
        payload: pin,
      });
    }

    for (const pin of pins) {
      const response = await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'delete',
        payload: { id: pin.id },
      });
      expect(response.success).toBe(true);
    }

    for (const pin of pins) {
      const isDeleted = await DatabaseHelper.verifyDeleted('pin', pin.id!);
      expect(isDeleted).toBe(true);
    }
  });
});
