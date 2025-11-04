import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { DomainEvent } from '../../types/events';
import { WebSocket } from 'ws';
import { safeJsonParse } from '../../utils/parsing';
import { webSocketManagerService } from '../notifications/websocket-manager.service';
import { notificationRouterService } from '../notifications/notification-router.service';

/**
 * Notification Consumer Service
 *
 * Responsibility: Consume events from Kafka and trigger notifications
 * - Connect to Kafka and subscribe to event topics
 * - Process incoming events
 * - Coordinate with WebSocketManager for delivery
 * - Coordinate with NotificationRouter for event transformation
 */
class NotificationConsumerService {
  private kafka: Kafka;
  private consumer: Consumer | null = null;
  private isRunning: boolean = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'assetmapping-notifications',
      brokers: config.kafka.brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });
  }

  /**
   * Start the notification consumer
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Notification consumer already running');
      return;
    }

    try {
      this.consumer = this.kafka.consumer({
        groupId: 'notification-service',
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      });

      await this.consumer.connect();
      logger.info('Notification consumer connected');

      // Subscribe to all event topics
      await this.consumer.subscribe({
        topics: ['pins', 'forms', 'images', 'sync-batches'],
        fromBeginning: false, // Only process new events
      });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      this.isRunning = true;
      logger.info('Notification consumer started');
    } catch (error) {
      logger.error('Failed to start notification consumer', { error });
      throw error;
    }
  }

  /**
   * Stop the notification consumer
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping notification consumer');
    this.isRunning = false;

    // Close all WebSocket connections via manager
    webSocketManagerService.disconnectAll();

    if (this.consumer) {
      await this.consumer.disconnect();
      logger.info('Notification consumer disconnected');
    }
  }

  /**
   * Register a WebSocket connection for a user
   */
  registerConnection(userId: string, ws: WebSocket): void {
    webSocketManagerService.registerConnection(userId, ws);
  }

  /**
   * Handle incoming Kafka message
   */
  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;

    try {
      if (!message.value) {
        logger.warn('Received message with no value', { topic, partition });
        return;
      }

      const event: DomainEvent = safeJsonParse(message.value.toString(), {} as DomainEvent);

      logger.debug('Processing notification event', {
        topic,
        eventType: event.type,
        aggregateId: event.aggregateId,
      });

      // Route event to appropriate handler
      await this.routeEvent(event);
    } catch (error) {
      logger.error('Error processing notification message', {
        error,
        topic,
        partition,
        offset: message.offset,
      });
      // Don't throw - we don't want to stop the consumer on individual message errors
    }
  }

  /**
   * Route event to appropriate notification handler
   */
  private async routeEvent(event: DomainEvent): Promise<void> {
    // Use router to transform event into notification
    const notification = notificationRouterService.routeEvent(event);

    if (!notification) {
      // Event should not trigger notification (e.g., SyncBatchReceived)
      return;
    }

    // Broadcast notification via WebSocket manager
    await webSocketManagerService.broadcast(notification);
  }

  /**
   * Send notification to specific user (delegated to WebSocketManager)
   */
  async notifyUser(userId: string, notification: unknown): Promise<void> {
    await webSocketManagerService.sendToUser(userId, notification);
  }

  /**
   * Get connection stats (delegated to WebSocketManager)
   */
  getStats(): { totalUsers: number; totalConnections: number } {
    return webSocketManagerService.getStats();
  }
}

export const notificationConsumerService = new NotificationConsumerService();
