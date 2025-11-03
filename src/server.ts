import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import os from 'os';
import { config } from './config';
import { connectRedis } from './config/redis';
import { getKafkaProducer } from './config/kafka';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { logger } from './utils/logger';

// Import routes
import syncRoutes from './routes/sync.routes';
import imageRoutes from './routes/image.routes';
import pinRoutes from './routes/pin.routes';
import formRoutes from './routes/form.routes';
import notificationRoutes, { initializeWebSocketServer } from './routes/notification.routes';

const app: Application = express();

// ==================== Helper Functions ====================

/**
 * Get the local IP address of the machine
 */
function getLocalIPAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
    const addresses = interfaces[interfaceName];
    if (!addresses) continue;

    for (const address of addresses) {
      // Skip internal and non-IPv4 addresses
      if (!address.internal && address.family === 'IPv4') {
        return address.address;
      }
    }
  }
  return 'localhost'; // Fallback
}

// ==================== Middleware ====================

// Security
app.use(helmet());

// CORS
app.use(
  cors({
    origin: config.cors.origins,
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ==================== Routes ====================

// Health check
app.get('/health', (_req: Request, res: Response) => {
  const serverIp = getLocalIPAddress();
  const port = config.port;
  const apiUrl = `http://${serverIp}:${port}`;

  console.log(`🚀 Backend API URL: ${apiUrl}`);

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    apiUrl: apiUrl,
    version: '1.0.0',
  });
});

// API routes
app.use('/api/sync', syncRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/pins', pinRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/notifications', notificationRoutes);

// ==================== Error Handling ====================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ==================== Server Startup ====================

const startServer = async () => {
  try {
    // Connect to Redis
    await connectRedis();
    logger.info('✓ Redis connected');

    // Initialize Kafka producer
    await getKafkaProducer();
    logger.info('✓ Kafka producer connected');

    // Start Kafka Producer for outbox
    const { kafkaProducerService } = await import('./services/kafka-producer.service');
    await kafkaProducerService.connect();
    logger.info('✓ Kafka producer service connected');

    // Start Outbox Relayer (polls outbox and publishes to Kafka)
    const { outboxRelayerService } = await import('./services/outbox-relayer.service');
    await outboxRelayerService.start();
    logger.info('✓ Outbox relayer started');

    // Start Projection Consumer (applies events to read models)
    const { projectionConsumerService } = await import('./services/projection-consumer.service');
    await projectionConsumerService.start();
    logger.info('✓ Projection consumer started');

    // Start Notification Consumer (real-time notifications)
    const { notificationConsumerService } = await import(
      './services/notification-consumer.service'
    );
    await notificationConsumerService.start();
    logger.info('✓ Notification consumer started');

    // Start Express server
    const server = app.listen(config.port, () => {
      const localIP = getLocalIPAddress();
      logger.info(`✓ Server running on port ${config.port}`);
      logger.info(`✓ Environment: ${config.nodeEnv}`);
      logger.info(`✓ Health check: http://localhost:${config.port}/health`);
      logger.info(`🔗 Frontend clients connect to: http://${localIP}:${config.port}`);
      logger.info(`💡 Copy this URL to your mobile app: http://${localIP}:${config.port}`);
    });

    // Initialize WebSocket server for real-time notifications
    initializeWebSocketServer(server);
    logger.info('✓ WebSocket server initialized');

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');

      server.close(async () => {
        try {
          // Stop event-driven services
          const { outboxRelayerService } = await import('./services/outbox-relayer.service');
          const { projectionConsumerService } = await import(
            './services/projection-consumer.service'
          );
          const { notificationConsumerService } = await import(
            './services/notification-consumer.service'
          );
          const { kafkaProducerService } = await import('./services/kafka-producer.service');

          await outboxRelayerService.stop();
          logger.info('✓ Outbox relayer stopped');

          await projectionConsumerService.stop();
          logger.info('✓ Projection consumer stopped');

          await notificationConsumerService.stop();
          logger.info('✓ Notification consumer stopped');

          await kafkaProducerService.disconnect();
          logger.info('✓ Kafka producer service disconnected');

          // Disconnect infrastructure
          const { disconnectRedis } = await import('./config/redis');
          const { disconnectKafka } = await import('./config/kafka');

          await disconnectRedis();
          await disconnectKafka();

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
