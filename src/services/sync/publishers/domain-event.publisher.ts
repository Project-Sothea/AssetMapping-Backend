import { PinData, FormData, SyncItemRequest } from '../../../types';
import { logger } from '../../../utils/logger';
import { outboxRepository } from '../../../repositories/outbox.repository';
import { createDomainEvent } from '../events/event-factory';

/**
 * Domain Event Publisher
 *
 * Responsibility: Publish domain events to outbox
 * - Create domain events for state changes
 * - Insert events into outbox for eventual publishing
 * - Handle event type mapping
 */
export class DomainEventPublisher {
  /**
   * Publish domain event to outbox
   */
  async publish(
    request: SyncItemRequest,
    result: PinData | FormData | { id: string; deleted: boolean }
  ): Promise<void> {
    try {
      const eventType = this.getDomainEventType(request.operation, request.entityType);
      const domainEvent = await createDomainEvent(eventType, result, request);
      await outboxRepository.insertEvent(domainEvent);

      logger.info('Inserted domain event to outbox', {
        eventId: domainEvent.eventId,
        type: domainEvent.type,
      });
    } catch (error) {
      logger.error('Failed to create or insert domain event', { error });
      // Don't throw - domain event publishing shouldn't fail the operation
    }
  }

  /**
   * Get domain event type from operation and entity type
   */
  private getDomainEventType(operation: string, entityType: 'pin' | 'form'): string {
    const prefix = entityType === 'pin' ? 'Pin' : 'Form';
    switch (operation) {
      case 'create':
        return `${prefix}Created`;
      case 'update':
        return `${prefix}Updated`;
      case 'delete':
        return `${prefix}Deleted`;
      default:
        return `${prefix}Updated`;
    }
  }
}

export const domainEventPublisher = new DomainEventPublisher();
