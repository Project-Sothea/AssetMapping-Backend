import { Router, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { logger } from '../utils/logger';
import { parse as parseUrl } from 'url';
import { safeJsonParse } from '../utils/parsing';
import { webSocketManagerService } from '../services/notifications/websocket-manager.service';

const router = Router();

/**
 * Initialize WebSocket server for real-time notifications
 */
export function initializeWebSocketServer(httpServer: HTTPServer): void {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/notifications',
  });

  wss.on('connection', (ws: WebSocket, req) => {
    try {
      // Extract userId from query params
      const { query } = parseUrl(req.url || '', true);
      const userId = query.userId as string;

      if (!userId) {
        logger.warn('WebSocket connection without userId', { url: req.url });
        ws.close(1008, 'userId required');
        return;
      }

      logger.info('WebSocket connection established', { userId });

      // Register connection directly with WebSocket manager
      webSocketManagerService.registerConnection(userId, ws);

      // Send welcome message
      ws.send(
        JSON.stringify({
          type: 'system',
          action: 'connected',
          timestamp: new Date().toISOString(),
          message: 'Connected to notification service',
        })
      );

      // Handle ping/pong for keep-alive
      ws.on('ping', () => {
        ws.pong();
      });

      // Handle messages from client (optional - for future use)
      ws.on('message', (data: Buffer) => {
        try {
          const message = safeJsonParse(data.toString(), { type: 'unknown' });
          logger.debug('WebSocket message received', { userId, message });

          // Handle client messages (e.g., subscribe to specific topics)
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          }
        } catch (error) {
          logger.error('Error parsing WebSocket message', { error, userId });
        }
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket error', { error, userId });
      });

      // Handle close
      ws.on('close', (code, reason) => {
        logger.info('WebSocket connection closed', {
          userId,
          code,
          reason: reason.toString(),
        });
      });
    } catch (error) {
      logger.error('Error handling WebSocket connection', { error });
      ws.close(1011, 'Internal server error');
    }
  });

  logger.info('WebSocket server initialized', { path: '/ws/notifications' });
}

/**
 * GET /api/notifications/stats
 * Get notification service statistics
 */
router.get('/stats', (_req: Request, res: Response) => {
  const stats = webSocketManagerService.getStats();
  res.json({
    success: true,
    data: stats,
  });
});

/**
 * POST /api/notifications/test
 * Send a test notification to a specific user (development only)
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({
        success: false,
        message: 'userId and message are required',
      });
    }

    const notification = {
      type: 'test',
      action: 'test',
      timestamp: new Date().toISOString(),
      payload: { message },
    };

    await webSocketManagerService.sendToUser(userId, notification);

    return res.json({
      success: true,
      message: 'Test notification sent',
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
    });
  }
});

export default router;
