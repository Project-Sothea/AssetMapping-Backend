import { z } from 'zod';
import { createSelectSchema } from 'drizzle-zod';
import { forms, pins } from '../db/schema';
import type { Pin, Form } from '../db/schema';

export type EntityType = 'pin' | 'form';
export type OperationType = 'create' | 'update' | 'delete';

// API response envelope used by controllers
export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  message?: string;
};

export type ApiErrorResponse = {
  success: false;
  error: string;
  message?: string;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

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

// DB row shapes (storage)
export const PinSelectSchema = createSelectSchema(pins);
export const FormSelectSchema = createSelectSchema(forms);

export interface SyncEvent {
  eventId: string;
  eventType: 'sync.item.created' | 'sync.item.updated' | 'sync.item.deleted';
  entityType: EntityType;
  entityId: string;
  idempotencyKey: string;
  payload: Pin | Form;
  timestamp: string;
  userId?: string;
  deviceId?: string;
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
export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}
