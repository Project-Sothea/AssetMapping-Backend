import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import postgres from 'postgres';

const url = process.env.TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
  throw new Error('Disposable localhost TEST_DATABASE_URL required');
const sql = postgres(url, { max: 1 });
const folder = new URL('../drizzle/', import.meta.url);
const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', folder)));
const migration = readFileSync(new URL('0004_pin_owned_village.sql', folder), 'utf8');
const hash = createHash('sha256').update(migration).digest('hex');
const rollback = readFileSync(
  new URL('./rollback-pin-village.sql', import.meta.url),
  'utf8'
).replace('__MIGRATION_SHA256__', hash);
try {
  const tables =
    await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`;
  assert.equal(tables.length, 0, 'Database must be empty; never erase an existing database');
  for (const entry of journal.entries.filter((x) => x.idx < 4)) {
    await sql.unsafe(readFileSync(new URL(`${entry.tag}.sql`, folder), 'utf8'));
  }
  const snapshot = {};
  const legacySnapshot = process.env.TEST_LEGACY_SNAPSHOT
    ? JSON.parse(readFileSync(process.env.TEST_LEGACY_SNAPSHOT, 'utf8'))
    : undefined;
  for (const table of ['pins', 'forms']) {
    const response = legacySnapshot
      ? undefined
      : await fetch(`https://assetmapping-app-test-migration-test.up.railway.app/api/${table}`);
    if (response) assert(response.ok);
    const result = legacySnapshot
      ? { success: true, data: legacySnapshot[table] }
      : await response.json();
    assert.equal(result.success, true);
    assert(Array.isArray(result.data));
    snapshot[table] = result.data;
    for (const row of result.data) {
      const stored = Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, Array.isArray(v) ? JSON.stringify(v) : v])
      );
      await sql`INSERT INTO ${sql(table)} ${sql(stored)}`;
    }
  }
  // SQL migration itself refuses a conflicting dataset, transactionally.
  const id = snapshot.forms[0].id;
  await sql`UPDATE forms SET village='Wrong village' WHERE id=${id}`;
  await assert.rejects(
    sql.begin(async (tx) => {
      for (const statement of migration.split('--> statement-breakpoint'))
        if (statement.trim()) await tx.unsafe(statement);
    }),
    /reconciled dataset/
  );
  const [stillThere] = await sql`SELECT village FROM forms WHERE id=${id}`;
  assert.equal(stillThere.village, 'Wrong village');
  await sql`UPDATE forms SET village=${snapshot.forms[0].village} WHERE id=${id}`;
  // Even internally consistent data must match the independently audited snapshot.
  await sql`UPDATE forms SET name='Baseline refusal probe' WHERE id=${id}`;
  const changedBaseline = spawnSync(
    process.execPath,
    ['scripts/migrate-pin-village.mjs', '--confirmed-test-target'],
    {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: url },
    }
  );
  assert.notEqual(changedBaseline.status, 0);
  assert.match(changedBaseline.stderr, /Dataset differs from the audited/);
  await sql`UPDATE forms SET name=${snapshot.forms[0].name} WHERE id=${id}`;
  const dir = mkdtempSync(join(tmpdir(), 'sothea-village-rollback-'));
  // A failure after filesystem backup must not make the next attempt unusable.
  await sql.unsafe(
    `CREATE FUNCTION fail_archive_probe() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN IF position('form_village_archive' IN current_query()) > 0 THEN RAISE EXCEPTION 'injected archive failure'; END IF; END $$`
  );
  await sql.unsafe(
    `CREATE EVENT TRIGGER fail_archive_probe ON ddl_command_start EXECUTE FUNCTION fail_archive_probe()`
  );
  const failed = spawnSync(
    process.execPath,
    ['scripts/migrate-pin-village.mjs', '--confirmed-test-target'],
    {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: url, MIGRATION_BACKUP_DIRECTORY: dir },
    }
  );
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /injected archive failure/);
  await sql.unsafe('DROP EVENT TRIGGER fail_archive_probe');
  await sql.unsafe('DROP FUNCTION fail_archive_probe()');
  const child = spawnSync(
    process.execPath,
    ['scripts/migrate-pin-village.mjs', '--confirmed-test-target'],
    {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: url,
        MIGRATION_BACKUP_DIRECTORY: dir,
        RAILWAY_ENVIRONMENT_NAME: 'migration-test',
      },
    }
  );
  assert.equal(child.status, 0, child.stderr);
  const retry = spawnSync(
    process.execPath,
    ['scripts/migrate-pin-village.mjs', '--confirmed-test-target'],
    {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: url,
        MIGRATION_BACKUP_DIRECTORY: dir,
        RAILWAY_ENVIRONMENT_NAME: 'migration-test',
      },
    }
  );
  assert.equal(retry.status, 0, retry.stderr);
  assert.match(retry.stdout, /alreadyMigrated/);
  const report = JSON.parse(
    child.stdout
      .trim()
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .at(-1)
  );
  const backupSchema = report.backupSchema;
  const [schema] =
    await sql`SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='forms' AND column_name IN ('village','otherVillage')`;
  assert.equal(schema.count, 0);
  const [archives] = await sql`SELECT count(*)::int AS count FROM form_village_archive`;
  assert.equal(archives.count, snapshot.forms.length);
  const [backupPins] = await sql`SELECT count(*)::int AS count FROM ${sql(backupSchema)}.pins`;
  assert.equal(backupPins.count, snapshot.pins.length);
  const [changes] =
    await sql`SELECT count(*)::int AS count FROM forms f FULL JOIN ${sql(backupSchema)}.forms b USING(id) WHERE to_jsonb(f) IS DISTINCT FROM (to_jsonb(b)-'village'-'otherVillage')`;
  assert.equal(changes.count, 0);
  process.env.DATABASE_URL = url;
  const { FormService } = await import('../dist/services/form.service.js');
  const blankPin = snapshot.pins.find((pin) => !pin.cityVillage);
  await assert.rejects(
    FormService.upsertForm(
      {
        id: '00000000-0000-4000-8000-000000000002',
        pinId: blankPin.id,
        name: '',
        villageId: 'BLOCKED',
      },
      1
    ),
    /village/
  );
  const { db } = await import('../dist/db/index.js');
  await db.$client.end();
  // Rollback retains forms collected after migration, assigning their parent village.
  await sql`INSERT INTO forms (id, "pinId", name, "villageId") VALUES ('00000000-0000-4000-8000-000000000001',${snapshot.forms[0].pinId},'Rollback probe','PROBE')`;
  await sql.unsafe(rollback);
  const [restored] =
    await sql`SELECT count(*)::int AS count FROM forms f JOIN ${sql(backupSchema)}.forms b USING(id) WHERE to_jsonb(f) IS DISTINCT FROM to_jsonb(b)`;
  assert.equal(restored.count, 0);
  const [probe] =
    await sql`SELECT f.village, p."cityVillage" AS expected FROM forms f JOIN pins p ON p.id=f."pinId" WHERE f.id='00000000-0000-4000-8000-000000000001'`;
  assert.equal(probe.village, probe.expected);
  await sql`DELETE FROM forms WHERE id='00000000-0000-4000-8000-000000000001'`;
  const reapply = spawnSync(
    process.execPath,
    ['scripts/migrate-pin-village.mjs', '--confirmed-test-target'],
    {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: url, MIGRATION_BACKUP_DIRECTORY: dir },
    }
  );
  assert.equal(reapply.status, 0, reapply.stderr);
  assert(!reapply.stdout.includes(backupSchema), 'Reapply must create a new immutable backup');
  const editedParent = snapshot.forms[0].pinId;
  await sql`UPDATE pins SET "cityVillage"='Test Village' WHERE id=${editedParent}`;
  await sql.unsafe(rollback);
  const [wrongRestoredVillage] =
    await sql`SELECT count(*)::int AS count FROM forms WHERE "pinId"=${editedParent} AND village <> 'Test Village'`;
  assert.equal(
    wrongRestoredVillage.count,
    0,
    'Rollback must retain a post-migration pin village edit on every linked form'
  );
  console.log(
    JSON.stringify({
      pins: snapshot.pins.length,
      forms: snapshot.forms.length,
      unchangedSurveyRows: snapshot.forms.length,
      preflightRefusedConflicts: true,
      preflightRefusedChangedBaseline: true,
      rollbackRestoredOriginalRows: true,
      rollbackPreservedNewForm: true,
      rollbackFollowedEditedPin: true,
      retryAfterFilesystemBackupFailure: true,
      reapplyAfterRollback: true,
    })
  );
} finally {
  await sql.end();
}
