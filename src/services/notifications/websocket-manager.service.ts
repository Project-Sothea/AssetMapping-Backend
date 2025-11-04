import { WebSocket } from 'ws';
import { logger } from '../../utils/logger';

/**
 * WebSocket Manager Service
 *
 * Responsibility: Manage WebSocket connections
 * - Register/unregister user connections
 * - Broadcast messages to all connected clients
 * - Send messages to specific users
 * - Track connection statistics
 */
export class WebSocketManagerService {
  private wsConnections: Map<string, Set<WebSocket>> = new Map();

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

    ws.on('error', (error) => {
      logger.error('WebSocket error', { userId, error });
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
   * Broadcast a message to all connected clients
   */
  async broadcast(message: unknown): Promise<number> {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    this.wsConnections.forEach((connections, userId) => {
      connections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(messageStr);
            sentCount++;
          } catch (error) {
            logger.error('Failed to send broadcast message', { error, userId });
          }
        }
      });
    });

    if (sentCount > 0) {
      logger.debug('Message broadcast', { recipients: sentCount });
    }

    return sentCount;
  }

  /**
   * Send a message to a specific user (all their connections)
   */
  async sendToUser(userId: string, message: unknown): Promise<boolean> {
    const connections = this.wsConnections.get(userId);
    if (!connections || connections.size === 0) {
      return false;
    }

    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
          sentCount++;
        } catch (error) {
          logger.error('Failed to send message to user', { error, userId });
        }
      }
    });

    return sentCount > 0;
  }

  /**
   * Send a message to multiple users
   */
  async sendToUsers(userIds: string[], message: unknown): Promise<number> {
    let totalSent = 0;

    for (const userId of userIds) {
      const sent = await this.sendToUser(userId, message);
      if (sent) {
        totalSent++;
      }
    }

    return totalSent;
  }

  /**
   * Close all connections for a user
   */
  disconnectUser(userId: string): void {
    const connections = this.wsConnections.get(userId);
    if (connections) {
      connections.forEach((ws) => {
        try {
          ws.close();
        } catch (error) {
          logger.error('Error closing connection', { userId, error });
        }
      });
      this.wsConnections.delete(userId);
      logger.info('User disconnected', { userId });
    }
  }

  /**
   * Close all WebSocket connections
   */
  disconnectAll(): void {
    this.wsConnections.forEach((connections, userId) => {
      connections.forEach((ws) => {
        try {
          ws.close();
        } catch (error) {
          logger.error('Error closing connection', { userId, error });
        }
      });
    });
    this.wsConnections.clear();
    logger.info('All WebSocket connections closed');
  }

  /**
   * Check if a user has active connections
   */
  isUserConnected(userId: string): boolean {
    const connections = this.wsConnections.get(userId);
    return connections !== undefined && connections.size > 0;
  }

  /**
   * Get connection statistics
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

  /**
   * Get list of connected user IDs
   */
  getConnectedUserIds(): string[] {
    return Array.from(this.wsConnections.keys());
  }
}

export const webSocketManagerService = new WebSocketManagerService();
