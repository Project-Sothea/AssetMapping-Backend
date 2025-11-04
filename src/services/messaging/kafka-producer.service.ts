import { Kafka, Producer, RecordMetadata } from 'kafkajs';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { DomainEvent } from '../../types/events';

class KafkaProducerService {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private isConnected: boolean = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'assetmapping-backend',
      brokers: config.kafka.brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      this.producer = this.kafka.producer({
        allowAutoTopicCreation: false,
        transactionTimeout: 30000,
      });

      await this.producer.connect();
      this.isConnected = true;
      logger.info('Kafka producer connected');
    } catch (error) {
      logger.error('Failed to connect Kafka producer', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.producer && this.isConnected) {
      await this.producer.disconnect();
      this.isConnected = false;
      logger.info('Kafka producer disconnected');
    }
  }

  /**
   * Publish a domain event to Kafka
   * Uses aggregate ID as partition key for ordering
   */
  async publishEvent(event: DomainEvent): Promise<RecordMetadata[]> {
    if (!this.producer || !this.isConnected) {
      throw new Error('Kafka producer not connected');
    }

    const topic = this.getTopicForEvent(event.type);
    const message = {
      key: event.aggregateId, // Ensures ordering per aggregate
      value: JSON.stringify(event),
      headers: {
        eventType: event.type,
        aggregateType: event.aggregateType,
        version: event.version.toString(),
        timestamp: event.timestamp,
      },
    };

    try {
      const result = await this.producer.send({
        topic,
        messages: [message],
      });

      logger.info('Event published to Kafka', {
        eventId: event.eventId,
        type: event.type,
        topic,
        partition: result[0].partition,
        offset: result[0].offset,
      });

      return result;
    } catch (error) {
      logger.error('Failed to publish event to Kafka', {
        error,
        eventId: event.eventId,
        type: event.type,
      });
      throw error;
    }
  }

  /**
   * Publish multiple events in a batch
   */
  async publishBatch(events: DomainEvent[]): Promise<RecordMetadata[]> {
    if (!this.producer || !this.isConnected) {
      throw new Error('Kafka producer not connected');
    }

    if (events.length === 0) {
      return [];
    }

    // Group events by topic
    const eventsByTopic = new Map<string, DomainEvent[]>();
    for (const event of events) {
      const topic = this.getTopicForEvent(event.type);
      if (!eventsByTopic.has(topic)) {
        eventsByTopic.set(topic, []);
      }
      eventsByTopic.get(topic)!.push(event);
    }

    // Send to each topic
    const results: RecordMetadata[] = [];
    for (const [topic, topicEvents] of eventsByTopic) {
      const messages = topicEvents.map((event) => ({
        key: event.aggregateId,
        value: JSON.stringify(event),
        headers: {
          eventType: event.type,
          aggregateType: event.aggregateType,
          version: event.version.toString(),
          timestamp: event.timestamp,
        },
      }));

      try {
        const result = await this.producer.send({ topic, messages });
        results.push(...result);
        logger.info(`Published batch to ${topic}`, {
          count: topicEvents.length,
        });
      } catch (error) {
        logger.error(`Failed to publish batch to ${topic}`, { error });
        throw error;
      }
    }

    return results;
  }

  /**
   * Map event type to Kafka topic
   */
  private getTopicForEvent(eventType: string): string {
    // Use single topic per aggregate type for simplicity
    // Can be split into separate topics per event if needed
    if (eventType.startsWith('Pin')) {
      return 'pins';
    } else if (eventType.startsWith('Form')) {
      return 'forms';
    } else if (eventType.startsWith('Image')) {
      return 'images';
    } else if (eventType.startsWith('SyncBatch')) {
      return 'sync-batches';
    }
    return 'domain-events'; // fallback
  }

  async healthCheck(): Promise<boolean> {
    return this.isConnected;
  }
}

export const kafkaProducerService = new KafkaProducerService();
