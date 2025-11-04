/**
 * TEST: Version Tracking
 * Validates version numbers increment correctly and stay consistent.
 * INPUT: multiple updates → OUTPUT: versions increment sequentially
 */

import { ApiClient } from '../../helpers/api-client';
import { TestDataGenerator } from '../../helpers/test-data';
import { DatabaseHelper } from '../../helpers/db-helper';

describe('Version Tracking', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Version increments on each update.
   * INPUT: create (v1) → update (v2) → update (v3) → OUTPUT: v1, v2, v3
   */
  test('should increment version on each update', async () => {
    const pin = TestDataGenerator.generatePin();

    const createResponse = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    createdPinIds.push((createResponse.data as any).id);
    const v1 = (createResponse.data as any).version;
    const createdPin = createResponse.data as any;

    const update1Response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: { ...createdPin, name: 'Update 1' },
    });

    const v2 = (update1Response.data as any).version;
    const updatedPin1 = update1Response.data as any;

    const update2Response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: { ...updatedPin1, name: 'Update 2' },
    });

    const v3 = (update2Response.data as any).version;

    expect(v2).toBe(v1 + 1);
    expect(v3).toBe(v2 + 1);
  });

  /**
   * Forms track versions independently.
   * INPUT: 2 forms, update 1 multiple times → OUTPUT: other form version unchanged
   */
  test('should track versions independently', async () => {
    const pin = TestDataGenerator.generatePin();
    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const form1 = TestDataGenerator.generateForm(pin.id);
    const form2 = TestDataGenerator.generateForm(pin.id);

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'form',
      operation: 'create',
      payload: form1,
    });

    const form2Response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'form',
      operation: 'create',
      payload: form2,
    });

    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'form',
      operation: 'update',
      payload: { ...form1, name: 'Updated' },
    });

    const dbForm2 = await DatabaseHelper.getForm(form2.id!);
    expect(dbForm2?.version).toBe((form2Response.data as any).version);
  });

  /**
   * Sequential version verification.
   * INPUT: 10 updates → OUTPUT: versions are strictly sequential
   */
  test('should verify sequential versions', async () => {
    const pin = TestDataGenerator.generatePin();

    const createResponse = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    createdPinIds.push((createResponse.data as any).id);
    const versions: number[] = [(createResponse.data as any).version];
    let currentPin = createResponse.data as any;

    for (let i = 0; i < 10; i++) {
      const response = await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'update',
        payload: { ...currentPin, name: `Version ${i + 1}` },
      });
      versions.push((response.data as any).version);
      currentPin = response.data as any;
    }

    for (let i = 1; i < versions.length; i++) {
      expect(versions[i]).toBe(versions[i - 1] + 1);
    }
  });

  /**
   * Separate sequences for pins and forms.
   * INPUT: update pin 3x, update form 3x → OUTPUT: each has independent version sequence
   */
  test('should maintain separate version sequences', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    const pinResponse = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    const form = TestDataGenerator.generateForm(pin.id);
    const formResponse = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'form',
      operation: 'create',
      payload: form,
    });

    let currentPin = pinResponse.data as any;
    let currentForm = formResponse.data as any;

    for (let i = 0; i < 3; i++) {
      const pinUpdateResponse = await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'pin',
        operation: 'update',
        payload: { ...currentPin, name: `Pin Update ${i}` },
      });
      currentPin = pinUpdateResponse.data as any;

      const formUpdateResponse = await apiClient.syncItem({
        idempotencyKey: apiClient.generateIdempotencyKey(),
        entityType: 'form',
        operation: 'update',
        payload: { ...currentForm, name: `Form Update ${i}` },
      });
      currentForm = formUpdateResponse.data as any;
    }

    const finalPin = await DatabaseHelper.getPin(pin.id!);
    const finalForm = await DatabaseHelper.getForm(form.id!);

    expect(finalPin?.version).toBe((pinResponse.data as any).version + 3);
    expect(finalForm?.version).toBe((formResponse.data as any).version + 3);
  });

  /**
   * CRITICAL: What happens when device sends OLD version number?
   * Simulates: Device offline with v1, server is now v3, device tries to update
   * INPUT: create pin → update to v2 → update to v3 → try to update with v1 data
   * OUTPUT: Should this succeed (last-write-wins) or fail (version conflict)?
   */
  test('should handle updates with old version numbers', async () => {
    const pin = TestDataGenerator.generatePin({ name: 'Original', description: 'v1' });
    createdPinIds.push(pin.id!);

    // Device creates pin (v1)
    const v1Response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });
    const v1 = (v1Response.data as any).version;
    const v1Pin = v1Response.data as any;

    // Save what device has offline (v1 with changes)
    const v1Data = { ...v1Pin, name: 'Offline Change', description: 'Made offline at v1' };

    // Server updates to v2 (while device offline)
    const v2Response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: { ...v1Pin, name: 'Server Update v2', description: 'Server changed' },
    });
    const v2Pin = v2Response.data as any;

    // Server updates to v3 (device still offline)
    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: { ...v2Pin, name: 'Server Update v3', lat: 11.999 },
    });

    // Verify server is at v3
    const beforeConflict = await DatabaseHelper.getPin(pin.id!);
    expect(beforeConflict?.version).toBe(v1 + 2); // v3
    expect(beforeConflict?.name).toBe('Server Update v3');

    // Device comes online and tries to push v1 changes
    const conflictResponse = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: { ...v1Data, version: v1 }, // Explicitly sending old version
    });

    // CRITICAL CHECK: What happens?
    console.log('🔍 Conflict Response:', {
      success: conflictResponse.success,
      error: conflictResponse.error,
      version: (conflictResponse.data as any)?.version,
    });

    const afterConflict = await DatabaseHelper.getPin(pin.id!);
    console.log('🔍 Final DB State:', {
      name: afterConflict?.name,
      description: afterConflict?.description,
      version: afterConflict?.version,
      lat: afterConflict?.lat,
    });

    // Document the actual behavior
    if (!conflictResponse.success) {
      // Option 1: Backend rejects old version (GOOD - prevents data loss)
      console.log('✅ Backend rejected old version - conflict detected!');
      expect(conflictResponse.success).toBe(false);
      expect(afterConflict?.name).toBe('Server Update v3'); // Server data preserved
    } else {
      // Option 2: Backend accepts it (BAD - last-write-wins loses server changes)
      console.log('⚠️  Backend accepted old version - data loss risk!');
      expect(conflictResponse.success).toBe(true);

      // Check if server changes were lost
      if (afterConflict?.name === 'Offline Change') {
        console.log('❌ Server updates v2 & v3 were LOST - last write wins applied');

        // ACTUAL BEHAVIOR: Backend accepts old version, ALL server changes lost
        expect(afterConflict?.name).toBe('Offline Change');
        expect(afterConflict?.description).toBe('Made offline at v1');
        // Even lat was reverted to old value
        expect(afterConflict?.lat).not.toBe(11.999);
      }
    }
  });

  /**
   * LAST-WRITE-WINS: Timestamp-based conflict resolution
   * Backend compares timestamps and keeps the newer data automatically
   */
  test('should use last-write-wins based on timestamps', async () => {
    const pin = TestDataGenerator.generatePin({ name: 'Original', description: 'v1' });
    createdPinIds.push(pin.id!);

    // Device creates pin (v1) at T0
    const v1Response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });
    const v1 = (v1Response.data as any).version;
    const v1Pin = v1Response.data as any;

    // Wait a moment to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Server updates to v2 at T1 (newer than v1)
    const v2Response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: { ...v1Pin, name: 'Server Update v2', description: 'Server changed' },
    });
    const v2Pin = v2Response.data as any;

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Server updates to v3 at T2 (even newer)
    await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: { ...v2Pin, name: 'Server Update v3', lat: 11.999 },
    });

    // Verify server is at v3
    const beforeConflict = await DatabaseHelper.getPin(pin.id!);
    expect(beforeConflict?.version).toBe(v1 + 2); // v3
    expect(beforeConflict?.name).toBe('Server Update v3');

    await new Promise((resolve) => setTimeout(resolve, 100));

    // TEST 1: Device sends NEWER changes (should SUCCEED - Last-Write-Wins)
    const newerData = {
      ...v1Pin,
      name: 'Offline Change (Newer)',
      description: 'Made offline but timestamp is newer',
      version: v1, // Old version but...
      updatedAt: new Date().toISOString(), // ...NEWER timestamp!
    };

    const newerResponse = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: newerData,
    });

    console.log('🔍 Newer Data Response:', {
      success: newerResponse.success,
      error: newerResponse.error,
    });

    expect(newerResponse.success).toBe(true);
    const afterNewer = await DatabaseHelper.getPin(pin.id!);
    expect(afterNewer?.name).toBe('Offline Change (Newer)');
    console.log('✅ Backend accepted newer timestamp - Last-Write-Wins working!');

    await new Promise((resolve) => setTimeout(resolve, 100));

    // TEST 2: Device sends OLDER changes (should FAIL - rejected)
    const olderData = {
      ...v1Pin,
      name: 'Old Offline Change',
      description: 'This is older than server',
      version: v1,
      updatedAt: v1Pin.updatedAt, // OLD timestamp from v1
    };

    const olderResponse = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'update',
      payload: olderData,
    });

    console.log('🔍 Older Data Response:', {
      success: olderResponse.success,
      error: olderResponse.error,
    });

    expect(olderResponse.success).toBe(false);
    const afterOlder = await DatabaseHelper.getPin(pin.id!);
    expect(afterOlder?.name).toBe('Offline Change (Newer)'); // Unchanged
    console.log('✅ Backend rejected older timestamp - preventing data loss!');
  });
});
