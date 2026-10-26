import { createHash } from 'node:crypto';

import type { Form, Pin, SyncItemRequest, SyncResult } from '@assetmapping/shared-types';
import { FORM_ARRAY_FIELDS } from '@assetmapping/shared-types';
import { forms, pins, syncDeletions, syncReceipts } from '@assetmapping/shared-types/schema';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';

import { db } from '../db';
import { mapFormDbToForm, mapPinDbToPin, sanitizeFormForDb, sanitizePinForDb } from '../db/utils';
import { AppError, ConflictError } from '../types';
import { logger } from '../utils/logger';

import { syncEventPublisher } from './sync/publishers/sync-event.publisher';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

function validate(request: SyncItemRequest) {
  if (
    !request ||
    !['pin', 'form'].includes(request.entityType) ||
    !['create', 'update', 'delete'].includes(request.operation)
  )
    throw new AppError(400, 'Invalid sync operation.');
  if (
    typeof request.idempotencyKey !== 'string' ||
    !request.idempotencyKey.trim() ||
    request.idempotencyKey.length > 200
  )
    throw new AppError(400, 'A stable idempotency key is required.');
  const payload = request.payload;
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    typeof payload.id !== 'string' ||
    !uuidPattern.test(payload.id)
  )
    throw new AppError(400, 'A valid entity UUID is required.');
  if (!Number.isSafeInteger(payload.version) || (payload.version as number) < 1)
    throw new AppError(400, 'The saved entity version is required.');
  const table = request.entityType === 'pin' ? pins : forms;
  const columns = getTableColumns(table);
  const arrays = new Set<string>(request.entityType === 'pin' ? ['images'] : FORM_ARRAY_FIELDS);
  for (const [key, value] of Object.entries(payload)) {
    const column = columns[key as keyof typeof columns];
    if (!column) throw new AppError(400, `Unknown field: ${key}`);
    if (value === undefined) continue;
    if (value === null) {
      if (column.notNull || arrays.has(key)) throw new AppError(400, `Invalid null field: ${key}`);
      continue;
    }
    if (arrays.has(key)) {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
        throw new AppError(400, `Invalid selection list: ${key}`);
    } else if (column.dataType === 'date') {
      if (
        !['string', 'number', 'object'].includes(typeof value) ||
        !Number.isFinite(new Date(value as string).getTime())
      )
        throw new AppError(400, `Invalid date: ${key}`);
    } else if (
      typeof value !== column.dataType ||
      (typeof value === 'number' && !Number.isFinite(value))
    )
      throw new AppError(400, `Invalid field type: ${key}`);
  }
  if (
    payload.age !== undefined &&
    payload.age !== null &&
    (!Number.isSafeInteger(payload.age) || (payload.age as number) < 0)
  )
    throw new AppError(400, 'Age must be a nonnegative whole number or null.');
  if (request.entityType === 'pin' && request.operation !== 'delete') {
    if (
      typeof payload.lat !== 'number' ||
      Math.abs(payload.lat) > 90 ||
      typeof payload.lng !== 'number' ||
      Math.abs(payload.lng) > 180 ||
      typeof payload.name !== 'string'
    )
      throw new AppError(400, 'A pin needs a name and valid coordinates.');
  }
  if (request.entityType === 'form' && request.operation !== 'delete') {
    if (
      typeof payload.pinId !== 'string' ||
      !uuidPattern.test(payload.pinId) ||
      ['name', 'village', 'villageId'].some((key) => typeof payload[key] !== 'string')
    )
      throw new AppError(400, 'A form needs its household pin and required text fields.');
  }
}

