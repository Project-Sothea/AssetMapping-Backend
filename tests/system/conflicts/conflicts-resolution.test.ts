/**
 * TEST: Conflict Resolution
 * Validates last-write-wins strategy for conflicting updates.
 * INPUT: conflicting updates from different devices → OUTPUT: last write wins
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Conflict Resolution', () => {
  let device1: ApiClient;
  let device2: ApiClient;
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    device1 = new ApiClient(undefined, 'device-1');
    device2 = new ApiClient(undefined, 'device-2');
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Last-write-wins for conflicting updates.
   * INPUT: device1 updates → delay → device2 updates → OUTPUT: device2's data wins
   */
  test('should apply last-write-wins', async () => {
    const pin = TestDataGenerator.generatePin({ name: 'Original Name' });

    await device1.syncItem({
      idempotencyKey: device1.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const update1 = { ...pin, name: 'Name from Device 1', lat: 11.5 };
    const update2 = { ...pin, name: 'Name from Device 2', lat: 11.6 };

    await device1.syncItem({
      idempotencyKey: device1.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: update1,
    });

    await device1.delay(100);

    await device2.syncItem({
      idempotencyKey: device2.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: update2,
    });

    const finalPin = await DatabaseHelper.getPin(pin.id!);
    expect(finalPin?.name).toBe('Name from Device 2');
    expect(finalPin?.lat).toBe(11.6);
  });

  /**
   * Pull resolves local conflicts.
   * INPUT: device2 updates, device1 pulls → OUTPUT: device1 gets latest version
   */
  test('should allow pull to resolve conflicts', async () => {
    const pin = TestDataGenerator.generatePin();

    await device1.syncItem({
      idempotencyKey: device1.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    await device2.syncItem({
      idempotencyKey: device2.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: { ...pin, name: 'Server Truth' },
    });

    const pullResponse = await device1.getPins();
    const serverPin = (pullResponse.data as any).find((p: any) => p.id === pin.id);

    expect(serverPin).toBeDefined();
    expect(serverPin.name).toBe('Server Truth');

    const syncResponse = await device1.syncItem({
      idempotencyKey: device1.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: { ...serverPin, description: 'Updated after pull' },
    });

    expect(syncResponse.success).toBe(true);
  });
});
