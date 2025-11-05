/**
 * TEST: Partial Transaction Atomicity
 * Validates atomicity across DB + Storage operations.
 * INPUT: DB success + storage fail → OUTPUT: graceful handling, no corruption
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';
import { imageService } from '../../../src/services/image.service';
import supabase from '../../../src/config/supabase';

describe('Partial Transaction Atomicity', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];
  const createdFormIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('form', createdFormIds);
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Image deletion fails, pin update succeeds (expected behavior).
   * INPUT: pin update w/ image removal, storage unavailable → OUTPUT: pin updated, orphaned images logged
   * NOTE: Current design - image deletion failure doesn't block DB update
   */
  test('should continue when image deletion fails', async () => {
    const pin = TestDataGenerator.generatePin({
      images: JSON.stringify([
        'https://example.supabase.co/storage/v1/object/public/images/pin/test1/image1.jpg',
        'https://example.supabase.co/storage/v1/object/public/images/pin/test1/image2.jpg',
      ]),
    });
    createdPinIds.push(pin.id!);

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    // Mock image service to fail (simulating storage outage)
    jest
      .spyOn(imageService, 'deleteImages')
      .mockRejectedValue(new Error('Storage service unavailable'));

    // Update pin to remove images
    const updateResult = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: { ...pin, images: '[]' },
    });

    // Pin update should succeed despite image deletion failure
    // This is intentional design: prioritize data consistency
    expect(updateResult.success).toBe(true);

    // Verify: database reflects change
    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.images).toBe('[]');

    // Note: In production, orphaned images would be logged for cleanup
    // This test validates that DB operations aren't blocked by storage failures
  }, 10000);

  /**
   * DB write fails, images should not be deleted (atomicity test).
   * INPUT: DB upsert fails → OUTPUT: operation fails, no side effects
   * NOTE: Tests that image deletion only happens AFTER successful DB write
   */
  test('should not delete images when DB update fails', async () => {
    const pin = TestDataGenerator.generatePin({
      images: JSON.stringify([
        'https://example.supabase.co/storage/v1/object/public/images/pin/test2/image1.jpg',
      ]),
    });
    createdPinIds.push(pin.id!);

    // Create pin with image
    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const originalImages = pin.images;
    const deleteImagesSpy = jest.spyOn(imageService, 'deleteImages');

    // Mock Supabase to fail on the upsert that has images=[]
    // We need to fail the actual upsert call while allowing version checks
    const originalFrom = supabase.from;
    jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
      const result = originalFrom.call(supabase, table);

      if (table === 'pins') {
        const originalUpsert = result.upsert;
        result.upsert = jest.fn((data: any, options?: any) => {
          // Fail the upsert call that has empty images array
          if (data && typeof data === 'object' && 'images' in data && data.images === '[]') {
            return {
              select: () => ({
                single: async () => {
                  throw new Error('Database write failed');
                },
              }),
            };
          }
          // Allow other calls through
          return originalUpsert.call(result, data, options);
        }) as any;
      }
      return result;
    });

    // Attempt to update pin (should fail)
    const updateResult = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: { ...pin, images: '[]' },
    });

    // Update should fail due to DB error
    expect(updateResult.success).toBe(false);
    expect(updateResult.error).toBeDefined();

    // Restore mocks before checking DB
    jest.restoreAllMocks();

    // Verify: original images still in database (no change applied)
    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.images).toBe(originalImages);

    // Verify: deleteImages was never called (atomic behavior)
    expect(deleteImagesSpy).not.toHaveBeenCalled();
  }, 15000);

  /**
   * Delete pin with images.
   * INPUT: delete pin → OUTPUT: pin soft-deleted, images removed
   */
  test('should delete all images when pin is deleted', async () => {
    const mockImageUrls = [
      'https://example.supabase.co/storage/v1/object/public/images/pin/test3/image1.jpg',
      'https://example.supabase.co/storage/v1/object/public/images/pin/test3/image2.jpg',
    ];

    const pin = TestDataGenerator.generatePin({
      images: JSON.stringify(mockImageUrls),
    });
    createdPinIds.push(pin.id!);

    // Create pin with images
    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    // Mock image deletion to verify it's called correctly
    const deleteImagesSpy = jest.spyOn(imageService, 'deleteImages').mockResolvedValue(undefined);

    // Delete the pin
    const deleteResult = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'delete',
      payload: { id: pin.id },
    });

    expect(deleteResult.success).toBe(true);

    // Verify deleteImages was called with correct URLs
    expect(deleteImagesSpy).toHaveBeenCalledWith(mockImageUrls);

    // Verify pin is soft-deleted
    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.deletedAt).not.toBeNull();
  }, 10000);

  /**
   * Form with missing pin reference.
   * INPUT: form for non-existent pin → OUTPUT: FK constraint error
   */
  test('should fail when pin reference is missing', async () => {
    const form = TestDataGenerator.generateForm('non-existent-pin-id');

    const result = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'form',
      operation: 'create',
      payload: form,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    const dbForm = await DatabaseHelper.getForm(form.id!);
    expect(dbForm).toBeNull();
  }, 10000);

  /**
   * Form with valid pin reference.
   * INPUT: pin created, then form → OUTPUT: both exist, FK constraint satisfied
   */
  test('should succeed when pin exists for form', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    // Create pin first
    const pinResult = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });
    expect(pinResult.success).toBe(true);

    // Then create form referencing the pin
    const form = TestDataGenerator.generateForm(pin.id);
    createdFormIds.push(form.id!);

    const formResult = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'form',
      operation: 'create',
      payload: form,
    });

    expect(formResult.success).toBe(true);

    // Verify both exist in database
    const dbPin = await DatabaseHelper.getPin(pin.id!);
    const dbForm = await DatabaseHelper.getForm(form.id!);
    expect(dbPin).not.toBeNull();
    expect(dbForm).not.toBeNull();
    expect(dbForm?.pinId).toBe(pin.id);
  }, 10000);
});
