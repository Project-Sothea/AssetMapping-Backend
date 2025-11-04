import { z } from 'zod';

// Base types
export interface IdempotencyKey {
  key: string;
  createdAt: Date;
  expiresAt: Date;
}

export type EntityType = 'pin' | 'form';
export type OperationType = 'create' | 'update' | 'delete';

// Sync request types
export const SyncItemRequestSchema = z.object({
  idempotencyKey: z.string().min(1),
  entityType: z.enum(['pin', 'form']),
  operation: z.enum(['create', 'update', 'delete']),
  payload: z.record(z.any()),
  timestamp: z.string().optional(),
  deviceId: z.string().optional(),
});

export type SyncItemRequest = z.infer<typeof SyncItemRequestSchema>;

export interface SyncItemResponse {
  success: boolean;
  data?: PinData | FormData | null;
  message?: string;
  idempotencyKey: string;
  timestamp: string;
}

export interface BatchSyncResult {
  success: boolean;
  data?: PinData | FormData | { id: string; deleted: boolean };
  error?: string;
  request: SyncItemRequest;
}

// Pin types (matches actual database schema - verified 2025-11-05)
export interface PinData {
  id?: string;
  lat: number;
  lng: number;
  name?: string;
  type?: string;
  address?: string;
  cityVillage?: string;
  description?: string;
  images?: string; // JSON array string, e.g., "[]" or "[\"url1\",\"url2\"]"
  localImages?: string; // JSON array string, e.g., "[]" or "[\"path1\",\"path2\"]"
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  version?: number;
  status?: string | null;
  failureReason?: string | null;
  lastSyncedAt?: string | null;
  lastFailedSyncAt?: string | null;
}

export const PinDataSchema = z.object({
  id: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  name: z.string().optional(),
  type: z.string().optional(),
  address: z.string().optional(),
  cityVillage: z.string().optional(),
  description: z.string().optional(),
  images: z.string().optional(), // JSON array string
  localImages: z.string().optional(), // JSON array string
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  deletedAt: z.string().nullable().optional(),
  version: z.number().optional(),
  status: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  lastSyncedAt: z.string().nullable().optional(),
  lastFailedSyncAt: z.string().nullable().optional(),
});

// Form types (matches actual database schema - verified 2025-11-05)
// Note: All health survey fields are stored as strings (often JSON arrays for multi-select)
export interface FormData {
  id?: string;
  pinId?: string;
  name?: string;
  formType?: string; // Not stored in DB, used for business logic only
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  village?: string | null;
  villageId?: string | null;
  failureReason?: string | null;
  status?: string | null;
  lastSyncedAt?: string | null;
  lastFailedSyncAt?: string | null;
  version?: number;
  // Health survey specific fields - all stored as strings (JSON arrays for multi-select)
  canAttend?: unknown;
  otherCondition?: unknown;
  conditionDetails?: unknown;
  otherManagement?: unknown;
  otherSickAction?: unknown;
  knowDoctor?: unknown;
  ownTransport?: unknown;
  whereBuyMedicine?: unknown;
  otherBuyMedicine?: unknown;
  povertyCard?: unknown;
  brushTeeth?: unknown;
  otherBrushTeeth?: unknown;
  haveToothbrush?: unknown;
  diarrhoea?: unknown;
  diarrhoeaAction?: unknown;
  coldLookLike?: unknown;
  mskInjury?: unknown;
  hypertension?: unknown;
  cholesterol?: unknown;
  diabetes?: unknown;
  handBeforeMeal?: unknown;
  handAfterToilet?: unknown;
  eatCleanFood?: unknown;
  otherLearning?: unknown;
  otherWaterSource?: unknown;
  knowWaterFilters?: unknown;
  otherWaterFilterReason?: unknown;
  cholesterolAction?: unknown;
  coldAction?: unknown;
  diabetesAction?: unknown;
  hypertensionAction?: unknown;
  longTermConditions?: unknown;
  managementMethods?: unknown;
  mskAction?: unknown;
  notUsingWaterFilter?: unknown;
  unsafeWater?: unknown;
  waterSources?: unknown;
  whatDoWhenSick?: unknown;
}

export const FormDataSchema = z
  .object({
    id: z.string().optional(),
    pinId: z.string().optional(),
    name: z.string().optional(),
    formType: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    deletedAt: z.string().nullable().optional(),
    village: z.string().nullable().optional(),
    villageId: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    version: z.number().optional(),
    // Allow all other fields as optional
  })
  .passthrough();

// Image types
export interface ImageUploadRequest {
  filename: string;
  contentType: string;
  sizeBytes: number;
  entityType: EntityType;
  entityId: string;
}

export const ImageUploadRequestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().regex(/^image\/(jpeg|jpg|png|webp)$/),
  sizeBytes: z.number().positive(),
  entityType: z.enum(['pin', 'form']),
  entityId: z.string().min(1),
});

export interface SignedUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  token: string;
  expiresAt: string;
}

// Event types for Kafka
export interface SyncEvent {
  eventId: string;
  eventType: 'sync.item.created' | 'sync.item.updated' | 'sync.item.deleted';
  entityType: EntityType;
  entityId: string;
  idempotencyKey: string;
  payload: PinData | FormData;
  timestamp: string;
  userId?: string;
  deviceId?: string;
}

export interface ImageEvent {
  eventId: string;
  eventType: 'image.uploaded' | 'image.processed' | 'image.deleted';
  imageUrl: string;
  entityType: EntityType;
  entityId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// Error types
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(401, message);
  }
}
