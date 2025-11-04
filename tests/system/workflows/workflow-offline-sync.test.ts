/**
 * TEST: Offline-to-Online Sync Workflow
 * Simulates device going offline, making changes, coming online, and syncing.
 * INPUT: create data online → go offline → queue changes → come online → sync
 * OUTPUT: all queued operations succeed
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Offline-to-Online Sync Workflow', () => {
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
   * Single device offline workflow.
   * INPUT: 2 pins online → offline → create 1, update 1, delete 1, create form → sync
   * OUTPUT: all operations succeed
   */
  test('should handle offline-to-online workflow', async () => {
    // Online: create initial pins
    const pin1 = TestDataGenerator.generatePin({ name: 'Initial Pin 1' });
    const pin2 = TestDataGenerator.generatePin({ name: 'Initial Pin 2' });
    createdPinIds.push(pin1.id!, pin2.id!);

    await device.syncItem({
      idempotencyKey: device.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin1,
    });

    await device.syncItem({
      idempotencyKey: device.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin2,
    });

    // Offline: queue operations
    const offlineQueue: Array<{
      idempotencyKey: string;
      entityType: 'pin' | 'form';
      operation: 'create' | 'update' | 'delete';
      payload: unknown;
    }> = [];

    const offlinePin = TestDataGenerator.generatePin({ name: 'Created Offline' });
    createdPinIds.push(offlinePin.id!);
    offlineQueue.push({
      idempotencyKey: device.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: offlinePin,
    });

    offlineQueue.push({
      idempotencyKey: device.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: { ...pin1, name: 'Updated Offline' },
    });

    offlineQueue.push({
      idempotencyKey: device.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'delete',
      payload: { id: pin2.id },
    });

    const offlineForm = TestDataGenerator.generateForm(offlinePin.id, {
      name: 'Form Created Offline',
    });
    createdFormIds.push(offlineForm.id!);
    offlineQueue.push({
      idempotencyKey: device.generateIdempotencyKey(),
      entityType: 'form',
      operation: 'create',
      payload: offlineForm,
    });

    // Online: sync queue
    const syncResults = await device.batchSync(offlineQueue);

    expect(syncResults.length).toBe(4);
    syncResults.forEach((result) => {
      expect(result.success).toBe(true);
    });

    // Verify final state
    const finalPins = await device.getPins();
    const finalForms = await device.getForms();

    const createdPin = (finalPins.data as any).find((p: { id?: string }) => p.id === offlinePin.id);
    expect(createdPin?.name).toBe('Created Offline');

    const updatedPin = (finalPins.data as any).find((p: { id?: string }) => p.id === pin1.id);
    expect(updatedPin?.name).toBe('Updated Offline');

    const deletedPin = (finalPins.data as any).find((p: { id?: string }) => p.id === pin2.id);
    expect(deletedPin).toBeUndefined();

    const createdForm = (finalForms.data as any).find(
      (f: { id?: string }) => f.id === offlineForm.id
    );
    expect(createdForm?.name).toBe('Form Created Offline');
  });

  /**
   * Complex workflow simulating field worker's day.
   * INPUT: create 3 pins → create 3 forms → update 1 pin → batch sync
   * OUTPUT: all operations succeed
   */
  test('should handle complex daily workflow', async () => {
    const offlineQueue: Array<{
      idempotencyKey: string;
      entityType: 'pin' | 'form';
      operation: 'create' | 'update' | 'delete';
      payload: unknown;
    }> = [];

    // Create pins
    for (let i = 0; i < 3; i++) {
      const pin = TestDataGenerator.generatePin({ name: `Pin ${i + 1}` });
      createdPinIds.push(pin.id!);
      offlineQueue.push({
        idempotencyKey: device.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'create',
        payload: pin,
      });
    }

    // Create forms
    const pinIds = offlineQueue.map((op) => (op.payload as any).id);
    for (const pinId of pinIds) {
      const form = TestDataGenerator.generateForm(pinId, {
        name: 'Inspection Form',
      });
      createdFormIds.push(form.id!);
      offlineQueue.push({
        idempotencyKey: device.generateIdempotencyKey(),
        entityType: 'form',
        operation: 'create',
        payload: form,
      });
    }

    // Update first pin
    offlineQueue.push({
      idempotencyKey: device.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: {
        ...(offlineQueue[0].payload as any),
        description: 'Updated description',
      },
    });

    // Sync everything
    const results = await device.batchSync(offlineQueue);

    const successful = results.filter((r) => r.success).length;
    expect(successful).toBe(offlineQueue.length);

    const finalPins = await device.getPins();
    const finalForms = await device.getForms();

    expect((finalPins.data as any).length).toBeGreaterThanOrEqual(3);
    expect((finalForms.data as any).length).toBeGreaterThanOrEqual(3);
  });
});
