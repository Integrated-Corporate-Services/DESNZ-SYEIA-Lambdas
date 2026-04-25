-- ===================================================================
-- Integration Testing Database Schema
-- ===================================================================
-- Creates tables for both inbound-event-receiver and payment-processor-webhook
-- 
-- Usage: Automatically runs when PostgreSQL container starts
-- ===================================================================

-- Set timezone
SET timezone = 'UTC';

-- ===================================================================
-- INBOUND EVENT RECEIVER TABLES
-- ===================================================================

-- Payment webhooks table (stores incoming webhooks before SQS)
CREATE TABLE IF NOT EXISTS payment_webhooks (
    id SERIAL PRIMARY KEY,
    webhook_id VARCHAR(255) NOT NULL UNIQUE,
    govuk_pay_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    webhook_data JSONB NOT NULL,
    signature VARCHAR(512),
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for payment_webhooks
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_govuk_pay_id ON payment_webhooks(govuk_pay_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_event_type ON payment_webhooks(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_status ON payment_webhooks(status);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_received_at ON payment_webhooks(received_at);

-- ===================================================================
-- PAYMENT PROCESSOR WEBHOOK TABLES
-- ===================================================================

-- Payments table (main payment records)
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    govuk_pay_id VARCHAR(255) NOT NULL UNIQUE,
    reference VARCHAR(255),
    amount BIGINT,
    status VARCHAR(50),
    description TEXT,
    event_history JSONB DEFAULT '[]'::jsonb,
    event_count INTEGER DEFAULT 0,
    last_event_type VARCHAR(100),
    last_event_timestamp TIMESTAMP WITH TIME ZONE,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    captured_at TIMESTAMP WITH TIME ZONE,
    settled_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    expired_at TIMESTAMP WITH TIME ZONE,
    refunded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_govuk_pay_id ON payments(govuk_pay_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);

-- Payment events table (idempotency and event tracking)
CREATE TABLE IF NOT EXISTS payment_events (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL UNIQUE,
    govuk_pay_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for payment_events
CREATE INDEX IF NOT EXISTS idx_payment_events_govuk_pay_id ON payment_events(govuk_pay_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_event_type ON payment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_events_processed ON payment_events(processed);
CREATE INDEX IF NOT EXISTS idx_payment_events_event_timestamp ON payment_events(event_timestamp);

-- Outbox table (downstream system integration)
CREATE TABLE IF NOT EXISTS outbox (
    id SERIAL PRIMARY KEY,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    status VARCHAR(50) DEFAULT 'pending'
);

-- Indexes for outbox
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);
CREATE INDEX IF NOT EXISTS idx_outbox_created_at ON outbox(created_at);

-- ===================================================================
-- HELPER FUNCTIONS
-- ===================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_payment_webhooks_updated_at ON payment_webhooks;
CREATE TRIGGER update_payment_webhooks_updated_at
    BEFORE UPDATE ON payment_webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ===================================================================
-- GRANT PERMISSIONS
-- ===================================================================

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO integration_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO integration_user;

-- ===================================================================
-- SEED DATA (Optional)
-- ===================================================================

-- Insert test payment (optional)
INSERT INTO payments (govuk_pay_id, reference, amount, status, description)
VALUES ('pay_test_existing_123', 'TEST-REF-001', 5000, 'created', 'Test payment for integration tests')
ON CONFLICT (govuk_pay_id) DO NOTHING;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Database schema initialized successfully!';
    RAISE NOTICE '   - payment_webhooks table created';
    RAISE NOTICE '   - payments table created';
    RAISE NOTICE '   - payment_events table created';
    RAISE NOTICE '   - outbox table created';
END $$;
