import { PinData, FormData, SyncItemRequest } from '../../../types';
import { eventService } from '../../messaging/event.service';

/**
 * Sync Event Publisher
 *
 * Responsibility: Publish sync events to Kafka
 * - Transform sync requests into Kafka sync events
 * - Handle sync event metadata
 */
export class SyncEventPublisher {
  /**
   * Publish sync event to Kafka
   */
  async publish(
    request: SyncItemRequest,
    result: PinData | FormData | { id: string; deleted: boolean }
  ): Promise<void> {
    const payload = request.payload as Record<string, unknown>;
    const entityId = result.id || (payload.id as string) || '';

    await eventService.publishSyncEvent({
      eventType: this.getEventType(request.operation),
      entityType: request.entityType,
      entityId,
      idempotencyKey: request.idempotencyKey,
      payload: request.payload as PinData | FormData,
      userId: payload.userId as string,
      deviceId: request.deviceId,
    });
  }

  /**
   * Get event type from operation
   */
  private getEventType(
    operation: string
  ): 'sync.item.created' | 'sync.item.updated' | 'sync.item.deleted' {
    switch (operation) {
      case 'create':
        return 'sync.item.created';
      case 'update':
        return 'sync.item.updated';
      case 'delete':
        return 'sync.item.deleted';
      default:
        return 'sync.item.updated';
    }
  }
}

export const syncEventPublisher = new SyncEventPublisher();
