import supabase from '../config/supabase';
import { PinData, FormData, SyncItemRequest, OperationType, BatchSyncResult } from '../types';
import { logger } from '../utils/logger';
import { eventService } from './event.service';
import { idempotencyService } from './idempotency.service';
import { outboxRepository } from '../repositories/outbox.repository';
import {
  PinCreatedEvent,
  PinUpdatedEvent,
  FormCreatedEvent,
  FormUpdatedEvent,
  SyncBatchReceivedEvent,
  DomainEvent,
  PinDeletedEvent,
  FormDeletedEvent,
} from '../types/events';
import { v4 as uuidv4 } from 'uuid';

export class SyncService {
  /**
   * Process a sync item with idempotency
   */
  async syncItem(
    request: SyncItemRequest
  ): Promise<PinData | FormData | { id: string; deleted: boolean }> {
    return idempotencyService.processWithIdempotency(request.idempotencyKey, async () => {
      const result = await this.executeSyncOperation(request);

      const payload = request.payload as Record<string, unknown>;

      // Publish event to Kafka
      await eventService.publishSyncEvent({
        eventType: this.getEventType(request.operation),
        entityType: request.entityType,
        entityId: result.id || (payload.id as string) || '',
        idempotencyKey: request.idempotencyKey,
        payload: request.payload as PinData | FormData,
        userId: payload.userId as string,
        deviceId: request.deviceId,
      });

      // Create domain event for outbox (for WebSocket notifications)
      try {
        const eventType = this.getDomainEventType(request.operation, request.entityType);
        const domainEvent = await this.createDomainEvent(eventType, result, request);
        await outboxRepository.insertEvent(domainEvent);
        logger.info('Inserted domain event to outbox', {
          eventId: domainEvent.eventId,
          type: domainEvent.type,
        });
      } catch (error) {
        logger.error('Failed to create or insert domain event', { error });
      }

      // Publish audit log
      await eventService.publishAuditLog({
        action: `${request.entityType}.${request.operation}`,
        entityType: request.entityType,
        entityId: result.id || (payload.id as string) || '',
        userId: payload.userId as string,
        metadata: {
          idempotencyKey: request.idempotencyKey,
          timestamp: request.timestamp,
        },
      });

      return result;
    });
  }

  /**
   * Execute the actual sync operation based on entity type and operation
   */
  private async executeSyncOperation(
    request: SyncItemRequest
  ): Promise<PinData | FormData | { id: string; deleted: boolean }> {
    const { entityType, operation, payload } = request;

    if (entityType === 'pin') {
      return this.syncPin(operation, payload as PinData);
    } else if (entityType === 'form') {
      return this.syncForm(operation, payload as FormData);
    }

    throw new Error(`Unsupported entity type: ${entityType}`);
  }

  /**
   * Sync a pin to the database
   */
  private async syncPin(
    operation: OperationType,
    data: PinData
  ): Promise<PinData | { id: string; deleted: boolean }> {
    logger.info('Syncing pin', { operation, pinId: data.id });

    if (operation === 'delete' && data.id) {
      const { error } = await supabase.from('pins').delete().eq('id', data.id);

      if (error) throw error;
      return { id: data.id, deleted: true };
    }

    // Upsert (create or update)
    const pinData = {
      ...data,
      updatedAt: new Date().toISOString(),
      ...((!data.id || operation === 'create') && {
        createdAt: new Date().toISOString(),
      }),
    };

    const { data: result, error } = await supabase
      .from('pins')
      .upsert(pinData, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      logger.error('Error syncing pin', { error, data });
      throw error;
    }

    logger.info('Pin synced successfully', { pinId: result.id });
    return result;
  }

  /**
   * Sync a form to the database
   */
  private async syncForm(
    operation: OperationType,
    data: FormData
  ): Promise<FormData | { id: string; deleted: boolean }> {
    logger.info('Syncing form', { operation, formId: data.id });

    if (operation === 'delete' && data.id) {
      const { error } = await supabase.from('forms').delete().eq('id', data.id);

      if (error) throw error;
      return { id: data.id, deleted: true };
    }

    // Upsert (create or update)
    const formData = {
      ...data,
      updatedAt: new Date().toISOString(),
      status: data.status || 'synced',
      ...((!data.id || operation === 'create') && {
        createdAt: new Date().toISOString(),
      }),
    };

    const { data: result, error } = await supabase
      .from('forms')
      .upsert(formData, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      logger.error('Error syncing form', { error, data });
      throw error;
    }

    logger.info('Form synced successfully', { formId: result.id });
    return result;
  }

