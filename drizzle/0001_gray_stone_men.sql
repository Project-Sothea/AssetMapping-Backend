ALTER TABLE "forms" ALTER COLUMN "pinId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "householdNumber" text;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "conflictHealthcareAccess" text;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "conflictHealthManagement" text;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "conflictCleanWaterAccess" text;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "conflictCostOfLiving" text;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "waterHealthConsequences" text;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "waterSocioeconomicConsequences" text;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "waterFilterExperience" text;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "handwashingBeforeMeals" text;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "handwashingBeforeMealsReason" text;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "pressingHealthNeed" text;