import { z } from 'zod';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { forms, pins } from '../db/schema';

// Base types
export interface IdempotencyKey {
  key: string;
  createdAt: Date;
  expiresAt: Date;
}

export type EntityType = 'pin' | 'form';
export type OperationType = 'create' | 'update' | 'delete';

// Sync request types
export const SyncItemRequestSchema = z.object({
  idempotencyKey: z.string().min(1),
  entityType: z.enum(['pin', 'form']),
  operation: z.enum(['create', 'update', 'delete']),
  payload: z.record(z.string(), z.any()),
  timestamp: z.string().optional(),
  deviceId: z.string().optional(),
});

export type SyncItemRequest = z.infer<typeof SyncItemRequestSchema>;

// Pin types
export const PinSelectSchema = createSelectSchema(pins);
export const PinInsertSchema = createInsertSchema(pins);
export const FormSelectSchema = createSelectSchema(forms);
export const FormInsertSchema = createInsertSchema(forms);

export type PinData = typeof pins.$inferSelect;
export type PinInsert = typeof pins.$inferInsert;
export type FormData = typeof forms.$inferSelect;
export type FormInsert = typeof forms.$inferInsert;

export interface SyncEvent {
  eventId: string;
  eventType: 'sync.item.created' | 'sync.item.updated' | 'sync.item.deleted';
  entityType: EntityType;
  entityId: string;
  idempotencyKey: string;
  payload: PinData | FormData;
  timestamp: string;
  userId?: string;
  deviceId?: string;
}

export interface ImageEvent {
  eventId: string;
  eventType: 'image.uploaded' | 'image.processed' | 'image.deleted';
  imageUrl: string;
  entityType: EntityType;
  entityId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// Error types
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(401, message);
  }
}
