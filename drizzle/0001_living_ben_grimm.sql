ALTER TABLE "forms" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "forms" ALTER COLUMN "createdAt" SET DEFAULT NOW();--> statement-breakpoint
ALTER TABLE "forms" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "forms" ALTER COLUMN "updatedAt" SET DEFAULT NOW();--> statement-breakpoint
ALTER TABLE "forms" ALTER COLUMN "deletedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "forms" ALTER COLUMN "lastSyncedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "forms" ALTER COLUMN "lastFailedSyncAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pins" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pins" ALTER COLUMN "createdAt" SET DEFAULT NOW();--> statement-breakpoint
ALTER TABLE "pins" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pins" ALTER COLUMN "updatedAt" SET DEFAULT NOW();--> statement-breakpoint
ALTER TABLE "pins" ALTER COLUMN "deletedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pins" ALTER COLUMN "lastSyncedAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pins" ALTER COLUMN "lastFailedSyncAt" SET DATA TYPE timestamp with time zone;