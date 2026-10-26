/* eslint-disable @typescript-eslint/no-explicit-any -- Tests inspect deliberately untrusted HTTP JSON and native transport doubles. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test, { after, before } from 'node:test';

import postgres from 'postgres';

// Never accepts a supplied database URL. This runner owns and drops only its
// own newly-created database on the guarded local QA cluster.
const databaseName = `soform_qa_system_${process.pid}`;
const admin = postgres('postgresql://soform_qa@127.0.0.1:55433/postgres', { max: 1 });
const url = `postgresql://soform_qa@127.0.0.1:55433/${databaseName}`;
const sql = postgres(url, { max: 5 });
let server: import('node:http').Server;
let baseUrl = '';
process.env.NODE_ENV = 'qa';
process.env.DATABASE_URL = url;
process.env.REDIS_URL = 'redis://127.0.0.1:16380/1';
let created = false;

before(async () => {
  await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  created = true;
  for (const name of (await readdir('drizzle')).filter((f) => f.endsWith('.sql')).sort()) {
    await sql.unsafe(await readFile(`drizzle/${name}`, 'utf8'));
  }
  const { default: app } = await import('../src/server');
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const { client } = await import('../src/db');
  await client.end({ timeout: 1 });
  await sql.end({ timeout: 1 });
  // App's pool is process-local. Terminate only connections to the owned DB.
  if (created) {
    await admin`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${databaseName} AND pid <> pg_backend_pid()`;
    await admin.unsafe(`DROP DATABASE "${databaseName}"`);
  }
  await admin.end({ timeout: 1 });
});

function apiFetch(input: string, options: RequestInit = {}) {
  return globalThis.fetch(input, {
    ...options,
    headers: { 'X-SoForm-Sync-Protocol': '2', ...options.headers },
  });
}

async function sync(
  payload: Record<string, unknown>,
  operation = 'create',
  key = randomUUID(),
  entityType = 'pin'
) {
  const response = await apiFetch(`${baseUrl}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: key, operation, entityType, payload }),
  });
  const text = await response.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { nonJson: true };
  }
  return { status: response.status, body };
}
const pin = () => ({
  id: randomUUID(),
  name: 'QA synthetic pin',
  lat: 1,
  lng: 2,
  images: [],
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

test('stale device timestamps cannot overwrite newer server answers', async () => {
  const original = pin();
  const created = await sync(original);
  assert.equal(created.status, 200);
  const first = await sync(
    { ...created.body.data, name: 'QA accepted update', updatedAt: '2099-01-01' },
    'update'
  );
  assert.equal(first.status, 200);
  const stale = await sync(
    { ...created.body.data, name: 'QA stale device update', updatedAt: '2100-01-01' },
    'update'
  );
  assert.equal(stale.status, 409);
  const [stored] = await sql`SELECT name FROM pins WHERE id=${original.id}`;
  assert.equal(stored.name, 'QA accepted update');
});

test('concurrent requests from the same version cannot both succeed', async () => {
  const original = pin();
  const created = await sync(original);
  const requests = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      sync({ ...created.body.data, name: `QA competing edit ${i}` }, 'update')
    )
  );
  assert.equal(requests.filter((r) => r.status === 200).length, 1);
  assert.equal(requests.filter((r) => r.status === 409).length, 11);
});

test('the same request must not execute twice when Redis is unavailable', async () => {
  const original = pin();
  const key = randomUUID();
  const first = await sync(original, 'create', key);
  const retry = await sync(original, 'create', key);
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.body.data, first.body.data);
  const [row] = await sql`SELECT version FROM pins WHERE id=${original.id}`;
  assert.equal(row.version, 1);
});

test('same retry key with different content is rejected without changing data', async () => {
  const original = pin();
  const key = randomUUID();
  const first = await sync(original, 'create', key);
  assert.equal(first.status, 200);
  const changed = await sync({ ...original, name: 'QA changed payload' }, 'create', key);
  assert.equal(changed.status, 409);
  assert.equal(changed.body.nonJson, undefined);
  const [stored] = await sql`SELECT name, version FROM pins WHERE id=${original.id}`;
  assert.equal(stored.name, original.name);
  assert.equal(stored.version, 1);
});

test('twenty concurrent replays commit one receipt and return the same response', async () => {
  const original = pin();
  const key = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 20 }, () => sync(original, 'create', key))
  );
  assert.ok(results.every((r) => r.status === 200));
  for (const result of results) assert.deepEqual(result.body.data, results[0].body.data);
  const [receipt] =
    await sql`SELECT count(*)::int n FROM sync_receipts WHERE idempotency_key=${key}`;
  assert.equal(receipt.n, 1);
});

test('a failure to persist the receipt rolls back the entity write', async () => {
  const original = pin();
  const key = 'qa-fail-' + randomUUID();
  await sql.unsafe(
    `CREATE FUNCTION qa_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.idempotency_key LIKE 'qa-fail-%' THEN RAISE EXCEPTION 'QA receipt failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER qa_receipt_failure BEFORE INSERT ON sync_receipts FOR EACH ROW EXECUTE FUNCTION qa_receipt_failure()`
  );
  try {
    const result = await sync(original, 'create', key);
    assert.equal(result.status, 500);
    assert.equal(result.body.nonJson, undefined);
    assert.equal((await sql`SELECT * FROM pins WHERE id=${original.id}`).length, 0);
    assert.equal((await sql`SELECT * FROM sync_receipts WHERE idempotency_key=${key}`).length, 0);
  } finally {
    await sql.unsafe(
      'DROP TRIGGER qa_receipt_failure ON sync_receipts; DROP FUNCTION qa_receipt_failure()'
    );
  }
  assert.equal((await sync(original, 'create', key)).status, 200);
});

const formFor = (pinId: string) => ({
  id: randomUUID(),
  pinId,
  name: 'QA synthetic response',
  village: 'QA village',
  villageId: 'QA-1',
  version: 1,
  age: null,
  canAttendHealthScreening: false,
  otherVillage: null,
  handwashingBeforeMeals: '',
  longTermConditions: [],
  managementMethods: ['NA', 'សាកល្បង', 'quote"\ncomma,'],
});

test('all answer fields round-trip through real HTTP and PostgreSQL', async () => {
  const { FORM_ARRAY_FIELDS } = await import('@assetmapping/shared-types');
  const { forms } = await import('@assetmapping/shared-types/schema');
  const { getTableColumns } = await import('drizzle-orm');
  const household = pin();
  await sync(household);
  const form: Record<string, unknown> = formFor(household.id);
  for (const [key, column] of Object.entries(getTableColumns(forms))) {
    if (['id', 'pinId', 'version', 'createdAt', 'updatedAt', 'status'].includes(key)) continue;
    form[key] = (FORM_ARRAY_FIELDS as readonly string[]).includes(key)
      ? ['', 'NA', 'សាកល្បង', 'quote"\ncomma,']
      : column.dataType === 'number'
        ? 0
        : column.dataType === 'boolean'
          ? false
          : `QA_${key}_សាកល្បង`;
  }
  form.otherVillage = null;
  form.handwashingBeforeMealsReason = '';
  const result = await sync(form, 'create', randomUUID(), 'form');
  assert.equal(result.status, 200);
  const read = await (await apiFetch(`${baseUrl}/api/forms/${form.id}`)).json();
  for (const key of Object.keys(form)) assert.deepEqual(read.data[key], form[key], key);
});

for (const householdNumber of ['', null]) {
  test(`blank name and village ID plus ${JSON.stringify(householdNumber)} household ID survive sync, edit and snapshot`, async () => {
    const household = pin();
    assert.equal((await sync(household)).status, 200);
    const form = {
      ...formFor(household.id),
      name: '',
      villageId: '',
      householdNumber,
      dataCollectionDate: '22 May 2026',
    };
    const created = await sync(form, 'create', randomUUID(), 'form');
    assert.equal(created.status, 200);
    const edited = await sync({ ...created.body.data, age: 0 }, 'update', randomUUID(), 'form');
    assert.equal(edited.status, 200);
    const snapshot = await (await apiFetch(`${baseUrl}/api/sync/snapshot`)).json();
    const downloaded = snapshot.data.forms.find((row: any) => row.id === form.id);
    const [stored] =
      await sql`SELECT name, "villageId", "householdNumber", "dataCollectionDate", age FROM forms WHERE id=${form.id}`;
    for (const row of [created.body.data, edited.body.data, downloaded, stored]) {
      assert.equal(row.name, '');
      assert.equal(row.villageId, '');
      assert.equal(row.householdNumber, householdNumber);
      assert.equal(row.dataCollectionDate, '22 May 2026');
    }
    assert.equal(downloaded.age, 0);
    assert.equal(stored.age, 0);
  });
}

for (const invalid of [
  'string age',
  'fractional age',
  'negative age',
  'string boolean',
  'string array',
  'bad pin UUID',
  'unknown field',
]) {
  test(`reject ${invalid} without a partial form or receipt`, async () => {
    const household = pin();
    await sync(household);
    const form: Record<string, unknown> = formFor(household.id);
    if (invalid === 'string age') form.age = '23';
    if (invalid === 'fractional age') form.age = 23.5;
    if (invalid === 'negative age') form.age = -1;
    if (invalid === 'string boolean') form.canAttendHealthScreening = 'false';
    if (invalid === 'string array') form.longTermConditions = '[]';
    if (invalid === 'bad pin UUID') form.pinId = 'not-uuid';
    if (invalid === 'unknown field') form.unrecognisedQuestion = 'QA';
    const key = randomUUID();
    const result = await sync(form, 'create', key, 'form');
    assert.equal(result.status, 400);
    assert.equal((await sql`SELECT * FROM forms WHERE id=${form.id as string}`).length, 0);
    assert.equal((await sql`SELECT * FROM sync_receipts WHERE idempotency_key=${key}`).length, 0);
  });
}

test('stale deletion cannot delete a newer response', async () => {
  const household = pin();
  await sync(household);
  const original = formFor(household.id);
  const created = await sync(original, 'create', randomUUID(), 'form');
  assert.equal(created.status, 200);
  const edited = await sync(
    { ...created.body.data, name: 'QA newer saved answer' },
    'update',
    randomUUID(),
    'form'
  );
  assert.equal(edited.status, 200);
  const removed = await sync(
    { id: original.id, pinId: household.id, version: 1 },
    'delete',
    randomUUID(),
    'form'
  );
  assert.equal(removed.status, 409);
  const [row] = await sql`SELECT name FROM forms WHERE id=${original.id}`;
  assert.equal(row.name, 'QA newer saved answer');
});

test('offline create-then-delete succeeds without resurrecting the deleted UUID', async () => {
  const household = pin();
  await sync(household);
  const original = formFor(household.id);
  assert.equal(
    (
      await sync(
        { id: original.id, pinId: household.id, version: 1 },
        'delete',
        randomUUID(),
        'form'
      )
    ).status,
    200
  );
  assert.equal((await sync(original, 'create', randomUUID(), 'form')).status, 409);
  assert.equal((await sql`SELECT * FROM forms WHERE id=${original.id}`).length, 0);
});

test('pin deletion concurrent with form creation leaves no orphan or resurrected child', async () => {
  const household = pin();
  await sync(household);
  const original = formFor(household.id);
  const [removed, created] = await Promise.all([
    sync({ id: household.id, version: 1 }, 'delete'),
    sync(original, 'create', randomUUID(), 'form'),
  ]);
  assert.equal(removed.status, 200);
  assert.ok([200, 409].includes(created.status));
  assert.equal((await sql`SELECT * FROM forms WHERE id=${original.id}`).length, 0);
  assert.equal((await sync(original, 'create', randomUUID(), 'form')).status, 409);
});

test('snapshot stays internally consistent while pin/form writes and cascades run', async () => {
  const writing = (async () => {
    for (let i = 0; i < 15; i++) {
      const household = pin();
      await sync(household);
      await sync(formFor(household.id), 'create', randomUUID(), 'form');
      await sync({ id: household.id, version: 1 }, 'delete');
    }
  })();
  for (let i = 0; i < 25; i++) {
    const response = await apiFetch(`${baseUrl}/api/sync/snapshot`);
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.protocolVersion, 1);
    const ids = new Set(data.pins.map((p: any) => p.id));
    assert.ok(data.forms.every((f: any) => ids.has(f.pinId)));
  }
  await writing;
});

test('real client SQLite queue survives lost acknowledgement and replays once', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(__filename);
  const { fixture } = require('../../AssetMapping-Frontend/scripts/test-support/local-fixture.cjs');
  const household = pin();
  await sync(household);
  const f = fixture(':memory:', { apiUrl: baseUrl, pinId: household.id });
  const actualFetch = globalThis.fetch;
  let drop = true;
  try {
    const form = await f.formService.createForm({ ...f.values, age: null });
    globalThis.fetch = async (input: any, init: any) => {
      const response = await actualFetch(input, init);
      if (drop && init?.method === 'POST' && JSON.parse(init.body).entityType === 'form') {
        drop = false;
        throw new Error('Network error: QA lost acknowledgement');
      }
      return response;
    };
    await f.syncQueue.processQueue();
    const waiting = f.operations().find((op: any) => op.entityType === 'form');
    assert.equal(waiting.status, 'pending');
    assert.equal((await f.formService.getFormById(form.id)).status, 'unsynced');
    globalThis.fetch = actualFetch;
    await f.syncQueue.processQueue();
    const [row] = await sql`SELECT version,age FROM forms WHERE id=${form.id}`;
    assert.equal(row.version, 1);
    assert.equal(row.age, null);
    assert.equal(f.operations().find((op: any) => op.entityType === 'form').status, 'completed');
    assert.equal((await f.formService.getFormById(form.id)).status, 'synced');
    assert.equal(
      (await sql`SELECT * FROM sync_receipts WHERE idempotency_key=${waiting.idempotencyKey}`)
        .length,
      1
    );
  } finally {
    globalThis.fetch = actualFetch;
    f.close();
  }
});

test('two SQLite devices keep the losing edit locally rather than silently overwriting it', async () => {
  const { createRequire } = await import('node:module');
  const { fixture } = createRequire(__filename)(
    '../../AssetMapping-Frontend/scripts/test-support/local-fixture.cjs'
  );
  const household = pin();
  await sync(household);
  const a = fixture(':memory:', { apiUrl: baseUrl, pinId: household.id });
  const b = fixture(':memory:', { apiUrl: baseUrl, pinId: household.id });
  try {
    await a.pulls.pullSnapshot();
    const form = await a.formService.createForm(a.values);
    await a.syncQueue.processQueue();
    await a.pulls.pullSnapshot();
    await b.pulls.pullSnapshot();
    await a.formService.updateForm(form.id, { name: 'QA device A edit' });
    await b.formService.updateForm(form.id, { name: 'QA device B edit' });
    await Promise.all([a.syncQueue.processQueue(), b.syncQueue.processQueue()]);
    const ops = [a, b].map((f) =>
      f.operations().find((op: any) => op.entityType === 'form' && op.status !== 'completed')
    );
    assert.equal(ops.filter((op) => op?.status === 'failed').length, 1);
    assert.equal((await a.formService.getFormById(form.id)).name, 'QA device A edit');
    assert.equal((await b.formService.getFormById(form.id)).name, 'QA device B edit');
    await a.pulls.pullSnapshot();
    await b.pulls.pullSnapshot();
    const loser = ops[0] ? a : b;
    assert.equal((await loser.formService.getFormById(form.id)).status, 'unsynced');
    assert.equal((await sql`SELECT * FROM forms WHERE id=${form.id}`).length, 1);
  } finally {
    a.close();
    b.close();
  }
});

async function worker() {
  const { fork } = await import('node:child_process');
  const child = fork('scripts/test-support/http-worker.ts', [], {
    execArgv: ['--import', 'tsx'],
    env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'qa' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('QA worker startup timeout')), 10000);
    child.once('message', (value: any) => {
      clearTimeout(timer);
      resolve(value.port);
    });
    child.once('error', reject);
  });
  return {
    child,
    url: `http://127.0.0.1:${port}`,
    stop: async (signal: NodeJS.Signals = 'SIGTERM') => {
      if (child.exitCode !== null || child.signalCode) return;
      child.kill(signal);
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    },
  };
}
async function workerSync(target: string, payload: Record<string, unknown>, key: string) {
  return apiFetch(`${target}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: key, entityType: 'pin', operation: 'create', payload }),
  });
}

test('API process death after commit retains the receipt across a real process restart', async () => {
  const original = pin(),
    key = randomUUID();
  let running = await worker();
  try {
    const first = await (await workerSync(running.url, original, key)).json();
    assert.equal(first.success, true);
    await running.stop('SIGKILL');
    running = await worker();
    const replay = await (await workerSync(running.url, original, key)).json();
    assert.deepEqual(replay.data, first.data);
    const [row] = await sql`SELECT version FROM pins WHERE id=${original.id}`;
    assert.equal(row.version, 1);
  } finally {
    await running.stop();
  }
});

test('API process death during the entity/receipt transaction rolls both back', async () => {
  const original = pin(),
    key = 'qa-kill-' + randomUUID();
  let running = await worker();
  await sql.unsafe(
    `CREATE FUNCTION qa_pause_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.idempotency_key LIKE 'qa-kill-%' THEN PERFORM pg_sleep(3); END IF; RETURN NEW; END $$; CREATE TRIGGER qa_pause_receipt BEFORE INSERT ON sync_receipts FOR EACH ROW EXECUTE FUNCTION qa_pause_receipt()`
  );
  try {
    const attempt = workerSync(running.url, original, key).catch(() => null);
    let paused = false;
    for (let i = 0; i < 40; i++) {
      const rows =
        await sql`SELECT 1 FROM pg_stat_activity WHERE datname=${databaseName} AND wait_event='PgSleep'`;
      if (rows.length) {
        paused = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(paused, true);
    await running.stop('SIGKILL');
    await attempt;
    assert.equal((await sql`SELECT * FROM pins WHERE id=${original.id}`).length, 0);
    assert.equal((await sql`SELECT * FROM sync_receipts WHERE idempotency_key=${key}`).length, 0);
  } finally {
    await running.stop();
    await sql.unsafe(
      'DROP TRIGGER qa_pause_receipt ON sync_receipts; DROP FUNCTION qa_pause_receipt()'
    );
  }
  running = await worker();
  try {
    assert.equal((await workerSync(running.url, original, key)).status, 200);
  } finally {
    await running.stop();
  }
});

test('phone-process death after server commit and a newer offline edit replays the old revision then saves the latest once', async () => {
  const { fork } = await import('node:child_process');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createRequire } = await import('node:module');
  const directory = await mkdtemp(join(tmpdir(), 'soform-qa-phone-crash-'));
  const filename = join(directory, 'local.db');
  const household = pin();
  await sync(household);
  const child = fork('scripts/test-support/sqlite-client-worker.cjs', [], {
    env: { ...process.env, QA_SQLITE_FILE: filename, QA_API_URL: baseUrl, QA_PIN_ID: household.id },
    execArgv: [],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  let f: any;
  try {
    const saved = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('QA phone worker timeout')), 15000);
      child.once('message', (message: any) => {
        clearTimeout(timer);
        if (message.error) reject(new Error(message.error));
        else resolve(message);
      });
      child.once('error', reject);
    });
    assert.equal(saved.journalCount, 1);
    child.kill('SIGKILL');
    await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    const { fixture } = createRequire(__filename)(
      '../../AssetMapping-Frontend/scripts/test-support/local-fixture.cjs'
    );
    f = fixture(filename, { reopen: true, apiUrl: baseUrl, pinId: household.id });
    assert.equal(
      (await f.formService.getFormById(saved.formId)).name,
      'QA latest edit before process death'
    );
    await f.syncQueue.processQueue();
    const [serverRow] = await sql`SELECT name,version FROM forms WHERE id=${saved.formId}`;
    assert.equal(serverRow.name, 'QA latest edit before process death');
    assert.equal(serverRow.version, 2);
    assert.equal((await f.formService.getFormById(saved.formId)).status, 'synced');
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sync_inflight').get().n, 0);
  } finally {
    if (child.exitCode === null && !child.signalCode) {
      child.kill('SIGKILL');
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    }
    f?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('the actual API bootstrap starts with Redis down and retains durable replay protection', async () => {
  const net = await import('node:net');
  const { fork } = await import('node:child_process');
  const reserve = net.createServer();
  await new Promise<void>((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const port = (reserve.address() as import('node:net').AddressInfo).port;
  await new Promise<void>((resolve) => reserve.close(() => resolve()));
  const child = fork('src/server.ts', [], {
    execArgv: ['--import', 'tsx'],
    env: {
      ...process.env,
      DATABASE_URL: url,
      NODE_ENV: 'qa',
      PORT: String(port),
      REDIS_URL: 'redis://127.0.0.1:1/0',
    },
    stdio: 'ignore',
  });
  const target = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try {
        const health = await apiFetch(`${target}/health`);
        if (health.ok) {
          ready = true;
          break;
        }
      } catch {
        /* The worker may still be starting. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true);
    const original = pin(),
      key = randomUUID();
    const first = await (await workerSync(target, original, key)).json(),
      again = await (await workerSync(target, original, key)).json();
    assert.equal(first.success, true);
    assert.deepEqual(again.data, first.data);
  } finally {
    child.kill('SIGKILL');
    await new Promise<void>((resolve) => child.once('exit', () => resolve()));
  }
});

test('old clients are refused before they can push or pull over saved local data', async () => {
  const original = pin();
  const response = await globalThis.fetch(`${baseUrl}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      operation: 'create',
      entityType: 'pin',
      payload: original,
    }),
  });
  assert.equal(response.status, 426);
  const read = await globalThis.fetch(`${baseUrl}/api/pins`);
  assert.equal(read.status, 426);
  assert.equal((await sql`SELECT * FROM pins WHERE id=${original.id}`).length, 0);
});
