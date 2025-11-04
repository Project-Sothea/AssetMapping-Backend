/**
 * Database Schema Types
 *
 * This file contains the complete database schema definitions for all tables.
 * These types represent the ACTUAL structure of tables in Supabase PostgreSQL.
 *
 * Last Verified: November 5, 2025
 * Source: Direct inspection of Supabase production database
 *
 * @see /docs/DATABASE_SCHEMA.md for detailed documentation
 */

// =============================================================================
// PINS TABLE
// =============================================================================

/**
 * Pins Table Schema
 *
 * Stores geographic location pins with associated metadata.
 * Used for tracking physical locations on the map.
 */
export interface PinsTable {
  /** Primary key, unique identifier (UUID) */
  id: string;

  /** When the pin was created (ISO 8601 timestamp with timezone) */
  createdAt: string;

  /** Last update timestamp (ISO 8601 timestamp with timezone) */
  updatedAt: string;

  /** Latitude coordinate (decimal, -90 to 90) */
  lat: number;

  /** Longitude coordinate (decimal, -180 to 180) */
  lng: number;

  /** Pin category/type (e.g., 'normal', 'hospital', 'school') */
  type: string;

  /** Pin name/title (nullable) */
  name: string | null;

  /** Street address (nullable) */
  address: string | null;

  /** City or village name (nullable) */
  cityVillage: string | null;

  /** Pin description (nullable) */
  description: string | null;

  /** Soft delete timestamp (nullable, ISO 8601 timestamp with timezone) */
  deletedAt: string | null;

  /** Sync failure reason (nullable) */
  failureReason: string | null;

  /** Sync status (nullable, e.g., 'pending', 'synced', 'failed') */
  status: string | null;

  /** Last successful sync timestamp (nullable, ISO 8601 timestamp with timezone) */
  lastSyncedAt: string | null;

  /** Last failed sync attempt timestamp (nullable, ISO 8601 timestamp with timezone) */
  lastFailedSyncAt: string | null;

  /** Local image paths stored as JSON array string (e.g., "[]", "[\"path1\",\"path2\"]") */
  localImages: string;

  /** Remote image URLs stored as JSON array string (e.g., "[]", "[\"url1\",\"url2\"]") */
  images: string;

  /** Optimistic concurrency version number (integer, default: 1) */
  version: number;
}

/**
 * Pins Table Indexes:
 * - PRIMARY KEY: id
 * - INDEX: (id, version) - for optimistic locking
 */

// =============================================================================
// FORMS TABLE
// =============================================================================

/**
 * Forms Table Schema
 *
 * Stores health survey forms linked to pins.
 * All health survey fields are stored as strings (often JSON arrays for multi-select).
 */
export interface FormsTable {
  /** Primary key, unique identifier (UUID) */
  id: string;

  /** When the form was created (ISO 8601 timestamp with timezone) */
  createdAt: string;

  /** Last update timestamp (ISO 8601 timestamp with timezone) */
  updatedAt: string;

  /** Foreign key to pins table (UUID) */
  pinId: string;

  /** Soft delete timestamp (nullable, ISO 8601 timestamp with timezone) */
  deletedAt: string | null;

  /** Village name (nullable) */
  village: string | null;

  /** Village identifier (nullable) */
  villageId: string | null;

  /** Sync failure reason (nullable) */
  failureReason: string | null;

  /** Sync status (nullable, e.g., 'dirty', 'synced') */
  status: string | null;

  /** Last successful sync timestamp (nullable, ISO 8601 timestamp with timezone) */
  lastSyncedAt: string | null;

  /** Last failed sync attempt timestamp (nullable, ISO 8601 timestamp with timezone) */
  lastFailedSyncAt: string | null;

  /** Optimistic concurrency version number (integer, default: 1) */
  version: number;

  /** Form name/title (nullable) */
  name: string | null;

  // Health Survey Fields - All stored as strings (often JSON arrays for multi-select)

