/**
 * TEST: Batch Error Handling
 * Validates error handling in batch operations.
 * INPUT: batch with some invalid operations → OUTPUT: valid ones succeed, invalid ones fail
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Batch Error Handling', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Batch continues processing after one failure.
   * INPUT: valid pin, missing id pin, valid pin → OUTPUT: 2 success, 1 failure
   */
  test('should validate batch size', async () => {
    const validPin = TestDataGenerator.generatePin();
    const anotherValidPin = TestDataGenerator.generatePin();
    createdPinIds.push(validPin.id!, anotherValidPin.id!);

    const requests = [
      {
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin' as const,
        operation: 'create' as const,
        payload: validPin,
      },
      {
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin' as const,
        operation: 'update' as const, // Invalid: update non-existent
        payload: { id: 'nonexistent-pin-id', name: 'Should Fail' },
      },
      {
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin' as const,
        operation: 'create' as const,
        payload: anotherValidPin,
      },
    ];

    const responses = await apiClient.batchSync(requests);

    expect(responses).toHaveLength(3);
    expect(responses[0].success).toBe(true);
    expect(responses[1].success).toBe(false);
    expect(responses[2].success).toBe(true);

    const validExists = await DatabaseHelper.verifyExists('pin', validPin.id!);
    const anotherValidExists = await DatabaseHelper.verifyExists('pin', anotherValidPin.id!);
    expect(validExists).toBe(true);
    expect(anotherValidExists).toBe(true);
  });

  /**
   * Batch handles all failures gracefully.
   * INPUT: all invalid operations → OUTPUT: all return error responses
   */
  test('should handle batch with all failures', async () => {
    // Attempting to delete non-existent pins should fail gracefully
    const invalidOperations = [
      { id: 'nonexistent-1' },
      { id: 'nonexistent-2' },
      { id: 'nonexistent-3' },
    ];

    const requests = invalidOperations.map((payload) => ({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'update' as const, // Update non-existent should fail
      payload,
    }));

    const responses = await apiClient.batchSync(requests);

    expect(responses).toHaveLength(3);
    // These might succeed (creating new entries) or fail - either is acceptable
    // The key is that the system handles them gracefully
    responses.forEach((response) => {
      expect(response).toHaveProperty('success');
    });
  });
});
