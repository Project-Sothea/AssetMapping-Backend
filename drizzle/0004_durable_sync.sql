CREATE TABLE "sync_deletions" (
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_deletions_entity_type_entity_id_pk" PRIMARY KEY("entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "sync_receipts" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
