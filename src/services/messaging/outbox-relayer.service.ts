import { outboxRepository } from '../../repositories/outbox.repository';
import { kafkaProducerService } from './kafka-producer.service';
import { logger } from '../../utils/logger';
import { DomainEvent } from '../../types/events';

class OutboxRelayerService {
  private isRunning: boolean = false;
  private pollInterval: number = 1000; // 1 second
  private intervalId: NodeJS.Timeout | null = null;
  private batchSize: number = 100;
  private maxRetries: number = 5;

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Outbox relayer already running');
      return;
    }

    logger.info('Starting outbox relayer');
    this.isRunning = true;

    // Ensure Kafka producer is connected
    await kafkaProducerService.connect();

    // Start polling loop
    this.intervalId = setInterval(() => {
      this.pollAndPublish().catch((error) => {
        logger.error('Error in outbox relayer poll', { error });
      });
    }, this.pollInterval);

    logger.info('Outbox relayer started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping outbox relayer');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info('Outbox relayer stopped');
  }

  private async pollAndPublish(): Promise<void> {
    try {
      // Fetch unpublished events
      const outboxEvents = await outboxRepository.getUnpublishedEvents(this.batchSize);

      if (outboxEvents.length === 0) {
        return;
      }

      logger.debug(`Processing ${outboxEvents.length} outbox events`);

      // Process each event
      for (const outboxEvent of outboxEvents) {
        // Skip events that have been retried too many times
        if (outboxEvent.retry_count >= this.maxRetries) {
          logger.error('Event exceeded max retries, skipping', {
            eventId: outboxEvent.id,
            retryCount: outboxEvent.retry_count,
            error: outboxEvent.error,
          });
          continue;
        }

        try {
          const domainEvent: DomainEvent = outboxEvent.payload;

          // Publish to Kafka
          await kafkaProducerService.publishEvent(domainEvent);

          // Mark as published
          await outboxRepository.markAsPublished(outboxEvent.id);

          logger.debug('Event published and marked', {
            eventId: outboxEvent.id,
            type: domainEvent.type,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error('Failed to publish outbox event', {
            error,
            eventId: outboxEvent.id,
          });

          // Record failure and increment retry count
          await outboxRepository.recordFailure(outboxEvent.id, errorMessage);
        }
      }
    } catch (error) {
      logger.error('Error in pollAndPublish', { error });
    }
  }

  /**
   * Manual trigger for processing outbox (useful for testing)
   */
  async processNow(): Promise<void> {
    await this.pollAndPublish();
  }

  /**
   * Clean up old published events
   */
  async cleanupOldEvents(daysToKeep: number = 30): Promise<number> {
    return await outboxRepository.cleanupOldEvents(daysToKeep);
  }

  /**
   * Check if relayer is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

export const outboxRelayerService = new OutboxRelayerService();
