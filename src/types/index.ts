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
