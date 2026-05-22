import { pgTable, uuid, text, boolean, real, integer, timestamp } from 'drizzle-orm/pg-core';

export const pins = pgTable('pins', {
  // Metadata
  id: uuid().primaryKey().defaultRandom(),
  createdAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow(),
  version: integer().notNull().default(1),
  status: text(),

  // Location
  lat: real().notNull(),
  lng: real().notNull(),

  // Details
  name: text().notNull(),
  address: text(),
  cityVillage: text(),
  description: text(),
  type: text(),

  // Images - stored as JSON array of filenames (UUIDs)
  images: text(),
});

export const forms = pgTable('forms', {
  // Metadata
  id: uuid().primaryKey(),
  createdAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow(),
  version: integer().notNull().default(1),
  pinId: uuid()
    .references(() => pins.id, { onDelete: 'cascade' })
    .notNull(),
  status: text(),

  // General
  villageId: text().notNull(),
  name: text().notNull(),
  village: text().notNull(),
  otherVillage: text(),
  dataCollectionDate: text(),
  householdNumber: text(),
  gender: text(),
  age: integer(),
  canAttendHealthScreening: boolean(),

  // Conflict Impact
  conflictHealthcareAccess: text(),
  conflictHealthManagement: text(),
  conflictCleanWaterAccess: text(),
  conflictCostOfLiving: text(),

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
  waterHealthConsequences: text(),
  waterSocioeconomicConsequences: text(),
  waterFilterAwareness: text(),
  otherWaterFilterAwareness: text(),
  waterFilterExperience: text(),
  waterFilterNonUseReasons: text(),
  otherWaterFilterNonUseReasons: text(),
  handwashingAfterToilet: text(),
  otherHandwashingAfterToilet: text(),
  handwashingBeforeMeals: text(),
  handwashingBeforeMealsReason: text(),
  pressingHealthNeed: text(),
});
