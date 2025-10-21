-- Migration: Add event sourcing support
-- Description: Adds outbox table for transactional outbox pattern and version columns for optimistic concurrency

-- 1. Create outbox table for event sourcing
CREATE TABLE IF NOT EXISTS outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id VARCHAR(255) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    error TEXT,
    
    -- Ensure version uniqueness per aggregate
    UNIQUE(aggregate_id, version)
);

-- Indexes for outbox table
CREATE INDEX idx_outbox_unpublished ON outbox(published_at, created_at) WHERE published_at IS NULL;
CREATE INDEX idx_outbox_aggregate_id ON outbox(aggregate_id);
CREATE INDEX idx_outbox_aggregate_id_version ON outbox(aggregate_id, version DESC);
CREATE INDEX idx_outbox_event_type ON outbox(event_type);
CREATE INDEX idx_outbox_created_at ON outbox(created_at);

-- 2. Add version column to pins table for optimistic locking
ALTER TABLE pins ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pins_id_version ON pins(id, version);

-- 3. Add version column to forms table for optimistic locking
ALTER TABLE forms ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;
CREATE INDEX IF NOT EXISTS idx_forms_id_version ON forms(id, version);

-- 4. Create function to increment retry count in outbox
CREATE OR REPLACE FUNCTION increment_outbox_retry(
    event_id UUID,
    error_msg TEXT
)
RETURNS VOID AS $$
BEGIN
    UPDATE outbox
    SET retry_count = retry_count + 1,
        error = error_msg
    WHERE id = event_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Create function to clean up old published events
CREATE OR REPLACE FUNCTION cleanup_old_outbox_events(
    days_to_keep INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM outbox
    WHERE published_at IS NOT NULL
        AND published_at < NOW() - (days_to_keep || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 6. Add comments for documentation
COMMENT ON TABLE outbox IS 'Transactional outbox for event sourcing - stores domain events before publishing to Kafka';
COMMENT ON COLUMN outbox.aggregate_id IS 'ID of the aggregate (pin, form, etc.) that generated the event';
COMMENT ON COLUMN outbox.aggregate_type IS 'Type of aggregate: pin, form';
COMMENT ON COLUMN outbox.event_type IS 'Type of domain event: PinCreated, PinUpdated, etc.';
COMMENT ON COLUMN outbox.version IS 'Version number of the aggregate when event was created';
COMMENT ON COLUMN outbox.payload IS 'Full domain event as JSON';
COMMENT ON COLUMN outbox.published_at IS 'Timestamp when event was published to Kafka (NULL = pending)';
COMMENT ON COLUMN outbox.retry_count IS 'Number of times publishing this event has been retried';

COMMENT ON COLUMN pins.version IS 'Version number for optimistic concurrency control';
COMMENT ON COLUMN forms.version IS 'Version number for optimistic concurrency control';
