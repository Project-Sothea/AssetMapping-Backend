import assert from 'node:assert/strict';
import test from 'node:test';

import { fingerprint, matchesAuditedBaseline } from '../scripts/village-baseline.mjs';

test('raw database guard preserves NULL versus API empty-array distinctions', () => {
  const raw = { pins: [{ id: 'p' }], forms: [{ id: 'f', waterSources: null }] };
  const api = { ...raw, forms: [{ id: 'f', waterSources: [] }] };
  const baseline = {
    databaseFingerprint: fingerprint(raw.pins, raw.forms),
    fingerprint: fingerprint(api.pins, api.forms),
  };
  assert.notEqual(baseline.databaseFingerprint, baseline.fingerprint);
  assert.equal(matchesAuditedBaseline(raw, baseline), true);
  assert.equal(matchesAuditedBaseline(api, baseline), false);
  assert.equal(matchesAuditedBaseline(api, baseline, true), true);
  assert.equal(
    matchesAuditedBaseline({ ...raw, forms: [{ ...raw.forms[0], name: 'Changed' }] }, baseline),
    false
  );
  assert.equal(matchesAuditedBaseline(raw, { fingerprint: baseline.fingerprint }), false);
});
