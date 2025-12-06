import type {
  Pin,
  Form,
  PinDB,
  FormDB,
  SyncEvent,
  SyncItemRequest,
  SyncNotification,
} from '@assetmapping/shared-types';
import { PinService } from '../../pin.service';
import { FormService } from '../../form.service';
import { webSocketManagerService } from '../../../websocket/manager';
import { logger } from '../../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Sync Event Publisher
 *
 * Responsibility: Publish sync events to WebSocket clients
 * - Transform sync requests into WebSocket sync events
 * - Handle sync event metadata
 */
export class SyncEventPublisher {
  async publish(
    request: SyncItemRequest,
    result: Pin | Form | { id: string; deleted: boolean }
  ): Promise<void> {
    const payload = request.payload as Record<string, unknown>;
    const entityId =
      'deleted' in result ? result.id : (result as Pin | Form).id || (payload.id as string) || '';

    const parsedRequestPayload =
      request.entityType === 'pin'
        ? PinService.parsePin(request.payload as PinDB)
        : FormService.parseFormArrays(request.payload as FormDB);
    const eventPayload =
      'deleted' in result ? parsedRequestPayload : (result as Pin | Form);
    // Build sync event and broadcast directly via WebSockets
    const event: SyncEvent = {
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType: this.getEventType(request.operation),
      entityType: request.entityType,
      entityId,
      idempotencyKey: request.idempotencyKey,
      payload: eventPayload,
      userId: (payload.userId as string) || 'system',
      deviceId: request.deviceId,
    };

    // Transform to notification payload (same shape used by consumer previously)
    const notification: SyncNotification = {
      type: event.entityType,
      action: this.getAction(event.eventType),
      eventId: event.eventId,
      aggregateId: event.entityId,
      timestamp: event.timestamp,
      payload: {
        entityType: event.entityType,
        entityId: event.entityId,
        ...event.payload,
      },
    };

    try {
      await webSocketManagerService.broadcast(notification);
      logger.info('Broadcasted sync notification', {
        type: notification.type,
        action: notification.action,
        entityId: notification.aggregateId,
      });
    } catch (error) {
      logger.error('Failed to broadcast notification', { error });
    }
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

  private getAction(eventType: SyncEvent['eventType']): SyncNotification['action'] {
    switch (eventType) {
      case 'sync.item.created':
        return 'created';
      case 'sync.item.deleted':
        return 'deleted';
      case 'sync.item.updated':
      default:
        return 'updated';
    }
  }
}

export const syncEventPublisher = new SyncEventPublisher();
