import { z } from 'zod';
import { PinDB, FormDB, Pin, Form } from '../../db/schema';
import { SyncItemRequest, PinSelectSchema, FormSelectSchema } from '../../types';
import { PinService } from '../pin.service';
import { FormService } from '../form.service';
import { idempotencyService } from '../infrastructure/idempotency.service';
import { pinOperations } from './operations/pin.operations';
import { formOperations } from './operations/form.operations';
import { syncEventPublisher } from './publishers/sync-event.publisher';
import { normalizePayload } from './normalisation.helpers';

const OPERATION_TIMEOUT_MS = 25000; // 25s (less than client's 30s timeout)

export class SyncService {
  /**
   * Process a sync item with idempotency and timeout
   */
  async sync(
    request: SyncItemRequest,
  ): Promise<Pin | Form | { id: string; deleted: boolean }> {
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
  private async executeSyncOperation(
    request: SyncItemRequest,
  ): Promise<Pin | Form | { id: string; deleted: boolean }> {
    const { entityType, operation, payload } = request;

    // Determine the schema and normalize based on it
    let schema: z.ZodSchema;
    if (entityType === 'pin') {
      schema = PinSelectSchema;
    } else if (entityType === 'form') {
      schema = FormSelectSchema;
    } else {
      throw new Error(`Unsupported entity type: ${entityType}`);
    }

    const normalizedPayload = normalizePayload(payload, schema);

    if (entityType === 'pin') {
      const pinPayload = PinService.parsePin(normalizedPayload as PinDB);
      return pinOperations.syncEntity(operation, pinPayload);
    } else if (entityType === 'form') {
      const formPayload = FormService.parseFormArrays(normalizedPayload as FormDB);
      return formOperations.syncEntity(operation, formPayload);
    }

    throw new Error(`Unsupported entity type: ${entityType}`);
  }
}

export const syncService = new SyncService();
