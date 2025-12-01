import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';
import { config } from './index';
import { logger } from '../utils/logger';

const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  logLevel: logLevel.INFO,
  retry: {
    initialRetryTime: 300,
    retries: 8,
  },
});

let producer: Producer | null = null;
let consumer: Consumer | null = null;

export const getKafkaProducer = async (): Promise<Producer> => {
  if (!producer) {
    producer = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });

    await producer.connect();
    logger.info('Kafka Producer connected');
  }

  return producer;
};

export const getKafkaConsumer = async (): Promise<Consumer> => {
  if (!consumer) {
    consumer = kafka.consumer({
      groupId: config.kafka.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await consumer.connect();
    logger.info('Kafka Consumer connected');
  }

  return consumer;
};

export const disconnectKafka = async () => {
  try {
    if (producer) {
      await producer.disconnect();
      logger.info('Kafka Producer disconnected');
    }
    if (consumer) {
      await consumer.disconnect();
      logger.info('Kafka Consumer disconnected');
    }
  } catch (error) {
    logger.error('Error disconnecting from Kafka', error);
  }
};

// Kafka Topics
export const KAFKA_TOPICS = {
  SYNC_EVENTS: 'sync.events',
} as const;

export { kafka };
export default kafka;
