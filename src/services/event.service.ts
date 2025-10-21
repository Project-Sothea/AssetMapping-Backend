import { getKafkaProducer, KAFKA_TOPICS } from '../config/kafka';
import { SyncEvent, ImageEvent } from '../types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class EventService {
  /**
   * Publish a sync event to Kafka
   */
  async publishSyncEvent(event: Omit<SyncEvent, 'eventId' | 'timestamp'>): Promise<void> {
    try {
      const producer = await getKafkaProducer();

      const fullEvent: SyncEvent = {
        ...event,
        eventId: uuidv4(),
        timestamp: new Date().toISOString(),
      };

      await producer.send({
        topic: KAFKA_TOPICS.SYNC_EVENTS,
        messages: [
          {
            key: fullEvent.entityId,
            value: JSON.stringify(fullEvent),
            headers: {
              'event-type': fullEvent.eventType,
              'entity-type': fullEvent.entityType,
            },
          },
        ],
      });

      logger.info('Published sync event', {
        eventId: fullEvent.eventId,
        eventType: fullEvent.eventType,
        entityId: fullEvent.entityId,
      });
    } catch (error) {
      logger.error('Error publishing sync event', { event, error });
      // Don't throw - event publishing should not block the main operation
    }
  }

  /**
   * Publish an image event to Kafka
   */
  async publishImageEvent(event: Omit<ImageEvent, 'eventId' | 'timestamp'>): Promise<void> {
    try {
      const producer = await getKafkaProducer();

      const fullEvent: ImageEvent = {
        ...event,
        eventId: uuidv4(),
        timestamp: new Date().toISOString(),
      };

      await producer.send({
        topic: KAFKA_TOPICS.IMAGE_EVENTS,
        messages: [
          {
            key: fullEvent.entityId,
            value: JSON.stringify(fullEvent),
            headers: {
              'event-type': fullEvent.eventType,
              'entity-type': fullEvent.entityType,
            },
          },
        ],
      });

      logger.info('Published image event', {
        eventId: fullEvent.eventId,
        eventType: fullEvent.eventType,
      });
    } catch (error) {
      logger.error('Error publishing image event', { event, error });
    }
  }

  /**
   * Publish an audit log event
   */
  async publishAuditLog(data: {
    action: string;
    entityType: string;
    entityId: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const producer = await getKafkaProducer();

      const auditLog = {
        eventId: uuidv4(),
        timestamp: new Date().toISOString(),
        ...data,
      };

      await producer.send({
        topic: KAFKA_TOPICS.AUDIT_LOGS,
        messages: [
          {
            key: auditLog.entityId,
            value: JSON.stringify(auditLog),
          },
        ],
      });

      logger.debug('Published audit log', { eventId: auditLog.eventId });
    } catch (error) {
      logger.error('Error publishing audit log', { data, error });
    }
  }
}

export const eventService = new EventService();
