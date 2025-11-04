/**
 * TEST: Form Pull/Fetch Operations
 * Validates fetching forms from server.
 * INPUT: GET request → OUTPUT: array of forms with correct structure
 *
 * OPTIMIZED: Uses pre-seeded fixtures
 */

import { ApiClient } from '../../helpers/api-client';
import { FIXTURES, FixtureManager } from '../../helpers/fixtures';

describe('Form Pull Operations', () => {
  let apiClient: ApiClient;

  beforeAll(async () => {
    apiClient = new ApiClient();
    const fixturesExist = await FixtureManager.verifyFixtures();
    if (!fixturesExist) {
      throw new Error('Fixtures not properly seeded');
    }
  });

  /**
   * Fetching all forms - uses fixtures
   */
  test('should fetch all forms', async () => {
    const response = await apiClient.getForms();

    expect(response.success).toBe(true);
    expect(Array.isArray(response.data)).toBe(true);
    expect((response.data as any).length).toBeGreaterThanOrEqual(3);

    // Verify specific fixture exists
    const hospitalForm = (response.data as any).find(
      (f: any) => f.id === FIXTURES.READONLY_FORMS.HOSPITAL_FORM_1.id
    );
    expect(hospitalForm).toBeDefined();
  });

  /**
   * Forms include version numbers.
   */
  test('should include version in forms', async () => {
    const response = await apiClient.getForms();
    const forms = response.data as any[];

    expect(forms.length).toBeGreaterThan(0);

    const form = forms[0];
    expect(form).toHaveProperty('version');
    expect(form).toHaveProperty('pinId');
    expect(form).toHaveProperty('name');
  });

  /**
   * Forms maintain relationship to pins.
   */
  test('should maintain pin relationships', async () => {
    const response = await apiClient.getForms();

    const hospitalForm = (response.data as any).find(
      (f: any) => f.id === FIXTURES.READONLY_FORMS.HOSPITAL_FORM_1.id
    );

    expect(hospitalForm).toBeDefined();
    expect(hospitalForm.pinId).toBe(FIXTURES.READONLY_PINS.HOSPITAL_1.id);
  });
});
