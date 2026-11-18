import assert from 'node:assert/strict';
import test from 'node:test';

import { sealSnapshot, openSnapshot, snapshotHash } from '../scripts/database-snapshot.mjs';

test('encrypted snapshots preserve SQL nulls, answer text, and timestamp precision', () => {
  const value = {
    tables: {
      pins: [],
      forms: [
        {
          id: 'f',
          waterSources: null,
          selfCareActions: '[]',
          createdAt: '2026-11-18T01:02:03.123456+00:00',
        },
      ],
    },
  };
  const bytes = sealSnapshot(value, 'private-test-key');
  assert(!bytes.includes(Buffer.from('waterSources')));
  assert.deepEqual(openSnapshot(bytes, 'private-test-key'), value);
  assert.equal(snapshotHash(value), snapshotHash(openSnapshot(bytes, 'private-test-key')));
  assert.notEqual(snapshotHash(value), snapshotHash({ ...value, changed: true }));
});

test('wrong keys and tampered snapshots are rejected before restore', () => {
  const bytes = sealSnapshot({ tables: {} }, 'private-test-key');
  assert.throws(() => openSnapshot(bytes, 'wrong-key'));
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => openSnapshot(bytes, 'private-test-key'));
});
