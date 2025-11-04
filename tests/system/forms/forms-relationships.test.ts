/**
 * TEST: Pin-Form Relationships
 * Validates relationships between pins and forms are maintained.
 * INPUT: pin + forms → OUTPUT: forms correctly linked to pin
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Pin-Form Relationships', () => {
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
   * Forms linked to correct pin.
   * INPUT: 1 pin + 3 forms → OUTPUT: all forms have correct pinId
   */
  test('should maintain pin-form relationships', async () => {
    const pin = TestDataGenerator.generatePin();
    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const forms = TestDataGenerator.generateForms(3, pin.id);
    for (const form of forms) {
      await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'form',
        operation: 'create',
        payload: form,
      });
    }

    const formsResponse = await apiClient.getForms();
    const relatedForms = (formsResponse.data as any).filter((f: any) => f.pinId === pin.id);

    expect(relatedForms.length).toBe(3);
    relatedForms.forEach((form: any) => {
      expect(form.pinId).toBe(pin.id);
    });
  });

  /**
   * Forms for different pins stay separate.
   * INPUT: 2 pins with 2 forms each → OUTPUT: forms correctly separated by pin
   */
  test('should keep forms separate by pin', async () => {
    const pin1 = TestDataGenerator.generatePin();
    const pin2 = TestDataGenerator.generatePin();

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin1,
    });

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin2,
    });

    const forms1 = TestDataGenerator.generateForms(2, pin1.id);
    const forms2 = TestDataGenerator.generateForms(2, pin2.id);

    for (const form of [...forms1, ...forms2]) {
      await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'form',
        operation: 'create',
        payload: form,
      });
    }

    const formsResponse = await apiClient.getForms();
    const pin1Forms = (formsResponse.data as any).filter((f: any) => f.pinId === pin1.id);
    const pin2Forms = (formsResponse.data as any).filter((f: any) => f.pinId === pin2.id);

    expect(pin1Forms.length).toBe(2);
    expect(pin2Forms.length).toBe(2);
  });
});
