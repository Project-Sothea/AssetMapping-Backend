import { getKafkaProducer, KAFKA_TOPICS } from '../../config/kafka';
import { SyncEvent } from '../../types';
import { logger } from '../../utils/logger';
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

}

export const eventService = new EventService();
