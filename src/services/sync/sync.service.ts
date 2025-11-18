import { z } from 'zod';
import { PinData, FormData, SyncItemRequest, PinSelectSchema, FormSelectSchema } from '../../types';
import { idempotencyService } from '../infrastructure/idempotency.service';
import { pinOperations } from './operations/pin.operations';
import { formOperations } from './operations/form.operations';
import { eventPublisher } from './events/event-publisher';
import { normalizePayload } from './normalisation.helpers';

const OPERATION_TIMEOUT_MS = 25000; // 25s (less than client's 30s timeout)

export class SyncService {
  /**
   * Process a sync item with idempotency and timeout
   */
  async syncItem(
    request: SyncItemRequest,
    files?: Express.Multer.File[]
  ): Promise<PinData | FormData | { id: string; deleted: boolean }> {
    return this.withTimeout(
      idempotencyService.processWithIdempotency(request.idempotencyKey, async () => {
        const result = await this.executeSyncOperation(request, files);
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
    request: SyncItemRequest,
    files?: Express.Multer.File[]
  ): Promise<PinData | FormData | { id: string; deleted: boolean }> {
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

    // Handle image uploads for pins
    if (entityType === 'pin' && operation !== 'delete') {
      // Store relative paths instead of full URLs (portable across domains/IPs)
      const newImagePaths = files?.map((file) => {
        // Extract relative path: "pin/123/abc.jpg"
        const relativePath = file.path.replace(process.cwd() + '/uploads/', '');
        return relativePath;
      }) || [];

      // Client sends explicit list of existing paths to keep in payload.images
      const existingImagesToKeep = (normalizedPayload as PinData).images 
        ? JSON.parse((normalizedPayload as PinData).images || '[]') 
        : [];

      // Merge existing paths (that client wants to keep) + new uploads
      const finalImages = [...existingImagesToKeep, ...newImagePaths];
      (normalizedPayload as PinData).images = JSON.stringify(finalImages);
    }

    if (entityType === 'pin') {
      return pinOperations.syncEntity(operation, normalizedPayload as PinData);
    } else if (entityType === 'form') {
      return formOperations.syncEntity(operation, normalizedPayload as FormData);
    }

    throw new Error(`Unsupported entity type: ${entityType}`);
  }
}

export const syncService = new SyncService();
