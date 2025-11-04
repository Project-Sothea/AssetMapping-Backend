/**
 * TEST: Pin Updates
 * Validates updating existing pins with new data.
 * INPUT: existing pin + updates → OUTPUT: pin updated, version incremented
 *
 * OPTIMIZED: Uses shared pins across tests to reduce DB operations
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator, PinTestData } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Pin Updates', () => {
  let apiClient: ApiClient;
  let sharedPins: PinTestData[];
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();

    // Create 2 pins shared across tests in this suite
    sharedPins = TestDataGenerator.generatePins(2);
    createdPinIds.push(...sharedPins.map((p) => p.id!));

    for (const pin of sharedPins) {
      await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'create',
        payload: pin,
      });
    }
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Updating pin name and description.
   * INPUT: pin with new name/description → OUTPUT: fields updated, version incremented
   */
  test('should update pin fields', async () => {
    const pin = sharedPins[0];

    const updatedPin = {
      ...pin,
      name: 'Updated Name',
      description: 'Updated Description',
    };

    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: updatedPin,
    });

    expect(response.success).toBe(true);

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.name).toBe('Updated Name');
    expect(dbPin?.description).toBe('Updated Description');
  });

  /**
   * Version increments on each update.
   * OPTIMIZED: Reduced from 3 to 2 updates
   */
  test('should increment version on update', async () => {
    const pin = sharedPins[1];

    const initialVersion = (await DatabaseHelper.getVersion('pin', pin.id!)) || 1;

    for (let i = 0; i < 2; i++) {
      await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'update',
        payload: { ...pin, name: `Update ${i + 1}` },
      });
    }

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.version).toBe(initialVersion + 2);
  });

  /**
   * Partial updates work (only updating some fields).
   */
  test('should handle partial updates', async () => {
    const pin = TestDataGenerator.generatePin({
      name: 'Original',
      description: 'Original Description',
      type: 'hospital',
    });
    createdPinIds.push(pin.id!);

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: { ...pin, name: 'New Name Only' },
    });

    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin?.name).toBe('New Name Only');
    expect(dbPin?.description).toBe('Original Description');
    expect(dbPin?.type).toBe('hospital');
  });
});
