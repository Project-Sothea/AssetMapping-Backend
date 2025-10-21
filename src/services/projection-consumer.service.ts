import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  DomainEvent,
  PinCreatedEvent,
  PinUpdatedEvent,
  PinDeletedEvent,
  FormCreatedEvent,
  FormUpdatedEvent,
  FormDeletedEvent,
  ImageUploadedEvent,
} from '../types/events';
import supabase from '../config/supabase';
import { safeJsonParse } from '../utils/parsing';

class ProjectionConsumerService {
  private kafka: Kafka;
  private consumer: Consumer | null = null;
  private isRunning: boolean = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'assetmapping-projection',
      brokers: config.kafka.brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Projection consumer already running');
      return;
    }

    try {
      this.consumer = this.kafka.consumer({
        groupId: 'projection-service',
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      });

      await this.consumer.connect();
      logger.info('Projection consumer connected');

      // Subscribe to all relevant topics
      await this.consumer.subscribe({
        topics: ['pins', 'forms', 'images'],
        fromBeginning: false, // Start from latest (change to true for replay)
      });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      this.isRunning = true;
      logger.info('Projection consumer started');
    } catch (error) {
      logger.error('Failed to start projection consumer', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping projection consumer');
    this.isRunning = false;

    if (this.consumer) {
      await this.consumer.disconnect();
      logger.info('Projection consumer disconnected');
    }
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;

    try {
      if (!message.value) {
        logger.warn('Received empty message', { topic, partition });
        return;
      }

      const event: DomainEvent = safeJsonParse(message.value.toString(), {} as DomainEvent);

      logger.debug('Processing event', {
        topic,
        partition,
        offset: message.offset,
        eventType: event.type,
        aggregateId: event.aggregateId,
      });

      // Route to appropriate handler based on event type
      switch (event.type) {
        case 'PinCreated':
          await this.handlePinCreated(event as PinCreatedEvent);
          break;
        case 'PinUpdated':
          await this.handlePinUpdated(event as PinUpdatedEvent);
          break;
        case 'PinDeleted':
          await this.handlePinDeleted(event as PinDeletedEvent);
          break;
        case 'FormCreated':
          await this.handleFormCreated(event as FormCreatedEvent);
          break;
        case 'FormUpdated':
          await this.handleFormUpdated(event as FormUpdatedEvent);
          break;
        case 'FormDeleted':
          await this.handleFormDeleted(event as FormDeletedEvent);
          break;
        case 'ImageUploaded':
          await this.handleImageUploaded(event as ImageUploadedEvent);
          break;
        default:
          logger.warn('Unknown event type', { eventType: event.type });
      }

      logger.info('Event processed successfully', {
        eventType: event.type,
        aggregateId: event.aggregateId,
        version: event.version,
      });
    } catch (error) {
      logger.error('Failed to process message', {
        error,
        topic,
        partition,
        offset: message.offset,
      });
      // Don't throw - let consumer continue with next message
      // In production, send to DLQ
    }
  }

  private async handlePinCreated(event: PinCreatedEvent): Promise<void> {
    const { payload } = event;

    // Check if already exists (idempotency)
    const { data: existing } = await supabase
      .from('pins')
      .select('id')
      .eq('id', payload.id)
      .single();

    if (existing) {
      logger.debug('Pin already exists, skipping', { pinId: payload.id });
      return;
    }

    const { error } = await supabase.from('pins').insert({
      id: payload.id,
      title: payload.title,
      description: payload.description,
      latitude: payload.latitude,
      longitude: payload.longitude,
      version: event.version,
      createdAt: payload.createdAt,
      updatedAt: payload.createdAt,
      userId: payload.createdBy,
    });

    if (error) {
      logger.error('Failed to insert pin', { error, pinId: payload.id });
      throw error;
    }

    logger.info('Pin created in read model', { pinId: payload.id });
  }

  private async handlePinUpdated(event: PinUpdatedEvent): Promise<void> {
    const { payload, version } = event;

    // Update with optimistic locking
    const { error } = await supabase
      .from('pins')
      .update({
        ...payload.changes,
        version,
        updatedAt: payload.updatedAt,
      })
      .eq('id', payload.id)
      .lt('version', version); // Only update if our version is newer

    if (error) {
      logger.error('Failed to update pin', { error, pinId: payload.id });
      throw error;
    }

    logger.info('Pin updated in read model', { pinId: payload.id, version });
  }

  private async handlePinDeleted(event: PinDeletedEvent): Promise<void> {
    const { payload } = event;

    const { error } = await supabase.from('pins').delete().eq('id', payload.id);

    if (error) {
      logger.error('Failed to delete pin', { error, pinId: payload.id });
      throw error;
    }

    logger.info('Pin deleted from read model', { pinId: payload.id });
  }

  private async handleFormCreated(event: FormCreatedEvent): Promise<void> {
    const { payload } = event;

    // Check if already exists (idempotency)
    const { data: existing } = await supabase
      .from('forms')
      .select('id')
      .eq('id', payload.id)
      .single();

    if (existing) {
      logger.debug('Form already exists, skipping', { formId: payload.id });
      return;
    }

    const { error } = await supabase.from('forms').insert({
      id: payload.id,
      pinId: payload.pinId,
      formType: payload.formType,
      data: payload.data,
      version: event.version,
      createdAt: payload.createdAt,
      updatedAt: payload.createdAt,
      userId: payload.createdBy,
      status: 'synced',
    });

    if (error) {
      logger.error('Failed to insert form', { error, formId: payload.id });
      throw error;
    }

    logger.info('Form created in read model', { formId: payload.id });
  }

  private async handleFormUpdated(event: FormUpdatedEvent): Promise<void> {
    const { payload, version } = event;

    const { error } = await supabase
      .from('forms')
      .update({
        ...payload.changes,
        version,
        updatedAt: payload.updatedAt,
      })
      .eq('id', payload.id)
      .lt('version', version);

    if (error) {
      logger.error('Failed to update form', { error, formId: payload.id });
      throw error;
    }

    logger.info('Form updated in read model', { formId: payload.id, version });
  }

  private async handleFormDeleted(event: FormDeletedEvent): Promise<void> {
    const { payload } = event;

    const { error } = await supabase.from('forms').delete().eq('id', payload.id);

    if (error) {
      logger.error('Failed to delete form', { error, formId: payload.id });
      throw error;
    }

    logger.info('Form deleted from read model', { formId: payload.id });
  }

  private async handleImageUploaded(event: ImageUploadedEvent): Promise<void> {
    const { payload } = event;

    // Update the entity (pin or form) with the new image URL
    const tableName = payload.entityType === 'pin' ? 'pins' : 'forms';

    // Get current images array
    const { data: current } = await supabase
      .from(tableName)
      .select('images')
      .eq('id', payload.entityId)
      .single();

    if (!current) {
      logger.warn('Entity not found for image upload', {
        entityType: payload.entityType,
        entityId: payload.entityId,
      });
      return;
    }

    const currentImages = (current.images as string[]) || [];

    // Add new image if not already present (idempotency)
    if (!currentImages.includes(payload.url)) {
      currentImages.push(payload.url);

      const { error } = await supabase
        .from(tableName)
        .update({ images: currentImages })
        .eq('id', payload.entityId);

      if (error) {
        logger.error('Failed to update entity with image', {
          error,
          entityType: payload.entityType,
          entityId: payload.entityId,
        });
        throw error;
      }

      logger.info('Image added to entity', {
        entityType: payload.entityType,
        entityId: payload.entityId,
        imageUrl: payload.url,
      });
    } else {
      logger.debug('Image already linked to entity', {
        entityType: payload.entityType,
        entityId: payload.entityId,
      });
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export const projectionConsumerService = new ProjectionConsumerService();
