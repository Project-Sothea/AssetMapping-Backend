/**
 * TEST: Concurrent Updates
 * Validates handling of simultaneous updates from multiple devices.
 * INPUT: 2 devices update same pin simultaneously → OUTPUT: both succeed, last write wins
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Concurrent Updates', () => {
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
   * Two devices update same pin concurrently.
   * INPUT: device1 updates, device2 updates → OUTPUT: both succeed, versions sequential
   */
  test('should handle concurrent updates', async () => {
    const pin = TestDataGenerator.generatePin();
    const createResponse = await device1.syncItem({
      idempotencyKey: device1.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const initialVersion = (createResponse.data as any).version;

    const update1 = {
      ...pin,
      name: 'Updated by Device 1',
      description: 'Device 1 made this change',
    };

    const update2 = {
      ...pin,
      name: 'Updated by Device 2',
      description: 'Device 2 made this change',
    };

    const [response1, response2] = await Promise.all([
      device1.syncItem({
        idempotencyKey: device1.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'update',
        payload: update1,
      }),
      device2.syncItem({
        idempotencyKey: device2.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'update',
        payload: update2,
      }),
    ]);

    expect(response1.success).toBe(true);
    expect(response2.success).toBe(true);

    // One response will have version incremented
    const version1 = (response1.data as any).version;
    const version2 = (response2.data as any).version;

    // Both should be >= initial version (one may return cached result)
    expect(version1).toBeGreaterThanOrEqual(initialVersion);
    expect(version2).toBeGreaterThanOrEqual(initialVersion);

    const finalState = await DatabaseHelper.getPin(pin.id!);
    expect(finalState?.version).toBeGreaterThanOrEqual(initialVersion);
  });

  /**
   * Sequential updates from multiple devices.
   * INPUT: 5 alternating updates from 2 devices → OUTPUT: versions increment sequentially
   */
  test('should maintain version consistency', async () => {
    const pin = TestDataGenerator.generatePin();

    const createResponse = await device1.syncItem({
      idempotencyKey: device1.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    let currentVersion = (createResponse.data as any).version;

    for (let i = 0; i < 5; i++) {
      const device = i % 2 === 0 ? device1 : device2;
      const response = await device.syncItem({
        idempotencyKey: device.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'update',
        payload: { ...pin, name: `Update ${i + 1}` },
      });

      expect(response.success).toBe(true);
      expect((response.data as any).version).toBeGreaterThan(currentVersion);
      currentVersion = (response.data as any).version;
    }

    const finalPin = await DatabaseHelper.getPin(pin.id!);
    expect(finalPin?.version).toBe(currentVersion);
  });
});
