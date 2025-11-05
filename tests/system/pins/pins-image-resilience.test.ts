/**
 * TEST: Image Deletion Data Consistency
 * Validates data integrity when images are deleted during pin operations.
 * Critical for rural deployments with poor connectivity.
 *
 * ISSUE: Images can be deleted from storage BEFORE database update succeeds,
 * causing orphaned references when network fails during transaction.
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';
import { ImageHelper } from '../../helpers/image-helper';
import { imageService } from '../../../src/services/image.service';
import supabase from '../../../src/config/supabase';

describe('Image Deletion Data Consistency', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];
  let originalUpsert: any;

  beforeAll(() => {
    apiClient = new ApiClient();
  });

  beforeEach(() => {
    originalUpsert = supabase.from('pins').upsert;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Image updates processed correctly.
   * INPUT: pin with 2 images, remove 1 → OUTPUT: DB reflects change
   */
  test('should update pin when images are removed', async () => {
    const imageUrls = ImageHelper.generateImageUrls('test-pin-1', 2);
    const pin = TestDataGenerator.generatePin({
      images: JSON.stringify(imageUrls),
    });
    createdPinIds.push(pin.id!);

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    // Remove one image
    const updatedPin = {
      ...pin,
      images: JSON.stringify([imageUrls[0]]), // Keep only first image
      name: 'Updated name',
    };

    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: updatedPin,
    });

    expect(response.success).toBe(true);

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.images).toBe(updatedPin.images);
    expect(dbPin?.name).toBe('Updated name');
  });

  /**
   * Version conflict prevents update after image deletion check.
   * INPUT: concurrent updates with old version → OUTPUT: conflict, images preserved
   */
  test('should handle version conflicts without deleting images', async () => {
    const pin = TestDataGenerator.generatePin({
      images: JSON.stringify(ImageHelper.generateImageUrls('test-pin-2', 1)),
    });
    createdPinIds.push(pin.id!);

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    await supabase
      .from('pins')
      .update({
        version: (dbPin?.version || 1) + 1,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', pin.id!);

    const deletedUrls: string[] = [];
    jest.spyOn(imageService, 'deleteImages').mockImplementation(async (urls: string[]) => {
      deletedUrls.push(...urls);
      return Promise.resolve();
    });

    const updatedPin = {
      ...pin,
      images: JSON.stringify([]),
      version: dbPin?.version,
      updatedAt: new Date(Date.now() - 5000).toISOString(),
    };

    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: updatedPin,
    });

    expect(response.success).toBe(false);
    expect(deletedUrls.length).toBe(0);

    const finalDbPin = await DatabaseHelper.getPin(pin.id!);
    expect(finalDbPin?.images).toBe(pin.images);
  });

  /**
   * Partial batch failure tracking.
   * INPUT: batch with 3 pins → OUTPUT: all succeed or fail independently
   */
  test('should process batch operations independently', async () => {
    const pins = [
      ImageHelper.createPinWithImages(TestDataGenerator.generatePin(), 1),
      ImageHelper.createPinWithImages(TestDataGenerator.generatePin(), 1),
      ImageHelper.createPinWithImages(TestDataGenerator.generatePin(), 1),
    ];
    createdPinIds.push(...pins.map((p) => p.id!));

    for (const pin of pins) {
      await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'create',
        payload: pin,
      });
    }

    const updates = pins.map((pin) => ({
      ...pin,
      images: JSON.stringify([]),
      name: `${pin.name} - Updated`,
    }));

    const results = await apiClient.batchSync(
      updates.map((payload) => ({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin' as const,
        operation: 'update' as const,
        payload,
      }))
    );

    // All should succeed
    expect(results.every((r) => r.success)).toBe(true);

    // Verify all images were removed
    for (const pin of pins) {
      const dbPin = await DatabaseHelper.getPin(pin.id!);
      expect(dbPin?.images).toBe('[]');
    }
  });

  /**
   * Pin deletion with image cleanup failure.
   * INPUT: delete pin, image cleanup fails → OUTPUT: pin deleted, images logged
   */
  test('should soft-delete pin despite image cleanup failure', async () => {
    const pin = ImageHelper.createPinWithImages(TestDataGenerator.generatePin(), 2);
    createdPinIds.push(pin.id!);

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    jest.spyOn(imageService, 'deleteImages').mockImplementation(async () => {
      throw new Error('Storage network timeout');
    });

    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'delete',
      payload: { id: pin.id },
    });

    expect(response.success).toBe(true);

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.deletedAt).not.toBeNull();
  });

  /**
   * Rapid successive updates with image changes.
   * INPUT: 4 rapid updates → OUTPUT: final state consistent
   */
  test('should handle rapid successive updates with image changes', async () => {
    const pin = TestDataGenerator.generatePin({ images: JSON.stringify([]) });
    createdPinIds.push(pin.id!);

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const updates = [
      { images: ImageHelper.generateImageUrls(pin.id!, 1), name: 'Update 1' },
      { images: ImageHelper.generateImageUrls(pin.id!, 2), name: 'Update 2' },
      { images: ImageHelper.generateImageUrls(pin.id!, 1), name: 'Update 3' },
      { images: [], name: 'Update 4' },
    ];

    for (const update of updates) {
      await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'update',
        payload: {
          ...pin,
          images: JSON.stringify(update.images),
          name: update.name,
        },
      });
      await apiClient.delay(50);
    }

    const finalDbPin = await DatabaseHelper.getPin(pin.id!);
    expect(finalDbPin?.images).toBe('[]');
    expect(finalDbPin?.name).toBe('Update 4');
    expect(finalDbPin?.version).toBe(5);
  });

  /**
   * Large batch with random timeouts.
   * INPUT: 8 pins, 30% failure rate → OUTPUT: consistent per-pin state
   */
  test('should handle large batch with partial timeouts', async () => {
    const pins = TestDataGenerator.generatePins(8).map((pin) =>
      ImageHelper.createPinWithImages(pin, 1)
    );
    createdPinIds.push(...pins.map((p) => p.id!));

    for (const pin of pins) {
      await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'create',
        payload: pin,
      });
    }

    jest.spyOn(supabase.from('pins'), 'upsert').mockImplementation(() => {
      const shouldFail = Math.random() < 0.3;
      if (shouldFail) {
        return {
          select: () => ({
            single: async () => ({
              data: null,
              error: { message: 'Timeout', code: 'TIMEOUT' },
            }),
          }),
        } as any;
      }
      return originalUpsert.call(supabase.from('pins'));
    });

    const updates = pins.map((pin) => ({
      ...pin,
      images: JSON.stringify([]),
    }));

    const results = await apiClient.batchSync(
      updates.map((payload) => ({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin' as const,
        operation: 'update' as const,
        payload,
      }))
    );

    const successCount = results.filter((r) => r.success).length;
    expect(successCount).toBeGreaterThan(0);

    for (let i = 0; i < pins.length; i++) {
      const dbPin = await DatabaseHelper.getPin(pins[i].id!);
      if (results[i].success) {
        expect(dbPin?.images).toBe('[]');
      } else {
        expect(dbPin?.images).toBe(pins[i].images);
      }
    }
  });
});
