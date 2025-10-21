-- Rollback migration: Remove event sourcing support

-- Drop functions
DROP FUNCTION IF EXISTS cleanup_old_outbox_events(INTEGER);
DROP FUNCTION IF EXISTS increment_outbox_retry(UUID, TEXT);

-- Remove version columns
DROP INDEX IF EXISTS idx_forms_id_version;
ALTER TABLE forms DROP COLUMN IF EXISTS version;

DROP INDEX IF EXISTS idx_pins_id_version;
ALTER TABLE pins DROP COLUMN IF EXISTS version;

-- Drop outbox table
DROP INDEX IF EXISTS idx_outbox_created_at;
DROP INDEX IF EXISTS idx_outbox_event_type;
DROP INDEX IF EXISTS idx_outbox_aggregate_id_version;
DROP INDEX IF EXISTS idx_outbox_aggregate_id;
DROP INDEX IF EXISTS idx_outbox_unpublished;
DROP TABLE IF EXISTS outbox;
