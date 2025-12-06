import { SyncItemRequest, SyncResult, Pin, Form } from '@assetmapping/shared-types';

import { idempotencyService } from './infrastructure/idempotency.service';

import { formOperations } from './sync/operations/form.operations';
import { pinOperations } from './sync/operations/pin.operations';
import { syncEventPublisher } from './sync/publishers/sync-event.publisher';

const OPERATION_TIMEOUT_MS = 25000; // 25s (less than client's 30s timeout)

export class SyncService {
  /**
   * Process a sync item with idempotency and timeout
   */
  async sync(request: SyncItemRequest): Promise<SyncResult> {
    return this.withTimeout(
      idempotencyService.processWithIdempotency(request.idempotencyKey, async () => {
        const result = await this.executeSyncOperation(request);
        await syncEventPublisher.publish(request, result);
        return result;
      }),
      OPERATION_TIMEOUT_MS
    );
  }

  /**
   * Wrap operation with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Execute the actual sync operation based on entity type and operation
   */
  private async executeSyncOperation(request: SyncItemRequest): Promise<SyncResult> {
    const { entityType, operation, payload } = request;

    const sanitizedPayload = this.sanitizePayload(payload);

    if (entityType === 'pin') {
      return pinOperations.syncEntity(operation, sanitizedPayload as Pin);
    }
    if (entityType === 'form') {
      return formOperations.syncEntity(operation, sanitizedPayload as Form);
    }

    throw new Error(`Unsupported entity type: ${entityType}`);
  }

  /**
   * Best-effort payload sanitization to ensure Dates are Date objects
   */
  private sanitizePayload(payload: unknown): Pin | Form {
    if (payload && typeof payload === 'object') {
      const maybeDate = (value: unknown): unknown => {
        if (value instanceof Date) return value;
        if (typeof value === 'string') {
          const d = new Date(value);
          return isNaN(d.getTime()) ? value : d;
        }
        return value;
      };

      const normalized = { ...(payload as Record<string, unknown>) };
      normalized.createdAt = maybeDate(normalized.createdAt);
      normalized.updatedAt = maybeDate(normalized.updatedAt);
      return normalized as Pin | Form;
    }

    return payload as Pin | Form;
  }
}

export const syncService = new SyncService();
