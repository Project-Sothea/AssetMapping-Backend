import { PinData, FormData, SyncItemRequest } from '../../../types';
import { syncEventPublisher } from '../publishers/sync-event.publisher';
import { domainEventPublisher } from '../publishers/domain-event.publisher';
import { auditLogPublisher } from '../publishers/audit-log.publisher';

/**
 * Event Publisher (Facade)
 *
 * Responsibility: Coordinate event publishing across multiple channels
 * - Delegate to specialized publishers
 * - Execute publishers in parallel for performance
 * - Provide single entry point for event publishing
 */
export class EventPublisher {
  /**
   * Publish all events for a sync operation
   * Delegates to specialized publishers for each channel
   */
  async publishEvents(
    request: SyncItemRequest,
    result: PinData | FormData | { id: string; deleted: boolean }
  ): Promise<void> {
    await Promise.all([
      syncEventPublisher.publish(request, result),
      domainEventPublisher.publish(request, result),
      auditLogPublisher.publish(request, result),
    ]);
  }
}

export const eventPublisher = new EventPublisher();
