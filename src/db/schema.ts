import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, boolean, varchar, decimal, integer, timestamp } from 'drizzle-orm/pg-core';

export const pins = pgTable('pins', {
  id: uuid().primaryKey().defaultRandom(),
  createdAt: timestamp({ mode: 'date', withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp({ mode: 'date', withTimezone: true }).default(sql`NOW()`),
  lat: decimal({ precision: 10, scale: 8 }).notNull(),
  lng: decimal({ precision: 11, scale: 8 }).notNull(),
  type: varchar({ length: 50 }).notNull().default('normal'),
  name: varchar({ length: 255 }),
  address: text(),
  cityVillage: varchar({ length: 255 }),
  description: text(),
  status: varchar({ length: 50 }),
  images: text().default('[]'),
  version: integer().default(1),
});

export const forms = pgTable('forms', {
  id: uuid().primaryKey().defaultRandom(),
  createdAt: timestamp({ mode: 'date', withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp({ mode: 'date', withTimezone: true }).default(sql`NOW()`),
  version: integer().notNull().default(1),
  pinId: uuid().references(() => pins.id, { onDelete: 'cascade' }),

  // General
  villageId: text(),
  name: text(),
  gender: text(),
  age: integer(),
  village: text(),
  canAttendHealthScreening: boolean(),

  // Health
  longTermConditions: text(),
  otherLongTermConditions: text(),
  managementMethods: text(),
  otherManagementMethods: text(),
  conditionDifficultyReasons: text(),
  otherConditionDifficultyReasons: text(),
  selfCareActions: text(),
  otherSelfCareActions: text(),
  knowWhereToFindDoctor: text(),
  otherKnowWhereToFindDoctor: text(),
  transportToClinic: text(),
  otherTransportToClinic: text(),
  medicinePurchaseLocations: text(),
  otherMedicinePurchaseLocations: text(),
  povertyCardSchemeAwareness: text(),
  otherPovertyCardSchemeAwareness: text(),
  povertyCardNonUseReasons: text(),
  toothBrushingFrequency: text(),
  otherToothBrushingFrequency: text(),
  toothbrushAndToothpasteSource: text(),
  noToothbrushOrToothpasteReasons: text(),
  otherNoToothbrushOrToothpasteReasons: text(),

  // Education
  diarrhoeaDefinition: text(),
  otherDiarrhoeaDefinition: text(),
  diarrhoeaActions: text(),
  otherDiarrhoeaActions: text(),
  commonColdSymptoms: text(),
  otherCommonColdSymptoms: text(),
  commonColdActions: text(),
  otherCommonColdActions: text(),
  mskInjuryDefinition: text(),
  otherMskInjuryDefinition: text(),
  mskInjuryActions: text(),
  otherMskInjuryActions: text(),
  hypertensionDefinition: text(),
  otherHypertensionDefinition: text(),
  hypertensionActions: text(),
  otherHypertensionActions: text(),
  healthyFoodFrequency: text(),
  otherHealthyFoodFrequency: text(),
  unhealthyFoodReasons: text(),
  otherUnhealthyFoodReasons: text(),
  highCholesterolDefinition: text(),
  otherHighCholesterolDefinition: text(),
  highCholesterolActions: text(),
  otherHighCholesterolActions: text(),
  diabetesDefinition: text(),
  otherDiabetesDefinition: text(),
  diabetesActions: text(),
  otherDiabetesActions: text(),
  otherLearningAreas: text(),

  // Water
  waterSources: text(),
  otherWaterSources: text(),
  unsafeWaterTypes: text(),
  otherUnsafeWaterTypes: text(),
  waterFilterAwareness: text(),
  otherWaterFilterAwareness: text(),
  waterFilterNonUseReasons: text(),
  otherWaterFilterNonUseReasons: text(),
  handwashingAfterToilet: text(),
  otherHandwashingAfterToilet: text(),

  // Local-only fields (sync tracking)
  status: text(),
  });

// Inferred table types for reuse across services and API responses
export type PinDB = typeof pins.$inferSelect;
export type FormDB = typeof forms.$inferSelect;

// Parsed/API form shape (array-ish JSON fields converted to string arrays)
export const FORM_ARRAY_FIELDS = [
  'longTermConditions',
  'managementMethods',
  'conditionDifficultyReasons',
  'selfCareActions',
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

export type FormArrayFieldKeys = (typeof FORM_ARRAY_FIELDS)[number];

export type Form = Omit<FormDB, FormArrayFieldKeys> & {
  [K in FormArrayFieldKeys]: string[] | null;
};

// Parsed/API pin shape with images decoded
export type Pin = Omit<PinDB, 'images'> & { images?: string[] | null };
