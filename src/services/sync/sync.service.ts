import { PinData, FormData, SyncItemRequest } from '../../types';
import { idempotencyService } from '../infrastructure/idempotency.service';
import { pinOperations } from './operations/pin.operations';
import { formOperations } from './operations/form.operations';
import { eventPublisher } from './events/event-publisher';

const OPERATION_TIMEOUT_MS = 25000; // 25s (less than client's 30s timeout)

export class SyncService {
  /**
   * Process a sync item with idempotency and timeout
   */
  async syncItem(
    request: SyncItemRequest
  ): Promise<PinData | FormData | { id: string; deleted: boolean }> {
    return this.withTimeout(
      idempotencyService.processWithIdempotency(request.idempotencyKey, async () => {
        const result = await this.executeSyncOperation(request);
        await eventPublisher.publishEvents(request, result);
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
  private async executeSyncOperation(
    request: SyncItemRequest
  ): Promise<PinData | FormData | { id: string; deleted: boolean }> {
    const { entityType, operation, payload } = request;

    if (entityType === 'pin') {
      return pinOperations.syncPin(operation, payload as PinData);
    } else if (entityType === 'form') {
      return formOperations.syncForm(operation, payload as FormData);
    }

    throw new Error(`Unsupported entity type: ${entityType}`);
  }
}

export const syncService = new SyncService();
