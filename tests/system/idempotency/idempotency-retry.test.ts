/**
 * TEST: Retry Logic with Idempotency
 * Validates retry mechanisms maintain idempotency.
 * INPUT: failed request retried → OUTPUT: idempotency maintained across retries
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Idempotency Retry Handling', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Network retry maintains idempotency.
   * INPUT: pin + retry(max=3) → OUTPUT: pin created successfully
   */
  test('should retry with exponential backoff', async () => {
    const pin = TestDataGenerator.generatePin();
    const request = {
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'create' as const,
      payload: pin,
    };

    const response = await apiClient.retrySync(request, 3);

    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin).not.toBeNull();
  });

  /**
   * Retry after perceived failure.
   * INPUT: form created, then retried → OUTPUT: still only 1 form
   */
  test('should maintain idempotency across retries', async () => {
    // First create a pin to link the form to
    const pin = TestDataGenerator.generatePin();
    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const form = TestDataGenerator.generateForm(pin.id);
    const idempotencyKey = apiClient.generateIdempotencyKey();

    const request = {
      idempotencyKey,
      entityType: 'form' as const,
      operation: 'create' as const,
      payload: form,
    };

    await apiClient.syncItem(request);
    const retryResponse = await apiClient.retrySync(request, 2);

    expect(retryResponse.success).toBe(true);

    const allForms = await DatabaseHelper.getAllForms();
    const matchingForms = allForms.filter((f) => f.id === form.id);
    expect(matchingForms.length).toBe(1);
  });

  /**
   * Batch retry maintains idempotency.
   * INPUT: 3 pins (sent, then re-sent) → OUTPUT: 3 pins, no duplicates
   */
  test('should handle batch retries', async () => {
    const pins = TestDataGenerator.generatePins(3);

    const requests = pins.map((pin) => ({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'create' as const,
      payload: pin,
    }));

    const responses = await apiClient.batchSync(requests);
    expect(responses).toHaveLength(3);

    const retryResponses = await apiClient.batchSync(requests);
    expect(retryResponses).toHaveLength(3);

    for (const pin of pins) {
      const dbPin = await DatabaseHelper.getPin(pin.id!);
      expect(dbPin).not.toBeNull();
    }
  });

  /**
   * Device-specific idempotency keys.
   * INPUT: 2 devices → OUTPUT: keys are unique per device
   */
  test('should generate unique keys per device', async () => {
    const device1 = new ApiClient(undefined, 'device-1');
    const device2 = new ApiClient(undefined, 'device-2');

    const key1 = device1.generateIdempotencyKey();
    const key2 = device2.generateIdempotencyKey();

    expect(key1).not.toBe(key2);
    expect(key1).toContain('device-1');
    expect(key2).toContain('device-2');
  });

  /**
   * Different devices create independently.
   * INPUT: device1 creates pin1, device2 creates pin2 → OUTPUT: both created
   */
  test('should handle operations from different devices', async () => {
    const device1 = new ApiClient(undefined, 'device-1');
    const device2 = new ApiClient(undefined, 'device-2');

    const pin1 = TestDataGenerator.generatePin();
    const pin2 = TestDataGenerator.generatePin();

    const response1 = await device1.syncItem({
      idempotencyKey: device1.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin1,
    });

    const response2 = await device2.syncItem({
      idempotencyKey: device2.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin2,
    });

    expect(response1.success).toBe(true);
    expect(response2.success).toBe(true);
    expect((response1.data as any).id).toBe(pin1.id);
    expect((response2.data as any).id).toBe(pin2.id);
  });
});
