import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { DomainEvent } from '../../types/events';
import { safeJsonParse } from '../../utils/parsing';
import { pinProjectionHandler } from '../projections/pin-projection.handler';
import { formProjectionHandler } from '../projections/form-projection.handler';
import { imageProjectionHandler } from '../projections/image-projection.handler';

/**
 * Projection Consumer Service
 *
 * Responsibility: Consume domain events and update read models
 * - Connect to Kafka and subscribe to event topics
 * - Process incoming events
 * - Delegate to entity-specific projection handlers
 * - Handle errors and retries
 */
class ProjectionConsumerService {
  private kafka: Kafka;
  private consumer: Consumer | null = null;
  private isRunning: boolean = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'assetmapping-projection',
      brokers: config.kafka.brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Projection consumer already running');
      return;
    }

    try {
      this.consumer = this.kafka.consumer({
        groupId: 'projection-service',
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      });

      await this.consumer.connect();
      logger.info('Projection consumer connected');

      // Subscribe to all relevant topics
      await this.consumer.subscribe({
        topics: ['pins', 'forms', 'images'],
        fromBeginning: false, // Start from latest (change to true for replay)
      });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      this.isRunning = true;
      logger.info('Projection consumer started');
    } catch (error) {
      logger.error('Failed to start projection consumer', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping projection consumer');
    this.isRunning = false;

    if (this.consumer) {
      await this.consumer.disconnect();
      logger.info('Projection consumer disconnected');
    }
  }

  /**
   * Route event to appropriate projection handler
   */
  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;

    try {
      if (!message.value) {
        logger.warn('Received empty message', { topic, partition });
        return;
      }

      const event: DomainEvent = safeJsonParse(message.value.toString(), {} as DomainEvent);

      logger.debug('Processing event', {
        topic,
        partition,
        offset: message.offset,
        eventType: event.type,
        aggregateId: event.aggregateId,
      });

      // Delegate to appropriate handler based on event type
      await this.routeToHandler(event);

      logger.info('Event processed successfully', {
        eventType: event.type,
        aggregateId: event.aggregateId,
        version: event.version,
      });
    } catch (error) {
      logger.error('Failed to process message', {
        error,
        topic,
        partition,
        offset: message.offset,
      });
      // Don't throw - let consumer continue with next message
      // In production, send to DLQ
    }
  }

  /**
   * Route event to appropriate projection handler
   */
  private async routeToHandler(event: DomainEvent): Promise<void> {
    switch (event.type) {
      case 'PinCreated':
        await pinProjectionHandler.handleCreated(event);
        break;
      case 'PinUpdated':
        await pinProjectionHandler.handleUpdated(event);
        break;
      case 'PinDeleted':
        await pinProjectionHandler.handleDeleted(event);
        break;

      case 'FormCreated':
        await formProjectionHandler.handleCreated(event);
        break;
      case 'FormUpdated':
        await formProjectionHandler.handleUpdated(event);
        break;
      case 'FormDeleted':
        await formProjectionHandler.handleDeleted(event);
        break;

      case 'ImageUploaded':
        await imageProjectionHandler.handleUploaded(event);
        break;

      default:
        logger.warn('Unknown event type for projection', { eventType: event.type });
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export const projectionConsumerService = new ProjectionConsumerService();
