/**
 * TEST: Form Creation
 * Validates creating forms linked to pins.
 * INPUT: form data + pinId → OUTPUT: form created in database
 *
 * OPTIMIZED: Uses fixture pin, selective cleanup, reduced volume
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';
import { FIXTURES } from '../../helpers/fixtures';

describe('Form Creation', () => {
  let apiClient: ApiClient;
  const createdFormIds: string[] = [];
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('form', createdFormIds);
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Basic form creation.
   * OPTIMIZED: Uses fixture pin instead of creating new one
   */
  test('should create a new form', async () => {
    const form = TestDataGenerator.generateForm(FIXTURES.READONLY_PINS.HOSPITAL_1.id);
    createdFormIds.push(form.id!);

    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'form',
      operation: 'create',
      payload: form,
    });

    expect(response.success).toBe(true);
    expect((response.data as any).id).toBe(form.id);

    const dbForm = await DatabaseHelper.getForm(form.id!);
    expect(dbForm).not.toBeNull();
    expect(dbForm?.pinId).toBe(FIXTURES.READONLY_PINS.HOSPITAL_1.id);
  });

  /**
   * Form created with all fields.
   * OPTIMIZED: Uses fixture pin
   */
  test('should create form with all fields', async () => {
    const form = TestDataGenerator.generateForm(FIXTURES.READONLY_PINS.SCHOOL_1.id, {
      name: 'Inspection Form',
      village: 'Test Village',
    });
    createdFormIds.push(form.id!);

    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'form',
      operation: 'create',
      payload: form,
    });

    expect(response.success).toBe(true);

    const dbForm = await DatabaseHelper.getForm(form.id!);
    expect(dbForm?.name).toBe('Inspection Form');
    expect(dbForm?.village).toBe('Test Village');
  });

  /**
   * Multiple forms for same pin.
   * OPTIMIZED: Reduced from 3 to 2 forms, uses fixture pin
   */
  test('should create multiple forms for one pin', async () => {
    const forms = TestDataGenerator.generateForms(2, FIXTURES.READONLY_PINS.TEMPLE_1.id);
    createdFormIds.push(...forms.map((f) => f.id!));

    for (const form of forms) {
      const response = await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'form',
        operation: 'create',
        payload: form,
      });
      expect(response.success).toBe(true);
    }

    for (const form of forms) {
      const dbForm = await DatabaseHelper.getForm(form.id!);
      expect(dbForm?.pinId).toBe(FIXTURES.READONLY_PINS.TEMPLE_1.id);
    }
  });
});
