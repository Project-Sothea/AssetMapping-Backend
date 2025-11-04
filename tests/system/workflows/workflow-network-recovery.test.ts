/**
 * TEST: Network Failure Recovery
 * Simulates network failures and retry mechanisms.
 * INPUT: operations with network failures → retry with backoff
 * OUTPUT: operations succeed, idempotency maintained
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Network Failure Recovery', () => {
  let device: ApiClient;
  const createdPinIds: string[] = [];
  const createdFormIds: string[] = [];

  beforeAll(async () => {
    device = new ApiClient(undefined, 'mobile-device');
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
    await DatabaseHelper.cleanupSpecific('form', createdFormIds);
  });

  /**
   * Network failures with retry and exponential backoff.
   * INPUT: pin + form with retries → OUTPUT: both created, no duplicates
   */
  test('should recover from network failures', async () => {
    const pin = TestDataGenerator.generatePin({ name: 'Test Pin for Retry' });
    const form = TestDataGenerator.generateForm(pin.id);

    const pinRequest = {
      idempotencyKey: device.generateIdempotencyKey(),
      entityType: 'pin' as const,
      operation: 'create' as const,
      payload: pin,
    };

    const formRequest = {
      idempotencyKey: device.generateIdempotencyKey(),
      entityType: 'form' as const,
      operation: 'create' as const,
      payload: form,
    };

    // Retry with exponential backoff
    const pinResult = await device.retrySync(pinRequest, 3);
    const formResult = await device.retrySync(formRequest, 3);

    expect(pinResult.success).toBe(true);
    expect(formResult.success).toBe(true);

    // Retry again (should return cached, maintain idempotency)
    const pinRetry = await device.syncItem(pinRequest);
    const formRetry = await device.syncItem(formRequest);

    expect(pinRetry.success).toBe(true);
    expect(formRetry.success).toBe(true);

    // Only one of each in database
    const allPins = await DatabaseHelper.getAllPins();
    const allForms = await DatabaseHelper.getAllForms();

    const duplicatePins = allPins.filter((p) => p.id === pin.id);
    const duplicateForms = allForms.filter((f) => f.id === form.id);

    expect(duplicatePins.length).toBe(1);
    expect(duplicateForms.length).toBe(1);
  });
});
