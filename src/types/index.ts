import { forms, pins } from '@assetmapping/shared-types/schema';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
export type {
  ApiErrorResponse,
  ApiResponse,
  ApiSuccessResponse,
  EntityType,
  Form,
  OperationType,
  Pin,
  SyncEvent,
  SyncNotification,
  SyncItemRequest,
} from '@assetmapping/shared-types';

// Sync request types
export const SyncItemRequestSchema = z.object({
  idempotencyKey: z.string().min(1),
  entityType: z.enum(['pin', 'form']),
  operation: z.enum(['create', 'update', 'delete']),
  payload: z.record(z.string(), z.any()),
  timestamp: z.string().optional(),
  deviceId: z.string().optional(),
});

// DB row shapes (storage)
export const PinSelectSchema = createSelectSchema(pins);
export const FormSelectSchema = createSelectSchema(forms);

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
