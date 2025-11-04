/**
 * TEST: Idempotent Update Operations
 * Validates duplicate update requests don't increment version multiple times.
 * INPUT: update + key (sent 2x) → OUTPUT: version increments once only
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Idempotent Update Operations', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Duplicate update with same key.
   * INPUT: pin update + key (sent 2x) → OUTPUT: version increments once, identical responses
   */
  test('should handle duplicate update requests', async () => {
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

    const update1 = await apiClient.syncItem({
      idempotencyKey: updateKey,
      entityType: 'pin',
      operation: 'update',
      payload: updatedPin,
    });

    const initialVersion = (update1.data as any).version;

    const update2 = await apiClient.syncItem({
      idempotencyKey: updateKey, // Same key
      entityType: 'pin',
      operation: 'update',
      payload: updatedPin,
    });

    expect(update1.success).toBe(true);
    expect(update2.success).toBe(true);
    expect((update2.data as any).version).toBe(initialVersion);

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.version).toBe(initialVersion);
  });
});