export class SyncService {
  async sync(request: SyncItemRequest): Promise<SyncResult> {
    validate(request);
    const hash = createHash('sha256')
      .update(
        canonical({
          entityType: request.entityType,
          operation: request.operation,
          payload: request.payload,
        })
      )
      .digest('hex');
    const id = (request.payload.id as string).toLowerCase();
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await tx.execute(sql`SET LOCAL statement_timeout = '20s'`);
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`receipt:${request.idempotencyKey}`}, 0))`
      );
      const [receipt] = await tx
        .select()
        .from(syncReceipts)
        .where(eq(syncReceipts.key, request.idempotencyKey));
      if (receipt) {
        if (receipt.requestHash !== hash)
          throw new ConflictError('This retry key belongs to a different saved change.');
        return { result: receipt.response as SyncResult, replayed: true };
      }
      // Lock the parent pin before a form. Pin deletion and child writes use the
      // same order, so a concurrent cascade cannot orphan/recreate a response.
      const preliminary =
        request.entityType === 'form'
          ? (await tx.select().from(forms).where(eq(forms.id, id)))[0]
          : undefined;
      const parentId =
        request.entityType === 'pin'
          ? id
          : (preliminary?.pinId ?? (request.payload.pinId as string | undefined))?.toLowerCase();
      if (!parentId || !uuidPattern.test(parentId))
        throw new AppError(400, 'A form deletion needs its household pin UUID.');
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`pin:${parentId}`}, 0))`
      );
      if (request.entityType === 'form')
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`form:${id}`}, 0))`);
      const table = request.entityType === 'pin' ? pins : forms;
      const [existing] = await tx.select().from(table).where(eq(table.id, id));
      const [deletion] = await tx
        .select()
        .from(syncDeletions)
        .where(
          and(eq(syncDeletions.entityType, request.entityType), eq(syncDeletions.entityId, id))
        );
      if (deletion && request.operation !== 'delete')
        throw new ConflictError(
          'This record was deleted. Your local change is preserved for review.'
        );
      if (
        existing &&
        (request.operation === 'create' || existing.version !== request.payload.version)
      )
        throw new ConflictError(
          'Conflict: the server has a different version. Your local change is preserved for review.'
        );
      if (!existing && request.operation === 'update')
        throw new ConflictError(
          'This record no longer exists. Your local change is preserved for review.'
        );
      const now = new Date();
      let result: SyncResult;
      if (request.operation === 'delete') {
        if (request.entityType === 'pin') {
          const children = await tx
            .select({ id: forms.id, version: forms.version })
            .from(forms)
            .where(eq(forms.pinId, id));
          if (children.length)
            await tx
              .insert(syncDeletions)
              .values(
                children.map((child) => ({
                  entityType: 'form',
                  entityId: child.id,
                  version: child.version + 1,
                }))
              )
              .onConflictDoNothing();
        }
        await tx.delete(table).where(eq(table.id, id));
        if (!deletion)
          await tx.insert(syncDeletions).values({
            entityType: request.entityType,
            entityId: id,
            version: (existing?.version ?? (request.payload.version as number)) + 1,
          });
        result = { id, deleted: true };
      } else {
        const version = existing ? existing.version + 1 : 1;
        if (request.entityType === 'pin') {
          const merged = {
            ...(existing ? mapPinDbToPin(existing as typeof pins.$inferSelect) : {}),
            ...request.payload,
            id,
            version,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            status: 'synced',
          } as Pin;
          const row = sanitizePinForDb(merged, version);
          const [saved] = await tx
            .insert(pins)
            .values(row)
            .onConflictDoUpdate({ target: pins.id, set: row })
            .returning();
          result = mapPinDbToPin(saved);
        } else {
          const [parent] = await tx.select({ id: pins.id }).from(pins).where(eq(pins.id, parentId));
          if (
            !parent ||
            (existing &&
              (existing as typeof forms.$inferSelect).pinId !==
                (request.payload.pinId as string).toLowerCase())
          )
            throw new ConflictError(
              'The household pin is missing or changed. Review this response before syncing.'
            );
          const merged = {
            ...(existing ? mapFormDbToForm(existing as typeof forms.$inferSelect) : {}),
            ...request.payload,
            id,
            pinId: parentId,
            version,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            status: 'synced',
          } as Form;
          const row = sanitizeFormForDb(merged, version);
          const [saved] = await tx
            .insert(forms)
            .values(row)
            .onConflictDoUpdate({ target: forms.id, set: row })
            .returning();
          result = mapFormDbToForm(saved);
        }
      }
      await tx
        .insert(syncReceipts)
        .values({ key: request.idempotencyKey, requestHash: hash, response: result });
      return { result, replayed: false };
    });
    // Notifications are hints after commit. A broadcast failure cannot undo or
    // cause a committed operation to be executed again.
    if (!outcome.replayed) {
      try {
        await syncEventPublisher.publish(request, outcome.result);
      } catch {
        logger.warn('Sync committed; notification delivery failed.');
      }
    }
    return outcome.result;
  }

  async snapshot() {
    return db.transaction(
      async (tx) => ({
        protocolVersion: 1 as const,
        pins: (await tx.select().from(pins)).map(mapPinDbToPin),
        forms: (await tx.select().from(forms)).map(mapFormDbToForm),
      }),
      { isolationLevel: 'repeatable read', accessMode: 'read only' }
    );
  }
}

export const syncService = new SyncService();
