import { z } from 'zod';

// Base event schema
export const BaseEventSchema = z.object({
  eventId: z.string().uuid(),
  aggregateId: z.string(),
  aggregateType: z.enum(['pin', 'form']),
  version: z.number().int().positive(),
  timestamp: z.string().datetime(),
  userId: z.string().optional(),
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

// Pin events
export const PinCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal('PinCreated'),
  payload: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    latitude: z.number(),
    longitude: z.number(),
    category: z.string().optional(),
    createdBy: z.string(),
    createdAt: z.string().datetime(),
  }),
});

export const PinUpdatedEventSchema = BaseEventSchema.extend({
  type: z.literal('PinUpdated'),
  payload: z.object({
    id: z.string(),
    changes: z.record(z.unknown()),
    updatedBy: z.string(),
    updatedAt: z.string().datetime(),
  }),
});

export const PinDeletedEventSchema = BaseEventSchema.extend({
  type: z.literal('PinDeleted'),
  payload: z.object({
    id: z.string(),
    deletedBy: z.string(),
    deletedAt: z.string().datetime(),
  }),
});

// Image events
export const ImageUploadedEventSchema = BaseEventSchema.extend({
  type: z.literal('ImageUploaded'),
  payload: z.object({
    imageId: z.string(),
    entityType: z.enum(['pin', 'form']),
    entityId: z.string(),
    url: z.string().url(),
    filename: z.string(),
    sizeBytes: z.number(),
    mimeType: z.string(),
    uploadedBy: z.string(),
    uploadedAt: z.string().datetime(),
  }),
});

export const ImageDeletedEventSchema = BaseEventSchema.extend({
  type: z.literal('ImageDeleted'),
  payload: z.object({
    imageId: z.string(),
    entityType: z.enum(['pin', 'form']),
    entityId: z.string(),
    url: z.string().url(),
    deletedBy: z.string(),
    deletedAt: z.string().datetime(),
  }),
});

// Sync batch events
export const SyncBatchReceivedEventSchema = BaseEventSchema.extend({
  type: z.literal('SyncBatchReceived'),
  payload: z.object({
    batchId: z.string(),
    deviceId: z.string(),
    userId: z.string(),
    itemCount: z.number(),
    receivedAt: z.string().datetime(),
  }),
});

// Form events
export const FormCreatedEventSchema = BaseEventSchema.extend({
  type: z.literal('FormCreated'),
  payload: z.object({
    id: z.string(),
    pinId: z.string(),
    formType: z.string(),
    data: z.record(z.unknown()),
    createdBy: z.string(),
    createdAt: z.string().datetime(),
  }),
});

export const FormUpdatedEventSchema = BaseEventSchema.extend({
  type: z.literal('FormUpdated'),
  payload: z.object({
    id: z.string(),
    changes: z.record(z.unknown()),
    updatedBy: z.string(),
    updatedAt: z.string().datetime(),
  }),
});

export const FormDeletedEventSchema = BaseEventSchema.extend({
  type: z.literal('FormDeleted'),
  payload: z.object({
    id: z.string(),
    deletedBy: z.string(),
    deletedAt: z.string().datetime(),
  }),
});

// Union types
export type PinCreatedEvent = z.infer<typeof PinCreatedEventSchema>;
export type PinUpdatedEvent = z.infer<typeof PinUpdatedEventSchema>;
export type PinDeletedEvent = z.infer<typeof PinDeletedEventSchema>;
export type ImageUploadedEvent = z.infer<typeof ImageUploadedEventSchema>;
export type ImageDeletedEvent = z.infer<typeof ImageDeletedEventSchema>;
export type SyncBatchReceivedEvent = z.infer<typeof SyncBatchReceivedEventSchema>;
export type FormCreatedEvent = z.infer<typeof FormCreatedEventSchema>;
export type FormUpdatedEvent = z.infer<typeof FormUpdatedEventSchema>;
export type FormDeletedEvent = z.infer<typeof FormDeletedEventSchema>;

export type DomainEvent =
  | PinCreatedEvent
  | PinUpdatedEvent
  | PinDeletedEvent
  | ImageUploadedEvent
  | ImageDeletedEvent
  | SyncBatchReceivedEvent
  | FormCreatedEvent
  | FormUpdatedEvent
  | FormDeletedEvent;
