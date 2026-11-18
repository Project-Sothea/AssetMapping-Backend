import { readFileSync } from 'node:fs';

import postgres from 'postgres';

import { fingerprint } from './village-baseline.mjs';

const target = new URL(process.env.DATABASE_URL || '');
if (
  target.hostname !== 'postgres-app-test.railway.internal' ||
  process.env.RAILWAY_ENVIRONMENT_ID !== '72536ee3-2165-4348-8650-f4d825cdcd04' ||
  process.env.RAILWAY_SERVICE_ID !== '3c152b3e-6d17-4145-a509-1e7518104a7c'
)
  throw new Error('Read-only audit is restricted to the audited test backend/database.');
const baseline = JSON.parse(
  readFileSync(new URL('./village-migration-baseline.json', import.meta.url))
);
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const snapshot = { pins: await sql`SELECT * FROM pins`, forms: await sql`SELECT * FROM forms` };
  const apiSnapshot = {};
  const differences = {};
  for (const table of ['pins', 'forms']) {
    const response = await fetch(`${baseline.api}/api/${table}`);
    if (!response.ok) throw new Error('Baseline API unavailable');
    const body = await response.json();
    if (!body.success || !Array.isArray(body.data)) throw new Error('Invalid baseline response');
    apiSnapshot[table] = body.data;
    differences[table] = {};
    for (const row of snapshot[table]) {
      const api = body.data.find((r) => r.id === row.id);
      if (!api) throw new Error('Unexpected database ID');
      for (const key of new Set([...Object.keys(row), ...Object.keys(api)])) {
        let value = row[key];
        if (value instanceof Date) value = value.toISOString();
        if (typeof value === 'string' && value.trimStart().startsWith('[')) {
          try {
            const array = JSON.parse(value);
            if (Array.isArray(array)) value = array;
          } catch {
            /* Preserve non-JSON answers. */
          }
        }
        if (JSON.stringify(value) !== JSON.stringify(api[key])) {
          const emptyArray = Array.isArray(api[key]) && api[key].length === 0;
          const category =
            value === null && emptyArray
              ? 'null-to-empty-array'
              : value === '' && emptyArray
                ? 'empty-string-to-empty-array'
                : 'other';
          const label = `${key}:${category}`;
          differences[table][label] = (differences[table][label] ?? 0) + 1;
        }
      }
    }
  }
  console.log(
    JSON.stringify({
      readOnly: true,
      pins: snapshot.pins.length,
      forms: snapshot.forms.length,
      rawFingerprint: fingerprint(snapshot.pins, snapshot.forms),
      apiMatchesAuditedBaseline:
        fingerprint(apiSnapshot.pins, apiSnapshot.forms) === baseline.fingerprint,
      differences,
    })
  );
  // This is diagnostic only: never start the new backend against the old schema.
  throw new Error('Read-only audit complete; migration and service startup intentionally skipped.');
} finally {
  await sql.end();
}
