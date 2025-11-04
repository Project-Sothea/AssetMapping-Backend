import { PinData, FormData, SyncItemRequest } from '../../../types';
import { eventService } from '../../messaging/event.service';

/**
 * Audit Log Publisher
 *
 * Responsibility: Publish audit logs for compliance
 * - Track all data mutations
 * - Include user and timing information
 * - Send to audit log topic
 */
export class AuditLogPublisher {
  /**
   * Publish audit log
   */
  async publish(
    request: SyncItemRequest,
    result: PinData | FormData | { id: string; deleted: boolean }
  ): Promise<void> {
    const payload = request.payload as Record<string, unknown>;
    const entityId = result.id || (payload.id as string) || '';

    await eventService.publishAuditLog({
      action: `${request.entityType}.${request.operation}`,
      entityType: request.entityType,
      entityId,
      userId: payload.userId as string,
      metadata: {
        idempotencyKey: request.idempotencyKey,
        timestamp: request.timestamp,
      },
    });
  }
}

export const auditLogPublisher = new AuditLogPublisher();
