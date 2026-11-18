import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';

const magic = Buffer.from('SOFORM01');
const context = 'sothea-private-database-snapshot-v1';
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  return value;
}
export function snapshotHash(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
export function sealSnapshot(value, secret) {
  if (!secret) throw new Error('Snapshot encryption secret required');
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = hkdfSync('sha256', secret, salt, context, 32);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(magic);
  const data = Buffer.concat([cipher.update(gzipSync(JSON.stringify(value))), cipher.final()]);
  return Buffer.concat([magic, salt, iv, cipher.getAuthTag(), data]);
}
export function openSnapshot(bytes, secret) {
  if (!bytes.subarray(0, 8).equals(magic)) throw new Error('Invalid snapshot format');
  const key = hkdfSync('sha256', secret, bytes.subarray(8, 40), context, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(40, 52));
  decipher.setAAD(magic);
  decipher.setAuthTag(bytes.subarray(52, 68));
  return JSON.parse(
    gunzipSync(Buffer.concat([decipher.update(bytes.subarray(68)), decipher.final()]))
  );
}

export async function captureSnapshot(sql) {
  return sql.begin('isolation level repeatable read read only', captureTransaction);
}

async function captureTransaction(tx) {
  await tx`SET LOCAL TIME ZONE 'UTC'`;
  const tables = await tx`SELECT table_schema, table_name FROM information_schema.tables
    WHERE table_schema IN ('public','drizzle') AND table_type='BASE TABLE' ORDER BY 1,2`;
  const expected = new Set([
    'public.pins',
    'public.forms',
    'public.form_village_archive',
    'drizzle.__drizzle_migrations',
  ]);
  if (tables.some((t) => !expected.has(`${t.table_schema}.${t.table_name}`)))
    throw new Error('Unexpected application table; expand the audited backup before proceeding');
  const rows = {};
  for (const { table_schema: schema, table_name: name } of tables) {
    const [result] =
      await tx`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS rows FROM ${tx(schema)}.${tx(name)} t`;
    rows[`${schema}.${name}`] = result.rows;
  }
  const columns =
    await tx`SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default,ordinal_position
    FROM information_schema.columns WHERE table_schema IN ('public','drizzle') ORDER BY 1,2,7`;
  const constraints =
    await tx`SELECT n.nspname AS schema,t.relname AS table_name,c.conname,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname IN ('public','drizzle') ORDER BY 1,2,3`;
  const indexes =
    await tx`SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('public','drizzle') ORDER BY 1,2,3`;
  return { format: 1, tables: rows, schema: { columns, constraints, indexes } };
}

function portableSnapshot(snapshot) {
  // PostgreSQL 18 additionally catalogs NOT NULL rules as constraints; older versions
  // expose them only through columns.is_nullable, which is compared in full below.
  return {
    ...snapshot,
    schema: {
      ...snapshot.schema,
      constraints: snapshot.schema.constraints.filter((c) => !c.definition.startsWith('NOT NULL ')),
    },
  };
}

export async function restoreSnapshot(sql, snapshot, { failAfterPins = false } = {}) {
  if (snapshot.format !== 1 || !snapshot.tables['public.pins'] || !snapshot.tables['public.forms'])
    throw new Error('Unsupported snapshot');
  const migrated = Object.hasOwn(snapshot.tables, 'public.form_village_archive');
  const folder = new URL('../drizzle/', import.meta.url);
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', folder)));
  await sql.begin(async (tx) => {
    await tx`SET LOCAL lock_timeout = '5s'`;
    await tx`SET LOCAL TIME ZONE 'UTC'`;
    const [existing] =
      await tx`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema IN ('public','drizzle')`;
    if (existing.count)
      throw new Error('Restore target must be empty; existing data will never be replaced');
    for (const entry of journal.entries.filter((x) => migrated || x.idx < 4)) {
      const migration = readFileSync(new URL(`${entry.tag}.sql`, folder), 'utf8');
      for (const statement of migration.split('--> statement-breakpoint'))
        if (statement.trim()) await tx.unsafe(statement);
    }
    await tx`CREATE SCHEMA drizzle`;
    await tx`CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`;
    for (const name of [
      'public.pins',
      'public.forms',
      'public.form_village_archive',
      'drizzle.__drizzle_migrations',
    ]) {
      if (!Object.hasOwn(snapshot.tables, name)) continue;
      const identifier = tx(name);
      await tx`INSERT INTO ${identifier} SELECT * FROM jsonb_populate_recordset(NULL::${identifier}, ${tx.json(snapshot.tables[name])})`;
      if (name === 'public.pins' && failAfterPins) throw new Error('Injected import failure');
    }
    await tx`SELECT setval(pg_get_serial_sequence('drizzle.__drizzle_migrations','id'), coalesce((SELECT max(id) FROM drizzle.__drizzle_migrations),1), EXISTS(SELECT 1 FROM drizzle.__drizzle_migrations))`;
    // Compare inside the transaction: a mismatch must roll back all imported data and DDL.
    for (const [name, rows] of Object.entries(snapshot.tables)) {
      const [schema, table] = name.split('.');
      const [result] =
        await tx`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM ${tx(schema)}.${tx(table)} t`;
      if (snapshotHash(rows) !== snapshotHash(result.rows))
        throw new Error(`Restore differs in ${name}`);
    }
    const restored = await captureTransaction(tx);
    if (snapshotHash(portableSnapshot(restored)) !== snapshotHash(portableSnapshot(snapshot)))
      throw new Error('Restored schema differs; import rolled back');
  });
  return snapshotHash(snapshot);
}