  /**
   * Get event type from operation
   */
  private getEventType(
    operation: OperationType
  ): 'sync.item.created' | 'sync.item.updated' | 'sync.item.deleted' {
    switch (operation) {
      case 'create':
        return 'sync.item.created';
      case 'update':
        return 'sync.item.updated';
      case 'delete':
        return 'sync.item.deleted';
      default:
        return 'sync.item.updated';
    }
  }

  /**
   * Get domain event type from operation and entity type
   */
  private getDomainEventType(operation: OperationType, entityType: 'pin' | 'form'): string {
    const prefix = entityType === 'pin' ? 'Pin' : 'Form';
    switch (operation) {
      case 'create':
        return `${prefix}Created`;
      case 'update':
        return `${prefix}Updated`;
      case 'delete':
        return `${prefix}Deleted`;
      default:
        return `${prefix}Updated`;
    }
  }

  /**
   * Create domain event for outbox
   */
  private async createDomainEvent(
    eventType: string,
    result: PinData | FormData | { id: string; deleted: boolean },
    request: SyncItemRequest
  ): Promise<DomainEvent> {
    const payload = request.payload as Record<string, unknown>;
    const userId = payload.userId as string;
    const entityId = result.id || (payload.id as string);
    const nextVersion = await outboxRepository.getNextVersion(entityId);

    const baseEvent = {
      eventId: uuidv4(),
      aggregateId: entityId,
      aggregateType: request.entityType as 'pin' | 'form',
      type: eventType,
      version: nextVersion,
      timestamp: new Date().toISOString(),
      userId,
    };

    if (eventType === 'PinCreated') {
      return {
        ...baseEvent,
        type: 'PinCreated',
        payload: {
          id: entityId,
          title: (result as PinData).name || '',
          description: (result as PinData).description || '',
          latitude: (result as PinData).lat || 0,
          longitude: (result as PinData).lng || 0,
          category: (result as PinData).images || '',
          createdBy: userId,
          createdAt: new Date().toISOString(),
        },
      } as PinCreatedEvent;
    } else if (eventType === 'PinUpdated') {
      return {
        ...baseEvent,
        type: 'PinUpdated',
        payload: {
          id: entityId,
          changes: result as unknown as Record<string, unknown>,
          updatedBy: userId,
          updatedAt: new Date().toISOString(),
        },
      } as PinUpdatedEvent;
    } else if (eventType === 'PinDeleted') {
      return {
        ...baseEvent,
        type: 'PinDeleted',
        payload: {
          id: entityId,
          deletedBy: userId,
          deletedAt: new Date().toISOString(),
        },
      } as PinDeletedEvent;
    } else if (eventType === 'FormCreated') {
      return {
        ...baseEvent,
        type: 'FormCreated',
        payload: {
          id: entityId,
          pinId: (result as FormData).pinId || '',
          formType: (result as FormData).formType || '',
          data: (result as FormData).data || {},
          createdBy: userId,
          createdAt: new Date().toISOString(),
        },
      } as FormCreatedEvent;
    } else if (eventType === 'FormUpdated') {
      return {
        ...baseEvent,
        type: 'FormUpdated',
        payload: {
          id: entityId,
          changes: result as unknown as Record<string, unknown>,
          updatedBy: userId,
          updatedAt: new Date().toISOString(),
        },
      } as FormUpdatedEvent;
    } else if (eventType === 'FormDeleted') {
      return {
        ...baseEvent,
        type: 'FormDeleted',
        payload: {
          id: entityId,
          deletedBy: userId,
          deletedAt: new Date().toISOString(),
        },
      } as FormDeletedEvent;
    }

    throw new Error(`Unknown event type: ${eventType}`);
  }

