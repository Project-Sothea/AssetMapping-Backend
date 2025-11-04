/**
 * TEST: Multi-Device Workflows
 * Simulates multiple devices syncing and resolving conflicts.
 * INPUT: shared data → both devices update offline → sync → conflict resolution
 * OUTPUT: last-write-wins, devices can pull latest
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Multi-Device Conflicts', () => {
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
   * Two devices edit same pin offline, sync causes conflict.
   * INPUT: shared pin → device1 updates → device2 updates → both sync
   * OUTPUT: device2 wins, device1 can pull and re-sync
   */
  test('should handle multi-device conflicts', async () => {
    // Create shared pin
    const sharedPin = TestDataGenerator.generatePin({
      name: 'Shared Pin',
      description: 'Original',
    });
    createdPinIds.push(sharedPin.id!);

    await device1.syncItem({
      idempotencyKey: device1.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: sharedPin,
    });

    // Both devices pull
    await device1.getPins();
    await device2.getPins();

    // Both update offline
    const device1Update = {
      ...sharedPin,
      name: 'Updated by Device 1',
      description: 'Device 1 was here',
    };

    const device2Update = {
      ...sharedPin,
      name: 'Updated by Device 2',
      description: 'Device 2 was here',
    };

    // Device 1 syncs first
    const device1Response = await device1.syncItem({
      idempotencyKey: device1.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: device1Update,
    });

    expect(device1Response.success).toBe(true);

    // Device 2 syncs (conflict - last write wins)
    const device2Response = await device2.syncItem({
      idempotencyKey: device2.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: device2Update,
    });

    expect(device2Response.success).toBe(true);
    const device2Version = (device2Response.data as any).version;

    // Verify device2's update wins
    const finalPins = await device1.getPins();
    const finalPin = (finalPins.data as any).find((p: { id?: string }) => p.id === sharedPin.id);

    expect(finalPin.name).toBe('Updated by Device 2');
    expect(finalPin.description).toBe('Device 2 was here');
    expect(finalPin.version).toBe(device2Version);

    // Device1 pulls and can sync again
    const device1Pull = await device1.getPins();
    const latestPin = (device1Pull.data as any).find((p: { id?: string }) => p.id === sharedPin.id);

    const device1FinalUpdate = {
      ...latestPin,
      description: 'Device 1 synced with latest',
    };

    const finalResponse = await device1.syncItem({
      idempotencyKey: device1.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: device1FinalUpdate,
    });

    expect(finalResponse.success).toBe(true);
    expect((finalResponse.data as any).version).toBeGreaterThan(device2Version);
  });
});
