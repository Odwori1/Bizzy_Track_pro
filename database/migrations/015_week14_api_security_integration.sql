-- Migration: 015_week14_api_security_integration.sql
-- Description: API Security & Integration System

BEGIN;

-- =============================================================================
-- API KEY MANAGEMENT TABLES
-- =============================================================================

-- API Keys with permission scoping
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    api_key VARCHAR(100) NOT NULL UNIQUE,
    api_secret_hash VARCHAR(255) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]', -- Specific permissions granted to this API key
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
    allowed_ips CIDR[], -- IP whitelist for this API key
    allowed_origins TEXT[], -- CORS origins
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API Key Usage Logs
CREATE TABLE api_key_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint VARCHAR(500) NOT NULL,
    method VARCHAR(10) NOT NULL,
    request_headers JSONB,
    response_status INTEGER NOT NULL,
    response_size INTEGER,
    processing_time_ms INTEGER,
    ip_address INET NOT NULL,
    user_agent TEXT,
    request_body_hash VARCHAR(64), -- SHA-256 hash of request body for audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- WEBHOOK SECURITY TABLES
-- =============================================================================

-- Webhook Endpoints
CREATE TABLE webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    url VARCHAR(500) NOT NULL,
    secret_token VARCHAR(100) NOT NULL, -- For signature verification
    events JSONB NOT NULL, -- Events this webhook subscribes to
    content_type VARCHAR(50) NOT NULL DEFAULT 'application/json',
    retry_config JSONB NOT NULL DEFAULT '{"max_attempts": 3, "backoff_multiplier": 2}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook Delivery Logs
CREATE TABLE webhook_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    webhook_endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    response_status INTEGER,
    response_body TEXT,
    error_message TEXT,
    delivered_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook Signatures (for incoming webhook verification)
CREATE TABLE webhook_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    provider_name VARCHAR(100) NOT NULL, -- stripe, twilio, etc.
    secret_key VARCHAR(255) NOT NULL,
    signature_algorithm VARCHAR(50) NOT NULL DEFAULT 'sha256',
    verification_rules JSONB, -- Custom verification rules per provider
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, provider_name)
);

-- =============================================================================
-- EXTERNAL INTEGRATION TABLES
-- =============================================================================

-- External Service Integrations
CREATE TABLE external_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    service_name VARCHAR(100) NOT NULL, -- payment_gateway, sms_provider, email_service
    provider VARCHAR(100) NOT NULL, -- stripe, twilio, sendgrid
    config JSONB NOT NULL, -- API keys, endpoints, settings
    permissions JSONB NOT NULL DEFAULT '[]', -- What this integration can access
    rate_limits JSONB, -- Provider-specific rate limits
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, service_name, provider)
);

