import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeFormForDb } from '../dist/db/utils.js';
import { assertPinVillage, PIN_VILLAGES } from '../packages/shared-types/dist/villages.js';

test('required village choices include the four villages and Test Village', () => {
  assert.deepEqual(PIN_VILLAGES, [
    'Krang Svat',
    'Srae Ou',
    'Svay Sor',
    'Boeung Tim',
    'Test Village',
  ]);
  for (const value of PIN_VILLAGES) assert.doesNotThrow(() => assertPinVillage(value));
  for (const value of ['', null, undefined, 'Singapore'])
    assert.throws(() => assertPinVillage(value), /village/);
  assert.doesNotThrow(() => assertPinVillage('', true));
});
test('stored form shape excludes legacy and derived village fields', () => {
  const value = sanitizeFormForDb(
    {
      id: 'f',
      pinId: 'p',
      villageId: 'A1',
      name: '',
      village: 'Old',
      otherVillage: 'Old other',
      pinVillage: 'Derived',
    },
    1
  );
  assert(!('village' in value));
  assert(!('otherVillage' in value));
  assert(!('pinVillage' in value));
  assert.equal(value.villageId, 'A1');
  assert.equal(value.pinId, 'p');
});
