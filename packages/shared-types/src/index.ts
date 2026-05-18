import { forms, pins } from './schema';
export { forms, pins } from './schema';

// Inferred table types for reuse across services and API responses
export type PinDB = typeof pins.$inferSelect;
export type FormDB = typeof forms.$inferSelect;

// Parsed/API form shape (array-ish JSON fields converted to string arrays)
export const FORM_ARRAY_FIELDS = [
  'longTermConditions',
  'managementMethods',
  'conditionDifficultyReasons',
  'selfCareActions',
  'medicinePurchaseLocations',
  'noToothbrushOrToothpasteReasons',
  'diarrhoeaDefinition',
  'diarrhoeaActions',
  'commonColdSymptoms',
  'commonColdActions',
  'mskInjuryDefinition',
  'mskInjuryActions',
  'hypertensionDefinition',
  'hypertensionActions',
  'unhealthyFoodReasons',
  'highCholesterolDefinition',
  'highCholesterolActions',
  'diabetesDefinition',
  'diabetesActions',
  'waterSources',
  'unsafeWaterTypes',
  'waterFilterNonUseReasons',
] as const;

export type FormArrayFieldKey = (typeof FORM_ARRAY_FIELDS)[number];

export type Form = Omit<FormDB, FormArrayFieldKey> & {
  [K in FormArrayFieldKey]: string[];
};

// Parsed/API pin shape with images decoded
export type Pin = Omit<PinDB, 'images'> & { images: string[] };

export type EntityType = 'pin' | 'form';
export type OperationType = 'create' | 'update' | 'delete';

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  message?: string;
};

export type ApiErrorResponse = {
  success: false;
  error: string;
  message?: string;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface SyncItemRequest {
  idempotencyKey: string;
  entityType: EntityType;
  operation: OperationType;
  payload: Record<string, unknown>;
  timestamp?: Date;
  deviceId?: string;
}

export interface SyncEvent {
  eventId: string;
  eventType: 'sync.item.created' | 'sync.item.updated' | 'sync.item.deleted';
  entityType: EntityType;
  entityId: string;
  idempotencyKey: string;
  payload: Pin | Form;
  timestamp: Date;
  userId?: string;
  deviceId?: string;
}

export type SyncAction = 'created' | 'updated' | 'deleted';

export interface SyncNotificationPayload {
  entityType: EntityType;
  entityId: string;
  [key: string]: unknown;
}

export interface SyncNotification {
  type: EntityType;
  action: SyncAction;
  eventId: string;
  aggregateId: string;
  timestamp: Date;
  payload: SyncNotificationPayload;
}

export interface StorageDeleteResult {
  deleted: number;
  errors: number;
}

export type SyncResult = Pin | Form | { id: string; deleted: boolean };
