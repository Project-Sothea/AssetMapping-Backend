import { PinData, FormData, SyncItemRequest } from '../../../types';
import { DomainEvent } from '../../../types/events';
import { eventBuilder } from './event-builder';
import { versionManagerService } from '../../infrastructure/version-manager.service';

/**
 * Event Factory Service
 *
 * Responsibility: Coordinate domain event creation
 * - Determine event type from operation
 * - Fetch version information
 * - Delegate to EventBuilder for construction
 * - Extract common data from requests
 */

/**
 * Create domain event for outbox
 */
export async function createDomainEvent(
  eventType: string,
  result: PinData | FormData | { id: string; deleted: boolean },
  request: SyncItemRequest
): Promise<DomainEvent> {
  const payload = request.payload as Record<string, unknown>;
  const userId = payload.userId as string;
  const entityId = result.id || (payload.id as string);

  // Determine table name from entity type
  const tableName = request.entityType === 'pin' ? 'pins' : 'forms';

  // Get next version for the entity
  const version = await versionManagerService.getNextVersion(tableName, entityId);

  // Delegate to event builder based on type
  switch (eventType) {
    case 'PinCreated':
      return eventBuilder.buildPinCreated(entityId, version, userId, result as PinData);

    case 'PinUpdated':
      return eventBuilder.buildPinUpdated(
        entityId,
        version,
        userId,
        result as Record<string, unknown>
      );

    case 'PinDeleted':
      return eventBuilder.buildPinDeleted(entityId, version, userId);

    case 'FormCreated':
      return eventBuilder.buildFormCreated(entityId, version, userId, result as FormData);

    case 'FormUpdated':
      return eventBuilder.buildFormUpdated(
        entityId,
        version,
        userId,
        result as Record<string, unknown>
      );

    case 'FormDeleted':
      return eventBuilder.buildFormDeleted(entityId, version, userId);

    default:
      throw new Error(`Unknown event type: ${eventType}`);
  }
}
