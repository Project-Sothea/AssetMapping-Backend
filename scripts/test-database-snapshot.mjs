import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import postgres from 'postgres';

import { captureSnapshot, restoreSnapshot, snapshotHash } from './database-snapshot.mjs';

if (
  !process.env.TEST_DATABASE_URL ||
  !['localhost', '127.0.0.1'].includes(new URL(process.env.TEST_DATABASE_URL).hostname)
)
  throw new Error('Disposable localhost TEST_DATABASE_URL required');
const admin = postgres(process.env.TEST_DATABASE_URL, { max: 1 });
const id = Date.now();
const sourceName = `snapshot_source_${id}`;
const targetName = `snapshot_target_${id}`;
let source, target;
try {
  await admin`CREATE DATABASE ${admin(sourceName)}`;
  await admin`CREATE DATABASE ${admin(targetName)}`;
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.pathname = '/' + sourceName;
  source = postgres(url.href, { max: 1 });
  url.pathname = '/' + targetName;
  target = postgres(url.href, { max: 1 });
  const folder = new URL('../drizzle/', import.meta.url);
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', folder)));
  for (const entry of journal.entries) {
    for (const statement of readFileSync(new URL(`${entry.tag}.sql`, folder), 'utf8').split(
      '--> statement-breakpoint'
    ))
      if (statement.trim()) await source.unsafe(statement);
  }
  await source`CREATE SCHEMA drizzle`;
  await source`CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`;
  await source`INSERT INTO drizzle.__drizzle_migrations (hash,created_at) VALUES ('test',123456789)`;
  const pinId = '00000000-0000-4000-8000-000000000001';
  const formId = '00000000-0000-4000-8000-000000000002';
  await source`INSERT INTO pins(id,name,lat,lng,"cityVillage","createdAt") VALUES (${pinId},'Precision probe',1.1234567,2.1234567,'Srae Ou','2026-11-18T01:02:03.123456Z')`;
  await source`INSERT INTO forms(id,"pinId","villageId",name,"waterSources","selfCareActions") VALUES (${formId},${pinId},'A1','Survey probe',NULL,'[]')`;
  await source`INSERT INTO form_village_archive("formId",village,"otherVillage","pinVillage") VALUES (${formId},'Srae Ou',NULL,'Srae Ou')`;
  const snapshot = await captureSnapshot(source);
  await assert.rejects(restoreSnapshot(source, snapshot), /must be empty/);
  assert.equal(snapshotHash(await captureSnapshot(source)), snapshotHash(snapshot));
  const wrongSchema = structuredClone(snapshot);
  wrongSchema.schema.columns.find(
    (c) => c.table_name === 'forms' && c.column_name === 'waterSources'
  ).is_nullable = 'NO';
  await assert.rejects(restoreSnapshot(target, wrongSchema), /schema differs/);
  const [afterSchemaFailure] =
    await target`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema IN ('public','drizzle')`;
  assert.equal(
    afterSchemaFailure.count,
    0,
    'A schema mismatch must also roll back all rows and DDL'
  );
  await assert.rejects(
    restoreSnapshot(target, snapshot, { failAfterPins: true }),
    /Injected import failure/
  );
  const [count] =
    await target`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema IN ('public','drizzle')`;
  assert.equal(count.count, 0, 'A failed import must roll back both rows and DDL');
  assert.equal(await restoreSnapshot(target, snapshot), snapshotHash(snapshot));
  const [precision] = await target`SELECT to_char("createdAt",'US') AS us FROM pins`;
  assert.equal(precision.us, '123456');
  const [answers] = await target`SELECT "waterSources","selfCareActions" FROM forms`;
  assert.deepEqual(answers, { waterSources: null, selfCareActions: '[]' });
  await assert.rejects(target`UPDATE forms SET "pinId"=NULL WHERE id=${formId}`, /not-null/);
  await assert.rejects(
    target`UPDATE forms SET "pinId"='00000000-0000-4000-8000-999999999999' WHERE id=${formId}`,
    /foreign key/
  );
  console.log(
    JSON.stringify({
      passed: true,
      nonemptyRefusal: true,
      transactionRollback: true,
      retry: true,
      exactRowsAndSchema: true,
      timestampPrecision: true,
      foreignKey: true,
    })
  );
} finally {
  await source?.end();
  await target?.end();
  await admin`DROP DATABASE IF EXISTS ${admin(sourceName)}`;
  await admin`DROP DATABASE IF EXISTS ${admin(targetName)}`;
  await admin.end();
}
