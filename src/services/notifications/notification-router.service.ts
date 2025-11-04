import { DomainEvent } from '../../types/events';
import { logger } from '../../utils/logger';

export interface Notification {
  type: string;
  action: string;
  eventId: string;
  aggregateId: string;
  timestamp: string;
  version?: number;
  payload?: unknown;
}

/**
 * Notification Router Service
 *
 * Responsibility: Transform domain events into notifications
 * - Map event types to notification formats
 * - Extract relevant data for notifications
 * - Filter events that should not trigger notifications
 */
export class NotificationRouterService {
  /**
   * Route domain event to notification
   * Returns null if event should not generate a notification
   */
  routeEvent(event: DomainEvent): Notification | null {
    switch (event.type) {
      case 'PinCreated':
      case 'PinUpdated':
      case 'PinDeleted':
        return this.createPinNotification(event);

      case 'FormCreated':
      case 'FormUpdated':
      case 'FormDeleted':
        return this.createFormNotification(event);

      case 'ImageUploaded':
      case 'ImageDeleted':
        return this.createImageNotification(event);

      case 'SyncBatchReceived':
        // Don't notify on sync batches (too noisy)
        return null;

      default: {
        const unknownEvent = event as { type?: string };
        logger.warn('Unknown event type for notification routing', {
          type: unknownEvent.type || 'unknown',
        });
        return null;
      }
    }
  }

  /**
   * Create pin notification from event
   */
  private createPinNotification(event: DomainEvent): Notification {
    return {
      type: 'pin',
      action: this.extractAction(event.type),
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      version: event.version,
      timestamp: event.timestamp,
      payload: event.payload,
    };
  }

  /**
   * Create form notification from event
   */
  private createFormNotification(event: DomainEvent): Notification {
    return {
      type: 'form',
      action: this.extractAction(event.type),
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      version: event.version,
      timestamp: event.timestamp,
      payload: event.payload,
    };
  }

  /**
   * Create image notification from event
   */
  private createImageNotification(event: DomainEvent): Notification {
    return {
      type: 'image',
      action: this.extractAction(event.type),
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      timestamp: event.timestamp,
      payload: event.payload,
    };
  }

  /**
   * Extract action from event type
   * Examples: PinCreated -> created, FormUpdated -> updated
   */
  private extractAction(eventType: string): string {
    // Remove entity prefix (Pin, Form, Image) and convert to lowercase
    return eventType.replace(/^(Pin|Form|Image|SyncBatch)/, '').toLowerCase();
  }

  /**
   * Batch route multiple events
   */
  routeEvents(events: DomainEvent[]): Notification[] {
    const notifications: Notification[] = [];

    for (const event of events) {
      const notification = this.routeEvent(event);
      if (notification) {
        notifications.push(notification);
      }
    }

    return notifications;
  }

  /**
   * Check if an event type should trigger notifications
   */
  shouldNotify(eventType: string): boolean {
    // Add logic for filtering which events should trigger notifications
    const noNotifyTypes = ['SyncBatchReceived'];
    return !noNotifyTypes.includes(eventType);
  }
}

export const notificationRouterService = new NotificationRouterService();
