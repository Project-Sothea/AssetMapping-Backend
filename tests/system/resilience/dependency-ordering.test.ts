/**
 * TEST: Dependency Ordering
 * Validates handling of entity dependencies (forms depend on pins).
 * INPUT: operations with FK dependencies → OUTPUT: proper error handling or ordering
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Dependency Ordering', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];
  const createdFormIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('form', createdFormIds);
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Form before pin (FK violation).
   * INPUT: form references non-existent pin → OUTPUT: clear FK error or UUID error
   */
  test('should fail with clear error when pin missing', async () => {
    // Use valid UUID format to get FK error instead of UUID parse error
    const nonExistentPinId = '00000000-0000-0000-0000-000000000000';
    const form = TestDataGenerator.generateForm(nonExistentPinId);

    const result = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'form',
      operation: 'create',
      payload: form,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    // Should get FK or validation error
    const errorMsg = result.error?.toLowerCase() || '';
    const hasValidError =
      errorMsg.includes('foreign') ||
      errorMsg.includes('key') ||
      errorMsg.includes('constraint') ||
      errorMsg.includes('violat') ||
      errorMsg.includes('not found') ||
      errorMsg.includes('does not exist') ||
      errorMsg.includes('referenced') ||
      errorMsg.includes('fkey') ||
      errorMsg.includes('insert') ||
      errorMsg.includes('null') ||
      errorMsg.includes('uuid');

    expect(hasValidError).toBe(true);

    // Verify form not created
    const dbForm = await DatabaseHelper.getForm(form.id!);
    expect(dbForm).toBeNull();
  }, 10000);

  /**
   * Correct order: pin then form.
   * INPUT: pin created, then form → OUTPUT: both succeed
   */
  test('should succeed when dependencies satisfied', async () => {
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

    // Then create form
    const form = TestDataGenerator.generateForm(pin.id);
    createdFormIds.push(form.id!);

    const formResult = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'form',
      operation: 'create',
      payload: form,
    });
    expect(formResult.success).toBe(true);

    // Verify both exist
    const dbPin = await DatabaseHelper.getPin(pin.id!);
    const dbForm = await DatabaseHelper.getForm(form.id!);
    expect(dbPin).not.toBeNull();
    expect(dbForm).not.toBeNull();
    expect(dbForm?.pinId).toBe(pin.id);
  }, 10000);

  /**
   * Multiple forms for one pin.
   * INPUT: 1 pin, 5 forms referencing it → OUTPUT: all succeed
   */
  test('should handle multiple dependents for same parent', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    // Create pin
    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    // Create 5 forms referencing the same pin
    const forms = TestDataGenerator.generateForms(5, pin.id);
    createdFormIds.push(...forms.map((f) => f.id!));

    const results = await Promise.all(
      forms.map((form) =>
        apiClient.syncItem({
          idempotencyKey: apiClient.generateIdempotencyKey(),
          entityType: 'form',
          operation: 'create',
          payload: form,
        })
      )
    );

    expect(results.every((r) => r.success)).toBe(true);

    // Verify all forms exist
    for (const form of forms) {
      const dbForm = await DatabaseHelper.getForm(form.id!);
      expect(dbForm).not.toBeNull();
      expect(dbForm?.pinId).toBe(pin.id);
    }
  }, 15000);

  /**
   * Delete pin with associated forms (cascade behavior).
   * INPUT: delete pin that has forms → OUTPUT: depends on cascade rules
   * NOTE: Current schema should prevent deletion or cascade
   */
  test('should handle pin deletion with dependent forms', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    // Create pin
    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    // Create form referencing pin
    const form = TestDataGenerator.generateForm(pin.id);
    createdFormIds.push(form.id!);

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'form',
      operation: 'create',
      payload: form,
    });

    // Try to delete pin (soft delete)
    const deleteResult = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'delete',
      payload: { id: pin.id },
    });

    // Soft delete should succeed
    expect(deleteResult.success).toBe(true);

    // Verify pin is soft-deleted
    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.deletedAt).not.toBeNull();

    // Form should still exist (referencing soft-deleted pin)
    const dbForm = await DatabaseHelper.getForm(form.id!);
    expect(dbForm).not.toBeNull();
  }, 10000);

  /**
   * Concurrent creation of pin and form.
   * INPUT: simultaneous requests for pin and form → OUTPUT: form should fail or wait
   */
  test('should handle concurrent pin and form creation', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    const form = TestDataGenerator.generateForm(pin.id);
    createdFormIds.push(form.id!);

    // Send both at the same time
    const [pinResult, formResult] = await Promise.all([
      apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'create',
        payload: pin,
      }),
      apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'form',
        operation: 'create',
        payload: form,
      }),
    ]);

    // Pin should always succeed
    expect(pinResult.success).toBe(true);

    // Form might succeed (if pin created first) or fail (if form created first)
    // Either way, we should have exactly one pin and 0 or 1 form
    const dbPin = await DatabaseHelper.getPin(pin.id!);
    const dbForm = await DatabaseHelper.getForm(form.id!);

    expect(dbPin).not.toBeNull();

    if (formResult.success) {
      expect(dbForm).not.toBeNull();
    } else {
      expect(dbForm).toBeNull();
    }
  }, 10000);
});
