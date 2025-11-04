/**
 * TEST: Idempotent Delete Operations
 * Validates duplicate delete requests succeed without errors.
 * INPUT: delete + key (sent 2x) → OUTPUT: pin deleted once, both requests succeed
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Idempotent Delete Operations', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Duplicate delete with same key.
   * INPUT: pin delete + key (sent 2x) → OUTPUT: pin deleted, both succeed
   */
  test('should handle duplicate delete requests', async () => {
    const pin = TestDataGenerator.generatePin();
    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const deleteKey = apiClient.generateIdempotencyKey();

    const delete1 = await apiClient.syncItem({
      idempotencyKey: deleteKey,
      entityType: 'pin',
      operation: 'delete',
      payload: { id: pin.id },
    });

    const delete2 = await apiClient.syncItem({
      idempotencyKey: deleteKey, // Same key
      entityType: 'pin',
      operation: 'delete',
      payload: { id: pin.id },
    });

    expect(delete1.success).toBe(true);
    expect(delete2.success).toBe(true);
    expect((delete1.data as any).deleted).toBe(true);
    expect((delete2.data as any).deleted).toBe(true);

    const isDeleted = await DatabaseHelper.verifyDeleted('pin', pin.id!);
    expect(isDeleted).toBe(true);
  });
});