  /**
   * Batch sync multiple items
   */
  async batchSync(requests: SyncItemRequest[]): Promise<BatchSyncResult[]> {
    logger.info('Starting batch sync', { count: requests.length });

    const results = await Promise.allSettled(requests.map((request) => this.syncItem(request)));

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    logger.info('Batch sync completed', {
      total: requests.length,
      successes: successes.length,
      failures: failures.length,
    });

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return { success: true, data: result.value, request: requests[index] };
      } else {
        return {
          success: false,
          error: result.reason.message,
          request: requests[index],
        };
      }
    });
  }

  /**
   * Upsert a pin with optimistic concurrency control
   */
  async upsertPinWithVersion(
    pinData: PinData & { version?: number },
    userId: string,
    baseVersion?: number
  ): Promise<{ pin: PinData; version: number; conflict?: boolean }> {
    const isUpdate = !!pinData.id;
    const pinId = pinData.id || uuidv4();

    try {
      if (isUpdate) {
        // Check current version for optimistic locking
        const { data: existing, error: fetchError } = await supabase
          .from('pins')
          .select('version')
          .eq('id', pinId)
          .single();

        if (fetchError) {
          throw new Error(`Failed to fetch existing pin: ${fetchError.message}`);
        }

        const currentVersion = existing.version || 1;

        // Conflict detection
        if (baseVersion !== undefined && baseVersion !== currentVersion) {
          logger.warn('Version conflict detected', {
            pinId,
            baseVersion,
            currentVersion,
          });

          // Return current state for client to merge
          const { data: currentPin } = await supabase
            .from('pins')
            .select('*')
            .eq('id', pinId)
            .single();

          return {
            pin: currentPin as PinData,
            version: currentVersion,
            conflict: true,
          };
        }

        const newVersion = currentVersion + 1;

        // Update pin with incremented version
        const { data: updatedPin, error: updateError } = await supabase
          .from('pins')
          .update({
            ...pinData,
            version: newVersion,
            updatedAt: new Date().toISOString(),
          })
          .eq('id', pinId)
          .eq('version', currentVersion) // Optimistic lock
          .select()
          .single();

        if (updateError) {
          // If update affected 0 rows, version changed between check and update
          if (updateError.code === 'PGRST116') {
            logger.warn('Concurrent update detected', { pinId });
            const { data: currentPin } = await supabase
              .from('pins')
              .select('*')
              .eq('id', pinId)
              .single();
            return {
              pin: currentPin as PinData,
              version: currentPin.version,
              conflict: true,
            };
          }
          throw updateError;
        }

        // Create event for outbox
        const event: PinUpdatedEvent = {
          eventId: uuidv4(),
          aggregateId: pinId,
          aggregateType: 'pin',
          type: 'PinUpdated',
          version: newVersion,
          timestamp: new Date().toISOString(),
          userId,
          payload: {
            id: pinId,
            changes: pinData as unknown as Record<string, unknown>,
            updatedBy: userId,
            updatedAt: new Date().toISOString(),
          },
        };

        await outboxRepository.insertEvent(event);

        logger.info('Pin updated', { pinId, version: newVersion });
        return { pin: updatedPin as PinData, version: newVersion };
      } else {
        // Create new pin
        const newPin = {
          id: pinId,
          ...pinData,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const { data: createdPin, error: createError } = await supabase
          .from('pins')
          .insert(newPin)
          .select()
          .single();

        if (createError) {
          throw createError;
        }

        // Create event for outbox
        const event: PinCreatedEvent = {
          eventId: uuidv4(),
          aggregateId: pinId,
          aggregateType: 'pin',
          type: 'PinCreated',
          version: 1,
          timestamp: new Date().toISOString(),
          userId,
          payload: {
            id: pinId,
            title: pinData.name || '',
            description: pinData.description,
            latitude: pinData.lat || 0,
            longitude: pinData.lng || 0,
            category: pinData.images || '', // Store as category for now
            createdBy: userId,
            createdAt: new Date().toISOString(),
          },
        };

        await outboxRepository.insertEvent(event);

        logger.info('Pin created', { pinId });
        return { pin: createdPin as PinData, version: 1 };
      }
    } catch (error) {
      logger.error('Failed to upsert pin', { error, pinId });
      throw error;
    }
  }

  /**
   * Upsert a form with optimistic concurrency control
   */
  async upsertFormWithVersion(
    formData: FormData & { version?: number },
    userId: string,
    baseVersion?: number
  ): Promise<{ form: FormData; version: number; conflict?: boolean }> {
    const isUpdate = !!formData.id;
    const formId = formData.id || uuidv4();

    try {
      if (isUpdate) {
        const { data: existing, error: fetchError } = await supabase
          .from('forms')
          .select('version')
          .eq('id', formId)
          .single();

        if (fetchError) {
          throw new Error(`Failed to fetch existing form: ${fetchError.message}`);
        }

        const currentVersion = existing.version || 1;

        if (baseVersion !== undefined && baseVersion !== currentVersion) {
          logger.warn('Version conflict detected', {
            formId,
            baseVersion,
            currentVersion,
          });

          const { data: currentForm } = await supabase
            .from('forms')
            .select('*')
            .eq('id', formId)
            .single();

          return {
            form: currentForm as FormData,
            version: currentVersion,
            conflict: true,
          };
        }

        const newVersion = currentVersion + 1;

        const { data: updatedForm, error: updateError } = await supabase
          .from('forms')
          .update({
            ...formData,
            version: newVersion,
            updatedAt: new Date().toISOString(),
          })
          .eq('id', formId)
          .eq('version', currentVersion)
          .select()
          .single();

        if (updateError) {
          if (updateError.code === 'PGRST116') {
            const { data: currentForm } = await supabase
              .from('forms')
              .select('*')
              .eq('id', formId)
              .single();
            return {
              form: currentForm as FormData,
              version: currentForm.version,
              conflict: true,
            };
          }
          throw updateError;
        }

        const event: FormUpdatedEvent = {
          eventId: uuidv4(),
          aggregateId: formId,
          aggregateType: 'form',
          type: 'FormUpdated',
          version: newVersion,
          timestamp: new Date().toISOString(),
          userId,
          payload: {
            id: formId,
            changes: formData as unknown as Record<string, unknown>,
            updatedBy: userId,
            updatedAt: new Date().toISOString(),
          },
        };

        await outboxRepository.insertEvent(event);

        logger.info('Form updated', { formId, version: newVersion });
        return { form: updatedForm as FormData, version: newVersion };
      } else {
        const newForm = {
          id: formId,
          ...formData,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const { data: createdForm, error: createError } = await supabase
          .from('forms')
          .insert(newForm)
          .select()
          .single();

        if (createError) {
          throw createError;
        }

        const event: FormCreatedEvent = {
          eventId: uuidv4(),
          aggregateId: formId,
          aggregateType: 'form',
          type: 'FormCreated',
          version: 1,
          timestamp: new Date().toISOString(),
          userId,
          payload: {
            id: formId,
            pinId: formData.pinId || '',
            formType: formData.formType || '',
            data: formData.data || {},
            createdBy: userId,
            createdAt: new Date().toISOString(),
          },
        };

        await outboxRepository.insertEvent(event);

        logger.info('Form created', { formId });
        return { form: createdForm as FormData, version: 1 };
      }
    } catch (error) {
      logger.error('Failed to upsert form', { error, formId });
      throw error;
    }
  }

  /**
   * Process a sync batch from a device with conflict detection
   */
  async processSyncBatchWithVersioning(
    batchId: string,
    deviceId: string,
    userId: string,
    items: Array<{
      type: 'pin' | 'form';
      id: string;
      data: PinData | FormData;
      baseVersion?: number;
    }>
  ): Promise<{
    success: boolean;
    results: Array<{
      id: string;
      success: boolean;
      conflict?: boolean;
      version?: number;
      data?: PinData | FormData;
      error?: string;
    }>;
  }> {
    logger.info('Processing sync batch', {
      batchId,
      deviceId,
      userId,
      itemCount: items.length,
    });

    // Emit batch received event
    const batchEvent: SyncBatchReceivedEvent = {
      eventId: uuidv4(),
      aggregateId: batchId,
      aggregateType: 'pin', // or determine from items
      type: 'SyncBatchReceived',
      version: 1,
      timestamp: new Date().toISOString(),
      userId,
      payload: {
        batchId,
        deviceId,
        userId,
        itemCount: items.length,
        receivedAt: new Date().toISOString(),
      },
    };

    await outboxRepository.insertEvent(batchEvent);

    const results = [];

    for (const item of items) {
      try {
        let result;
        if (item.type === 'pin') {
          result = await this.upsertPinWithVersion(item.data as PinData, userId, item.baseVersion);
        } else if (item.type === 'form') {
          result = await this.upsertFormWithVersion(
            item.data as FormData,
            userId,
            item.baseVersion
          );
        }

        results.push({
          id: item.id,
          success: !result?.conflict,
          conflict: result?.conflict || false,
          version: result?.version,
          data: result?.conflict ? ('pin' in result ? result.pin : result.form) : undefined,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to process sync item', { error, item });
        results.push({
          id: item.id,
          success: false,
          error: errorMessage,
        });
      }
    }

    return {
      success: true,
      results,
    };
  }
}

export const syncService = new SyncService();