-- Integration Audit Logs
CREATE TABLE integration_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    integration_id UUID NOT NULL REFERENCES external_integrations(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL, -- api_call, webhook_received, sync_completed
    resource_type VARCHAR(100),
    resource_id UUID,
    request_data JSONB,
    response_data JSONB,
    error_message TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- API SECURITY CONFIGURATION
-- =============================================================================

-- API Security Policies
CREATE TABLE api_security_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    policy_type VARCHAR(50) NOT NULL, -- rate_limiting, ip_restriction, permission_scope
    rules JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    applies_to VARCHAR(50) NOT NULL DEFAULT 'all', -- all, specific_keys, specific_integrations
    target_ids UUID[], -- Specific API keys or integrations this applies to
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- API Keys
CREATE INDEX idx_api_keys_business_id ON api_keys(business_id);
CREATE INDEX idx_api_keys_api_key ON api_keys(api_key);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;
CREATE INDEX idx_api_keys_expires ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

-- API Key Usage
CREATE INDEX idx_api_key_usage_business_id ON api_key_usage_logs(business_id);
CREATE INDEX idx_api_key_usage_api_key_id ON api_key_usage_logs(api_key_id);
CREATE INDEX idx_api_key_usage_created_at ON api_key_usage_logs(created_at);
CREATE INDEX idx_api_key_usage_endpoint ON api_key_usage_logs(endpoint);

-- Webhooks
CREATE INDEX idx_webhook_endpoints_business_id ON webhook_endpoints(business_id);
CREATE INDEX idx_webhook_endpoints_active ON webhook_endpoints(is_active) WHERE is_active = true;

-- Webhook Deliveries
CREATE INDEX idx_webhook_delivery_business_id ON webhook_delivery_logs(business_id);
CREATE INDEX idx_webhook_delivery_endpoint_id ON webhook_delivery_logs(webhook_endpoint_id);
CREATE INDEX idx_webhook_delivery_created_at ON webhook_delivery_logs(created_at);
CREATE INDEX idx_webhook_delivery_event_type ON webhook_delivery_logs(event_type);

-- External Integrations
CREATE INDEX idx_external_integrations_business_id ON external_integrations(business_id);
CREATE INDEX idx_external_integrations_service ON external_integrations(service_name);
CREATE INDEX idx_external_integrations_active ON external_integrations(is_active) WHERE is_active = true;

-- Integration Audit
CREATE INDEX idx_integration_audit_business_id ON integration_audit_logs(business_id);
CREATE INDEX idx_integration_audit_integration_id ON integration_audit_logs(integration_id);
CREATE INDEX idx_integration_audit_created_at ON integration_audit_logs(created_at);

-- Security Policies
CREATE INDEX idx_api_security_policies_business_id ON api_security_policies(business_id);
CREATE INDEX idx_api_security_policies_active ON api_security_policies(is_active) WHERE is_active = true;

-- =============================================================================
-- ROW LEVEL SECURITY ENABLEMENT
-- =============================================================================

-- Enable RLS on all new tables
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_security_policies ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for all new tables
CREATE POLICY business_isolation_api_keys ON api_keys
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_api_key_usage_logs ON api_key_usage_logs
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_webhook_endpoints ON webhook_endpoints
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_webhook_delivery_logs ON webhook_delivery_logs
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_webhook_signatures ON webhook_signatures
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_external_integrations ON external_integrations
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_integration_audit_logs ON integration_audit_logs
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_api_security_policies ON api_security_policies
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- =============================================================================
-- WEEK 14 PERMISSIONS
-- =============================================================================

-- Add API Security & Integration permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- API Key Management
(NULL, 'api_keys:manage', 'api_security', 'Manage API keys', 'api_keys', 'manage', true),
(NULL, 'api_keys:view', 'api_security', 'View API keys', 'api_keys', 'view', true),
(NULL, 'api_keys:rotate', 'api_security', 'Rotate API keys', 'api_keys', 'rotate', true),

-- Webhook Management
(NULL, 'webhooks:manage', 'api_security', 'Manage webhook endpoints', 'webhooks', 'manage', true),
(NULL, 'webhooks:view', 'api_security', 'View webhook endpoints', 'webhooks', 'view', true),
(NULL, 'webhooks:verify', 'api_security', 'Verify webhook signatures', 'webhooks', 'verify', true),

-- External Integrations
(NULL, 'integrations:manage', 'api_security', 'Manage external integrations', 'integrations', 'manage', true),
(NULL, 'integrations:view', 'api_security', 'View external integrations', 'integrations', 'view', true),
(NULL, 'integrations:sync', 'api_security', 'Sync external integrations', 'integrations', 'sync', true),

-- API Security Policies
(NULL, 'api_security:manage', 'api_security', 'Manage API security policies', 'api_security', 'manage', true),
(NULL, 'api_security:view', 'api_security', 'View API security policies', 'api_security', 'view', true),

-- API Usage Analytics
(NULL, 'api_analytics:view', 'api_security', 'View API usage analytics', 'api_analytics', 'view', true);

-- =============================================================================
-- UPDATE TRIGGERS
-- =============================================================================

CREATE TRIGGER update_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_endpoints_updated_at
    BEFORE UPDATE ON webhook_endpoints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_signatures_updated_at
    BEFORE UPDATE ON webhook_signatures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_external_integrations_updated_at
    BEFORE UPDATE ON external_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_security_policies_updated_at
    BEFORE UPDATE ON api_security_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
