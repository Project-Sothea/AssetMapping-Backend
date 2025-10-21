import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from '../config';
import { logger } from '../utils/logger';
import { DomainEvent } from '../types/events';
import { WebSocket } from 'ws';
import { safeJsonParse } from '../utils/parsing';

/**
 * Notification Consumer Service
 *
 * Consumes events from Kafka and pushes real-time notifications to connected clients.
 * Supports:
 * - WebSocket connections for web/mobile clients
 * - Device filtering (don't notify the originating device)
 * - User-based routing (only notify relevant users)
 *
 * Future: Can be extended to support FCM/APNS for push notifications
 */
class NotificationConsumerService {
  private kafka: Kafka;
  private consumer: Consumer | null = null;
  private isRunning: boolean = false;
  private wsConnections: Map<string, Set<WebSocket>> = new Map(); // userId -> Set of WebSocket connections

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

    // Close all WebSocket connections
    this.wsConnections.forEach((connections) => {
      connections.forEach((ws) => {
        ws.close();
      });
    });
    this.wsConnections.clear();

    if (this.consumer) {
      await this.consumer.disconnect();
      logger.info('Notification consumer disconnected');
    }
  }

  /**
   * Register a WebSocket connection for a user
   */
  registerConnection(userId: string, ws: WebSocket): void {
    if (!this.wsConnections.has(userId)) {
      this.wsConnections.set(userId, new Set());
    }
    this.wsConnections.get(userId)!.add(ws);

    logger.info('WebSocket connection registered', { userId });

    // Handle connection close
    ws.on('close', () => {
      this.unregisterConnection(userId, ws);
    });
  }

  /**
   * Unregister a WebSocket connection
   */
  private unregisterConnection(userId: string, ws: WebSocket): void {
    const connections = this.wsConnections.get(userId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        this.wsConnections.delete(userId);
      }
      logger.info('WebSocket connection unregistered', { userId });
    }
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
    switch (event.type) {
      case 'PinCreated':
      case 'PinUpdated':
      case 'PinDeleted':
        await this.notifyPinEvent(event);
        break;

      case 'FormCreated':
      case 'FormUpdated':
      case 'FormDeleted':
        await this.notifyFormEvent(event);
        break;

      case 'ImageUploaded':
      case 'ImageDeleted':
        await this.notifyImageEvent(event);
        break;

      case 'SyncBatchReceived':
        // Don't notify on sync batches (too noisy)
        break;

      default: {
        const unknownEvent = event as { type?: string };
        logger.warn('Unknown event type for notification', {
          type: unknownEvent.type || 'unknown',
        });
        break;
      }
    }
  }

  /**
   * Notify about pin events
   */
  private async notifyPinEvent(event: DomainEvent): Promise<void> {
    const notification = {
      type: 'pin',
      action: event.type.replace('Pin', '').toLowerCase(), // Created -> created
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      version: event.version,
      timestamp: event.timestamp,
      payload: event.payload,
    };

    // Broadcast to all connected users
    // In production, you'd filter by user permissions/geography
    await this.broadcast(notification);
  }

  /**
   * Notify about form events
   */
  private async notifyFormEvent(event: DomainEvent): Promise<void> {
    const notification = {
      type: 'form',
      action: event.type.replace('Form', '').toLowerCase(),
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      version: event.version,
      timestamp: event.timestamp,
      payload: event.payload,
    };

    await this.broadcast(notification);
  }

  /**
   * Notify about image events
   */
  private async notifyImageEvent(event: DomainEvent): Promise<void> {
    const notification = {
      type: 'image',
      action: event.type.replace('Image', '').toLowerCase(),
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      timestamp: event.timestamp,
      payload: event.payload,
    };

    await this.broadcast(notification);
  }

  /**
   * Broadcast notification to all connected clients
   */
  private async broadcast(notification: unknown): Promise<void> {
    const message = JSON.stringify(notification);
    let sentCount = 0;

    this.wsConnections.forEach((connections, userId) => {
      connections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(message);
            sentCount++;
          } catch (error) {
            logger.error('Failed to send notification', { error, userId });
          }
        }
      });
    });

    if (sentCount > 0) {
      const notif = notification as { type: string; action: string };
      logger.debug('Notification broadcast', {
        type: notif.type,
        action: notif.action,
        recipients: sentCount,
      });
    }
  }

  /**
   * Send notification to specific user (future use for targeted notifications)
   */
  async notifyUser(userId: string, notification: unknown): Promise<void> {
    const connections = this.wsConnections.get(userId);
    if (!connections || connections.size === 0) {
      return;
    }

    const message = JSON.stringify(notification);
    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          logger.error('Failed to send notification to user', { error, userId });
        }
      }
    });
  }

  /**
   * Get connection stats
   */
  getStats(): { totalUsers: number; totalConnections: number } {
    let totalConnections = 0;
    this.wsConnections.forEach((connections) => {
      totalConnections += connections.size;
    });

    return {
      totalUsers: this.wsConnections.size,
      totalConnections,
    };
  }
}

export const notificationConsumerService = new NotificationConsumerService();
