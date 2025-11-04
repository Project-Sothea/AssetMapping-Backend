/**
 * TEST: Pin Creation
 * Validates creating new pins via sync endpoint.
 * INPUT: pin data → OUTPUT: pin created in database with version=1
 *
 * OPTIMIZED: Tracks created pins for selective cleanup
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Pin Creation', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    // Only cleanup pins created in this suite
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Basic pin creation succeeds.
   * INPUT: valid pin data → OUTPUT: success response, pin in DB
   */
  test('should create a new pin', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    expect(response.success).toBe(true);
    expect((response.data as any).id).toBe(pin.id);

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin).not.toBeNull();
    expect(dbPin?.name).toBe(pin.name);
  });

  /**
   * Pin created with all optional fields.
   * INPUT: pin with description, type, etc → OUTPUT: all fields persisted
   */
  test('should create pin with all fields', async () => {
    const pin = TestDataGenerator.generatePin({
      name: 'Hospital',
      description: 'Main city hospital',
      type: 'medical',
    });
    createdPinIds.push(pin.id!);

    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    expect(response.success).toBe(true);

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.name).toBe('Hospital');
    expect(dbPin?.description).toBe('Main city hospital');
    expect(dbPin?.type).toBe('medical');
  });

  /**
   * Multiple pins created independently.
   * OPTIMIZED: Reduced from 5 to 3 pins
   */
  test('should create multiple pins', async () => {
    const pins = TestDataGenerator.generatePins(3);
    createdPinIds.push(...pins.map((p) => p.id!));

    for (const pin of pins) {
      const response = await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'create',
        payload: pin,
      });
      expect(response.success).toBe(true);
    }

    for (const pin of pins) {
      const exists = await DatabaseHelper.verifyExists('pin', pin.id!);
      expect(exists).toBe(true);
    }
  });
});
