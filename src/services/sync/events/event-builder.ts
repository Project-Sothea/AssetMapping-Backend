import { v4 as uuidv4 } from 'uuid';
import {
  PinCreatedEvent,
  PinUpdatedEvent,
  PinDeletedEvent,
  FormCreatedEvent,
  FormUpdatedEvent,
  FormDeletedEvent,
} from '../../../types/events';
import { PinData, FormData } from '../../../types';

/**
 * Event Builder Service
 *
 * Responsibility: Build domain events with proper structure
 * - Create properly typed domain events
 * - Add event metadata (eventId, timestamp)
 * - Validate event structure
 */
export class EventBuilder {
  /**
   * Build a Pin Created event
   */
  buildPinCreated(
    aggregateId: string,
    version: number,
    userId: string,
    pinData: PinData
  ): PinCreatedEvent {
    return {
      eventId: uuidv4(),
      aggregateId,
      aggregateType: 'pin',
      type: 'PinCreated',
      version,
      timestamp: new Date().toISOString(),
      userId,
      payload: {
        id: aggregateId,
        title: pinData.name || '',
        description: pinData.description || '',
        latitude: pinData.lat || 0,
        longitude: pinData.lng || 0,
        category: pinData.images || '',
        createdBy: userId,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Build a Pin Updated event
   */
  buildPinUpdated(
    aggregateId: string,
    version: number,
    userId: string,
    changes: Record<string, unknown>
  ): PinUpdatedEvent {
    return {
      eventId: uuidv4(),
      aggregateId,
      aggregateType: 'pin',
      type: 'PinUpdated',
      version,
      timestamp: new Date().toISOString(),
      userId,
      payload: {
        id: aggregateId,
        changes,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Build a Pin Deleted event
   */
  buildPinDeleted(aggregateId: string, version: number, userId: string): PinDeletedEvent {
    return {
      eventId: uuidv4(),
      aggregateId,
      aggregateType: 'pin',
      type: 'PinDeleted',
      version,
      timestamp: new Date().toISOString(),
      userId,
      payload: {
        id: aggregateId,
        deletedBy: userId,
        deletedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Build a Form Created event
   */
  buildFormCreated(
    aggregateId: string,
    version: number,
    userId: string,
    formData: FormData
  ): FormCreatedEvent {
    return {
      eventId: uuidv4(),
      aggregateId,
      aggregateType: 'form',
      type: 'FormCreated',
      version,
      timestamp: new Date().toISOString(),
      userId,
      payload: {
        id: aggregateId,
        pinId: formData.pinId || '',
        formType: formData.formType || '',
        data: formData.data || {},
        createdBy: userId,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Build a Form Updated event
   */
  buildFormUpdated(
    aggregateId: string,
    version: number,
    userId: string,
    changes: Record<string, unknown>
  ): FormUpdatedEvent {
    return {
      eventId: uuidv4(),
      aggregateId,
      aggregateType: 'form',
      type: 'FormUpdated',
      version,
      timestamp: new Date().toISOString(),
      userId,
      payload: {
        id: aggregateId,
        changes,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Build a Form Deleted event
   */
  buildFormDeleted(aggregateId: string, version: number, userId: string): FormDeletedEvent {
    return {
      eventId: uuidv4(),
      aggregateId,
      aggregateType: 'form',
      type: 'FormDeleted',
      version,
      timestamp: new Date().toISOString(),
      userId,
      payload: {
        id: aggregateId,
        deletedBy: userId,
        deletedAt: new Date().toISOString(),
      },
    };
  }
}

export const eventBuilder = new EventBuilder();
