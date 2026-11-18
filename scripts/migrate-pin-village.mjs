import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';

import postgres from 'postgres';

import { fingerprint } from './village-baseline.mjs';

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
  throw new Error('Target must be the audited migration-test database and backend service.');
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 15, onnotice: () => {} });
const migration = readFileSync(
  new URL('../drizzle/0004_pin_owned_village.sql', import.meta.url),
  'utf8'
);
const hash = createHash('sha256').update(migration).digest('hex');
const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url)));
const entry = journal.entries.find((x) => x.tag === '0004_pin_owned_village');
const baseline = JSON.parse(
  readFileSync(new URL('./village-migration-baseline.json', import.meta.url))
);
const backupRoot = process.env.MIGRATION_BACKUP_DIRECTORY || '/tmp/sothea-village-backup';
try {
  await sql.begin(async (tx) => {
    await tx`SET LOCAL lock_timeout = '5s'`;
    await tx`LOCK TABLE public.pins, public.forms IN SHARE ROW EXCLUSIVE MODE`;
    const columns =
      await tx`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='forms'`;
    const names = new Set(columns.map((x) => x.column_name));
    if (!names.has('village') && !names.has('otherVillage')) {
      const [applied] =
        await tx`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations WHERE hash=${hash}`;
      if (applied.count !== 1)
        throw new Error('New schema exists without the expected migration journal entry.');
      console.log(JSON.stringify({ alreadyMigrated: true }));
      return;
    }
    if (!names.has('village') || !names.has('otherVillage'))
      throw new Error('Partially migrated schema. Aborting.');
    const snapshot = {
      pins: await tx`SELECT * FROM public.pins`,
      forms: await tx`SELECT * FROM public.forms`,
    };
    const blankPins = snapshot.pins.filter((pin) => !pin.cityVillage?.trim()).length;
    if (
      snapshot.pins.length !== baseline.pins ||
      snapshot.forms.length !== baseline.forms ||
      blankPins !== baseline.blankPins ||
      fingerprint(snapshot.pins, snapshot.forms) !== baseline.fingerprint
    ) {
      throw new Error(
        'Dataset differs from the audited 208-pin/268-form/13-blank baseline. Review it before migration.'
      );
    }
    const [audit] = await tx`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE p.id IS NULL)::int AS orphans,
      count(*) FILTER (WHERE btrim(coalesce(f.village,'')) <> btrim(coalesce(p."cityVillage",'')))::int AS conflicts,
      count(*) FILTER (WHERE btrim(coalesce(f."otherVillage",'')) <> '')::int AS others
      FROM public.forms f LEFT JOIN public.pins p ON p.id=f."pinId"`;
    if (audit.orphans || audit.conflicts || audit.others)
      throw new Error(
        'Preflight failed: conflicting villages, otherVillage answers, or missing parent pins.'
      );
    const backupSchema = 'village_backup_' + Date.now() + '_' + randomBytes(3).toString('hex');
    await tx`CREATE SCHEMA ${tx(backupSchema)}`;
    await tx`CREATE TABLE ${tx(backupSchema)}.pins AS TABLE public.pins`;
    await tx`CREATE TABLE ${tx(backupSchema)}.forms AS TABLE public.forms`;
    mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
    const backupDirectory = mkdtempSync(join(backupRoot, 'attempt-'));
    writeFileSync(resolve(backupDirectory, 'snapshot.json'), JSON.stringify(snapshot), {
      mode: 0o600,
      flag: 'wx',
    });
    writeFileSync(
      resolve(backupDirectory, 'rollback.sql'),
      readFileSync(new URL('./rollback-pin-village.sql', import.meta.url), 'utf8').replace(
        '__MIGRATION_SHA256__',
        hash
      ),
      { mode: 0o600 }
    );
    writeFileSync(
      resolve(backupDirectory, 'manifest.json'),
      JSON.stringify({ backupSchema, hash, baseline }),
      { mode: 0o600 }
    );
    for (const statement of migration.split('--> statement-breakpoint'))
      if (statement.trim()) await tx.unsafe(statement);
    const [remaining] = await tx`SELECT count(*)::int AS count FROM public.forms`;
    if (remaining.count !== audit.total) throw new Error('Form count changed during migration.');
    const [differences] = await tx`SELECT count(*)::int AS count FROM public.forms f
      FULL JOIN ${tx(backupSchema)}.forms b USING (id)
      WHERE f.id IS NULL OR b.id IS NULL OR to_jsonb(f) <> (to_jsonb(b) - 'village' - 'otherVillage')`;
    if (differences.count) throw new Error('Survey data changed during migration.');
    await tx`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await tx`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`;
    await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${entry.when})`;
    console.log(
      JSON.stringify({
        pins: snapshot.pins.length,
        forms: audit.total,
        answerDifferences: differences.count,
        backupSchema,
        backupDirectory,
      })
    );
  });
} finally {
  await sql.end();
}