  /** Can the person attend? (nullable string) */
  canAttend: string | null;

  /** Other medical conditions (nullable string) */
  otherCondition: string | null;

  /** Details about conditions (nullable string) */
  conditionDetails: string | null;

  /** Other management methods (nullable string) */
  otherManagement: string | null;

  /** Other actions when sick (nullable string) */
  otherSickAction: string | null;

  /** Know where to find doctor (nullable string) */
  knowDoctor: string | null;

  /** Own transportation (nullable string) */
  ownTransport: string | null;

  /** Where to buy medicine (nullable string, JSON array) */
  whereBuyMedicine: string | null;

  /** Other medicine sources (nullable string) */
  otherBuyMedicine: string | null;

  /** Poverty card status (nullable string) */
  povertyCard: string | null;

  /** Teeth brushing frequency (nullable string) */
  brushTeeth: string | null;

  /** Other teeth care (nullable string) */
  otherBrushTeeth: string | null;

  /** Toothbrush availability (nullable string) */
  haveToothbrush: string | null;

  /** Diarrhea symptoms (nullable string, JSON array) */
  diarrhoea: string | null;

  /** Actions for diarrhea (nullable string, JSON array) */
  diarrhoeaAction: string | null;

  /** Cold symptoms (nullable string, JSON array) */
  coldLookLike: string | null;

  /** MSK injuries (nullable string, JSON array) */
  mskInjury: string | null;

  /** Hypertension info (nullable string) */
  hypertension: string | null;

  /** Cholesterol info (nullable string) */
  cholesterol: string | null;

  /** Diabetes info (nullable string) */
  diabetes: string | null;

  /** Wash hands before meals (nullable string) */
  handBeforeMeal: string | null;

  /** Wash hands after toilet (nullable string) */
  handAfterToilet: string | null;

  /** Eat clean food (nullable string) */
  eatCleanFood: string | null;

  /** Other learning topics (nullable string) */
  otherLearning: string | null;

  /** Other water sources (nullable string) */
  otherWaterSource: string | null;

  /** Know about water filters (nullable string) */
  knowWaterFilters: string | null;

  /** Reasons for not using filters (nullable string) */
  otherWaterFilterReason: string | null;

  /** Actions for cholesterol (nullable string, JSON array) */
  cholesterolAction: string | null;

  /** Actions for cold (nullable string, JSON array) */
  coldAction: string | null;

  /** Actions for diabetes (nullable string, JSON array) */
  diabetesAction: string | null;

  /** Actions for hypertension (nullable string, JSON array) */
  hypertensionAction: string | null;

  /** Long-term conditions (nullable string, JSON array) */
  longTermConditions: string | null;

  /** Management methods (nullable string, JSON array) */
  managementMethods: string | null;

  /** Actions for MSK (nullable string, JSON array) */
  mskAction: string | null;

  /** Reasons not using filter (nullable string, JSON array) */
  notUsingWaterFilter: string | null;

  /** Unsafe water indicators (nullable string, JSON array) */
  unsafeWater: string | null;

  /** Water sources (nullable string, JSON array) */
  waterSources: string | null;

  /** Actions when sick (nullable string, JSON array) */
  whatDoWhenSick: string | null;
}

/**
 * Forms Table Indexes:
 * - PRIMARY KEY: id
 * - FOREIGN KEY: pinId (references pins.id)
 * - INDEX: (id, version) - for optimistic locking
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// =============================================================================
// TYPE EXPORTS
// =============================================================================

/**
 * Union type for all database tables
 */
export type DatabaseTable = PinsTable | FormsTable;

/**
 * Database table names
 */
export type TableName = 'pins' | 'forms';

/**
 * Type helper to get table type by name
 */
export type TableType<T extends TableName> = T extends 'pins'
  ? PinsTable
  : T extends 'forms'
    ? FormsTable
    : never;
