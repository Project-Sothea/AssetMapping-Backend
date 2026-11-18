import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import postgres from 'postgres';

if (process.argv[2] !== '--confirmed-test-target' || !process.env.DATABASE_URL) {
  throw new Error('Explicit test DATABASE_URL and --confirmed-test-target are required.');
}
const target = new URL(process.env.DATABASE_URL);
const local = ['localhost', '127.0.0.1'].includes(target.hostname);
if (
  !local &&
  (target.hostname !== 'postgres-app-test.railway.internal' ||
    process.env.RAILWAY_ENVIRONMENT_ID !== '72536ee3-2165-4348-8650-f4d825cdcd04' ||
    process.env.RAILWAY_SERVICE_ID !== '3c152b3e-6d17-4145-a509-1e7518104a7c')
) {
  throw new Error('Rollback must run on the audited migration-test backend/database.');
}
const migration = readFileSync(
  new URL('../drizzle/0004_pin_owned_village.sql', import.meta.url),
  'utf8'
);
const hash = createHash('sha256').update(migration).digest('hex');
const rollback = readFileSync(
  new URL('./rollback-pin-village.sql', import.meta.url),
  'utf8'
).replace('__MIGRATION_SHA256__', hash);
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await sql.unsafe(rollback);
  console.log(
    'Original form village columns restored; current forms retained. Restore the previous backend deployment next.'
  );
} finally {
  await sql.end();
}
