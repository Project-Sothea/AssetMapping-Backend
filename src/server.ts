import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';

import { config } from './config';
import { connectRedis } from './config/redis';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import formRoutes from './routes/form.routes';
import pinRoutes from './routes/pin.routes';
import storageRoutes from './routes/storage.routes';
import syncRoutes from './routes/sync.routes';
import { logger } from './utils/logger';
// Import routes
import { initializeWebSocketServer } from './websocket/initializer';

const app: Application = express();

// ==================== Middleware ====================

// Security
app.use(helmet());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// ==================== Routes ====================

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
  });
});

// Old mobile versions can discard drafts when handling version conflicts.
// Fail closed before any old client can push or download over its local data.
app.use('/api', (req, res, next) => {
  if (req.get('X-SoForm-Sync-Protocol') !== '2') {
    res.status(426).json({
      success: false,
      error: 'App update required. Keep your local data and update SoForm before syncing.',
    });
    return;
  }
  next();
});

// API routes
app.use('/api/sync', syncRoutes);
app.use('/api/pins', pinRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/storage', storageRoutes);

// ==================== Error Handling ====================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ==================== Server Startup ====================

const startServer = async () => {
  try {
    // Connect to Redis
    // Core sync receipts live in PostgreSQL; an optional cache outage must not
    // prevent the API from starting or bypass its durability guarantees.
    connectRedis()
      .then(() => logger.info('✓ Redis connected'))
      .catch(() => logger.warn('Redis unavailable; durable PostgreSQL sync remains enabled.'));

    // Start Express server
    const onListening = () => {
      logger.info(`✓ Server running on port ${config.port}`);
      logger.info(`✓ Environment: ${config.nodeEnv}`);
      logger.info(`✓ Health check: http://localhost:${config.port}/health`);
    };
    const server =
      config.nodeEnv === 'qa'
        ? app.listen(config.port, '127.0.0.1', onListening)
        : app.listen(config.port, onListening);

    // Initialize WebSocket server for real-time notifications
    initializeWebSocketServer(server);
    logger.info('✓ WebSocket server initialized');

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');

      server.close(async () => {
        try {
          // Stop event-driven services
          // Disconnect infrastructure
          const { disconnectRedis } = await import('./config/redis');

          await disconnectRedis();

          logger.info('✓ All connections closed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

// Start the server
if (require.main === module) {
  startServer();
}

export default app;
