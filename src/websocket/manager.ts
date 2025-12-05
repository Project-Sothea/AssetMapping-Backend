import { WebSocket } from 'ws';
import { logger } from '../utils/logger';

export class WebSocketManagerService {
  private wsConnections: Map<string, Set<WebSocket>> = new Map();

  registerConnection(userId: string, ws: WebSocket): void {
    if (!this.wsConnections.has(userId)) {
      this.wsConnections.set(userId, new Set());
    }
    this.wsConnections.get(userId)!.add(ws);
    logger.info('WebSocket connection registered', { userId });

    ws.on('close', () => {
      this.unregisterConnection(userId, ws);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', { userId, error });
      this.unregisterConnection(userId, ws);
    });
  }

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
}

export const webSocketManagerService = new WebSocketManagerService();
