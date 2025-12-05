import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { logger } from '../utils/logger';
import { parse as parseUrl } from 'url';
import { safeJsonParse } from '../utils/parsing';
import { webSocketManagerService } from './manager';

export function initializeWebSocketServer(httpServer: HTTPServer): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/notifications' });

  wss.on('connection', (ws: WebSocket, req) => {
    try {
      const { query } = parseUrl(req.url || '', true);
      const userId = (query.userId as string) || '';

      if (!userId) {
        logger.warn('WebSocket connection without userId', { url: req.url });
        ws.close(1008, 'userId required');
        return;
      }

      logger.info('WebSocket connection established', { userId });
      webSocketManagerService.registerConnection(userId, ws);

      ws.send(
        JSON.stringify({ type: 'system', action: 'connected', timestamp: new Date().toISOString(), message: 'Connected to notification service' })
      );

      ws.on('ping', () => ws.pong());
      ws.on('message', (data: Buffer) => {
        try {
          const message = safeJsonParse(data.toString(), { type: 'unknown' });
          logger.debug('WebSocket message received', { userId, message });
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          }
        } catch (error) {
          logger.error('Error parsing WebSocket message', { error, userId });
        }
      });
      ws.on('error', (error) => logger.error('WebSocket error', { error, userId }));
      ws.on('close', (code, reason) => {
        logger.info('WebSocket connection closed', { userId, code, reason: reason.toString() });
      });
    } catch (error) {
      logger.error('Error handling WebSocket connection', { error });
      ws.close(1011, 'Internal server error');
    }
  });

  logger.info('WebSocket server initialized', { path: '/ws/notifications' });
}
