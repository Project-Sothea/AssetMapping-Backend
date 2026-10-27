/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect real JSON across the current upstream backend and SQLite client. */
import assert from 'node:assert/strict';
import { execFileSync, fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { before, after } from 'node:test';

import postgres from 'postgres';

const databaseName = `soform_qa_legacy_${process.pid}`;
const admin = postgres('postgresql://soform_qa@127.0.0.1:55433/postgres', { max: 1 });
const url = `postgresql://soform_qa@127.0.0.1:55433/${databaseName}`;
const sql = postgres(url, { max: 3 });
let directory = '',
  baseUrl = '',
  created = false;
let child: ReturnType<typeof fork>;
const sourceCommit = 'dc3131d4ba65f025873e0a6712f82ac9d866d7a7';
const { fixture } = createRequire(__filename)(
  '../../AssetMapping-Frontend/scripts/test-support/local-fixture.cjs'
);

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'soform-legacy-server-'));
  const archive = execFileSync('git', ['archive', sourceCommit]);
  execFileSync('tar', ['-x', '-C', directory], { input: archive });
  await symlink(resolve('node_modules'), join(directory, 'node_modules'));
  await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  created = true;
  for (const name of (await readdir(join(directory, 'drizzle')))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    await sql.unsafe(await readFile(join(directory, 'drizzle', name), 'utf8'));
  await writeFile(
    join(directory, 'qa-worker.ts'),
    `
import app from './src/server';
import { connectRedis } from './src/config/redis';
connectRedis().then(() => { const server = app.listen(0, '127.0.0.1', () => process.send?.({ port: (server.address() as any).port })); });
`
  );
  child = fork(join(directory, 'qa-worker.ts'), [], {
    cwd: directory,
    execArgv: ['--import', resolve('node_modules/tsx/dist/loader.mjs')],
    env: {
      ...process.env,
      DATABASE_URL: url,
      NODE_ENV: 'qa',
      REDIS_URL: 'redis://127.0.0.1:16380/1',
    },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let diagnostic = '';
  child.stderr?.on('data', (b) => {
    diagnostic += b.toString();
  });
  baseUrl = await new Promise<string>((resolvePort, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`legacy startup timeout ${diagnostic.slice(-1200)}`)),
      15000
    );
    child.once('message', (m: any) => {
      clearTimeout(timer);
      resolvePort(`http://127.0.0.1:${m.port}`);
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error(`legacy worker exited ${diagnostic.slice(-1200)}`));
    });
    child.once('error', reject);
  });
});
after(async () => {
  if (child && child.exitCode === null && !child.signalCode) {
    child.kill('SIGKILL');
    await new Promise<void>((r) => child.once('exit', () => r()));
  }
  await sql.end({ timeout: 1 });
  if (created) {
    await admin`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${databaseName} AND pid <> pg_backend_pid()`;
    await admin.unsafe(`DROP DATABASE "${databaseName}"`);
  }
  await admin.end({ timeout: 1 });
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function serverSync(
  payload: any,
  operation = 'create',
  entityType = 'pin',
  key = randomUUID()
) {
  const response = await fetch(baseUrl + '/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityType, operation, payload, idempotencyKey: key }),
  });
  assert.equal(response.status, 200);
  return (await response.json()).data;
}
async function device(t: any) {
  const id = randomUUID();
  const pin = await serverSync({
    id,
    name: 'QA legacy pin',
    lat: 1,
    lng: 2,
    images: [],
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const f = fixture(':memory:', { legacy: true, apiUrl: baseUrl, pinId: id });
  t.after(f.close);
  f.db.delete(f.schema.pins).run();
  await f.load('services/sync/localDataTransfer.ts').downloadLatest();
  assert.ok(
    f.db
      .select()
      .from(f.schema.pins)
      .all()
      .some((p: any) => p.id === pin.id)
  );
  return f;
}

test('exact current upstream lacks snapshot but the legacy client starts and downloads', async (t) => {
  assert.equal((await fetch(baseUrl + '/api/sync/snapshot')).status, 404);
  await device(t);
});

test('blank/NULL/false/zero answers create, edit, retry and download through the actual upstream server', async (t) => {
  const f = await device(t);
  const local = await f.formService.createForm({
    ...f.values,
    name: '',
    villageId: '',
    householdNumber: '',
    dataCollectionDate: '22 May 2026',
    age: 0,
    canAttendHealthScreening: false,
  });
  await f.syncQueue.uploadPendingChanges();
  assert.equal((await f.formService.getFormById(local.id)).status, 'synced');
  let [stored] = await sql`SELECT * FROM forms WHERE id=${local.id}`;
  assert.equal(stored.name, '');
  assert.equal(stored.villageId, '');
  assert.equal(stored.householdNumber, '');
  assert.equal(stored.age, 0);
  assert.equal(stored.canAttendHealthScreening, false);
  await f.formService.updateForm(local.id, {
    householdNumber: null,
    age: null,
    handwashingBeforeMeals: 'QA preserved response',
  });
  await f.syncQueue.uploadPendingChanges();
  [stored] = await sql`SELECT * FROM forms WHERE id=${local.id}`;
  assert.equal(stored.householdNumber, null);
  assert.equal(stored.age, null);
  const before = stored.version;
  await f.syncQueue.uploadPendingChanges();
  [stored] = await sql`SELECT * FROM forms WHERE id=${local.id}`;
  assert.equal(stored.version, before);
  const transfer = f.load('services/sync/localDataTransfer.ts');
  await transfer.clearLocalData();
  assert.equal(await f.formService.getFormById(local.id), null);
  await transfer.downloadLatest();
  assert.equal(
    (await f.formService.getFormById(local.id)).handwashingBeforeMeals,
    'QA preserved response'
  );
});

test('a committed create with lost reply is recovered by content without another server write', async (t) => {
  const f = await device(t);
  const local = await f.formService.createForm(f.values);
  const op = f.operations().find((o: any) => o.entityType === 'form');
  f.queue.stageOperation(op);
  await serverSync(JSON.parse(op.payload), 'create', 'form', op.idempotencyKey);
  await f.syncQueue.uploadPendingChanges();
  const [row] = await sql`SELECT version FROM forms WHERE id=${local.id}`;
  assert.equal(row.version, 1);
  assert.equal((await f.formService.getFormById(local.id)).status, 'synced');
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sync_inflight').get().n, 0);
});

test('known remote edits block stale uploads while preserving the local draft', async (t) => {
  const f = await device(t);
  const form = await f.formService.createForm(f.values);
  await f.syncQueue.uploadPendingChanges();
  const remote = (await (await fetch(baseUrl + '/api/forms/' + form.id)).json()).data;
  await serverSync({ ...remote, name: 'QA other phone edit' }, 'update', 'form');
  await f.formService.updateForm(form.id, { name: 'QA protected local draft' });
  await f.syncQueue.uploadPendingChanges();
  assert.equal((await f.formService.getFormById(form.id)).name, 'QA protected local draft');
  assert.equal((await f.formService.getFormById(form.id)).status, 'unsynced');
  const [row] = await sql`SELECT name FROM forms WHERE id=${form.id}`;
  assert.equal(row.name, 'QA other phone edit');
});

test('manual clearing and empty-device download reflect an offline server deletion', async (t) => {
  const f = await device(t);
  const form = await f.formService.createForm(f.values);
  await f.syncQueue.uploadPendingChanges();
  await serverSync({ id: form.id, version: 1 }, 'delete', 'form');
  const transfer = f.load('services/sync/localDataTransfer.ts');
  await transfer.clearLocalData();
  await transfer.downloadLatest();
  assert.equal(await f.formService.getFormById(form.id), null);
});

test('documents the remaining check-then-write race on the unchanged server', async (t) => {
  const first = await device(t);
  const original = await first.formService.createForm(first.values);
  await first.syncQueue.uploadPendingChanges();
  let checked = 0,
    releaseChecks: () => void;
  const bothChecked = new Promise<void>((resolve) => {
    releaseChecks = resolve;
  });
  let firstWritten: () => void;
  const firstDone = new Promise<void>((resolve) => {
    firstWritten = resolve;
  });
  function racingDevice(label: string, clientTime: string) {
    const f = fixture(':memory:', {
      legacy: true,
      apiUrl: baseUrl,
      pinId: first.pin.id,
      overrides: {
        '~/services/api/syncApi': {
          sync: async (request: any) => {
            if (request.entityType === 'form') {
              if (++checked === 2) releaseChecks();
              await bothChecked;
              if (label === 'B') await firstDone;
            }
            const response = await fetch(baseUrl + '/api/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(request),
            });
            const body = await response.json();
            if (label === 'A' && request.entityType === 'form') firstWritten();
            return body;
          },
        },
      },
    });
    t.after(f.close);
    return { f, label, clientTime };
  }
  const devices = [racingDevice('A', '2080-01-01'), racingDevice('B', '2090-01-01')];
  for (const { f, label, clientTime } of devices) {
    f.db.delete(f.schema.pins).run();
    await f.load('services/sync/localDataTransfer.ts').downloadLatest();
    await f.formService.updateForm(original.id, { name: 'QA concurrent ' + label });
    const op = f.operations().find((o: any) => o.entityType === 'form');
    f.sqlite
      .prepare('UPDATE sync_queue SET payload=? WHERE id=?')
      .run(JSON.stringify({ ...JSON.parse(op.payload), updatedAt: clientTime }), op.id);
  }
  await Promise.all(devices.map(({ f }) => f.syncQueue.uploadPendingChanges()));
  const [row] = await sql`SELECT name,version FROM forms WHERE id=${original.id}`;
  assert.equal(row.name, 'QA concurrent B');
  assert.equal(row.version, 3);
  for (const { f } of devices)
    assert.equal((await f.formService.getFormById(original.id)).status, 'synced');
  // Both passed the client check at version 1. Only a server-side CAS can make
  // these two concurrent edits conflict atomically instead of accepting both.
});
