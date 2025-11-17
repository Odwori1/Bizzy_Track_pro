-- Migration: 014_week13_mobile_pwa.sql
-- Description: Mobile PWA & Offline Capability System

BEGIN;

-- =============================================================================
-- MOBILE DEVICE MANAGEMENT TABLES
-- =============================================================================

-- Enhanced Mobile Device Registration (extends existing mobile_devices table)
ALTER TABLE mobile_devices ADD COLUMN IF NOT EXISTS push_token VARCHAR(500);
ALTER TABLE mobile_devices ADD COLUMN IF NOT EXISTS os_version VARCHAR(50);
ALTER TABLE mobile_devices ADD COLUMN IF NOT EXISTS screen_resolution VARCHAR(50);
ALTER TABLE mobile_devices ADD COLUMN IF NOT EXISTS battery_optimization BOOLEAN DEFAULT false;
ALTER TABLE mobile_devices ADD COLUMN IF NOT EXISTS storage_usage_mb INTEGER DEFAULT 0;

-- Mobile App Settings
CREATE TABLE mobile_app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'light', -- light, dark, auto
    language VARCHAR(10) DEFAULT 'en',
    offline_mode_enabled BOOLEAN DEFAULT true,
    auto_sync_enabled BOOLEAN DEFAULT true,
    sync_frequency_minutes INTEGER DEFAULT 15,
    gps_tracking_enabled BOOLEAN DEFAULT true,
    camera_upload_quality VARCHAR(20) DEFAULT 'medium', -- low, medium, high
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, staff_profile_id)
);

-- =============================================================================
-- OFFLINE SYNC ENHANCEMENTS
-- =============================================================================

-- Offline Sync Batches (for better sync management)
CREATE TABLE offline_sync_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    batch_number INTEGER NOT NULL,
    total_records INTEGER NOT NULL,
    synced_records INTEGER DEFAULT 0,
    sync_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sync_completed_at TIMESTAMPTZ,
    sync_status VARCHAR(50) NOT NULL DEFAULT 'in_progress', -- in_progress, completed, failed
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Offline Data Cache (for frequently accessed data)
CREATE TABLE offline_data_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    cache_key VARCHAR(500) NOT NULL,
    data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    last_accessed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, staff_profile_id, cache_key)
);

-- =============================================================================
-- CAMERA & MEDIA INTEGRATION
-- =============================================================================

-- Mobile Media Attachments
CREATE TABLE mobile_media_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    field_job_assignment_id UUID REFERENCES field_job_assignments(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES equipment_assets(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    media_type VARCHAR(50) NOT NULL, -- photo, video, document, signature
    thumbnail_path VARCHAR(500),
    gps_latitude DECIMAL(10, 8),
    gps_longitude DECIMAL(11, 8),
    taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_id VARCHAR(255),
    description TEXT,
    is_uploaded BOOLEAN DEFAULT false,
    upload_attempts INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Camera Templates (for standardized photo capture)
CREATE TABLE camera_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_type VARCHAR(50) NOT NULL, -- equipment_check, proof_of_work, damage_report
    required_photos JSONB NOT NULL, -- Array of required photo types
    quality_requirements JSONB, -- Resolution, format requirements
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- PUSH NOTIFICATIONS
-- =============================================================================

-- Push Notification Queue
CREATE TABLE push_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(100) NOT NULL, -- job_assigned, job_reminder, sync_complete, system_alert
    target_audience JSONB NOT NULL, -- {staff_ids: [], roles: [], departments: []}
    data JSONB, -- Additional data for deep linking
    scheduled_for TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivery_status VARCHAR(50) DEFAULT 'pending', -- pending, sent, delivered, failed
    failure_reason TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification Preferences
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    job_assignments BOOLEAN DEFAULT true,
    job_reminders BOOLEAN DEFAULT true,
    sync_notifications BOOLEAN DEFAULT true,
    system_alerts BOOLEAN DEFAULT true,
    marketing BOOLEAN DEFAULT false,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, staff_profile_id)
);

-- =============================================================================
-- MOBILE PERFORMANCE METRICS
-- =============================================================================

-- Mobile App Performance Logs
CREATE TABLE mobile_performance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    app_version VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL, -- app_launch, sync_complete, crash, performance
    event_data JSONB NOT NULL,
    performance_metrics JSONB, -- {load_time: 1200, memory_usage: 150}
    network_type VARCHAR(50), -- wifi, cellular, offline
    battery_level INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- SERVICE WORKER & PWA CONFIGURATION
-- =============================================================================

-- PWA Configuration
CREATE TABLE pwa_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    app_name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50) NOT NULL,
    theme_color VARCHAR(7) DEFAULT '#2563eb',
    background_color VARCHAR(7) DEFAULT '#ffffff',
    display_type VARCHAR(50) DEFAULT 'standalone', -- standalone, minimal-ui, browser
    orientation VARCHAR(50) DEFAULT 'portrait', -- portrait, landscape, any
    offline_page_enabled BOOLEAN DEFAULT true,
    cache_strategy VARCHAR(50) DEFAULT 'network-first', -- network-first, cache-first, stale-while-revalidate
    precache_urls JSONB DEFAULT '[]', -- URLs to precache
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Mobile App Settings
CREATE INDEX idx_mobile_app_settings_business_id ON mobile_app_settings(business_id);
CREATE INDEX idx_mobile_app_settings_staff_id ON mobile_app_settings(staff_profile_id);

-- Offline Sync
CREATE INDEX idx_offline_sync_batches_business_id ON offline_sync_batches(business_id);
CREATE INDEX idx_offline_sync_batches_device_id ON offline_sync_batches(device_id);
CREATE INDEX idx_offline_sync_batches_status ON offline_sync_batches(sync_status);

-- Offline Cache
CREATE INDEX idx_offline_cache_business_id ON offline_data_cache(business_id);
CREATE INDEX idx_offline_cache_staff_id ON offline_data_cache(staff_profile_id);
CREATE INDEX idx_offline_cache_expires ON offline_data_cache(expires_at);

-- Media Attachments
CREATE INDEX idx_mobile_media_business_id ON mobile_media_attachments(business_id);
CREATE INDEX idx_mobile_media_staff_id ON mobile_media_attachments(staff_profile_id);
CREATE INDEX idx_mobile_media_job_id ON mobile_media_attachments(field_job_assignment_id);
CREATE INDEX idx_mobile_media_uploaded ON mobile_media_attachments(is_uploaded) WHERE is_uploaded = false;

-- Camera Templates
CREATE INDEX idx_camera_templates_business_id ON camera_templates(business_id);
CREATE INDEX idx_camera_templates_active ON camera_templates(is_active) WHERE is_active = true;

-- Push Notifications
CREATE INDEX idx_push_notifications_business_id ON push_notifications(business_id);
CREATE INDEX idx_push_notifications_status ON push_notifications(delivery_status);
CREATE INDEX idx_push_notifications_scheduled ON push_notifications(scheduled_for) WHERE scheduled_for IS NOT NULL;

-- Performance Logs
CREATE INDEX idx_mobile_performance_business_id ON mobile_performance_logs(business_id);
CREATE INDEX idx_mobile_performance_device_id ON mobile_performance_logs(device_id);
CREATE INDEX idx_mobile_performance_created_at ON mobile_media_attachments(created_at);

-- =============================================================================
-- ROW LEVEL SECURITY ENABLEMENT
-- =============================================================================

-- Enable RLS on all new tables
ALTER TABLE mobile_app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_sync_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_data_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_media_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_performance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pwa_configurations ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for all new tables
CREATE POLICY business_isolation_mobile_app_settings ON mobile_app_settings
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_offline_sync_batches ON offline_sync_batches
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_offline_data_cache ON offline_data_cache
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_mobile_media_attachments ON mobile_media_attachments
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_camera_templates ON camera_templates
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_push_notifications ON push_notifications
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_notification_preferences ON notification_preferences
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_mobile_performance_logs ON mobile_performance_logs
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_pwa_configurations ON pwa_configurations
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- =============================================================================
-- WEEK 13 PERMISSIONS
-- =============================================================================

-- Add Mobile & PWA permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- Mobile App Permissions
(NULL, 'mobile:access', 'mobile', 'Access mobile app features', 'mobile', 'access', true),
(NULL, 'mobile:offline', 'mobile', 'Use offline capabilities', 'mobile', 'offline', true),
(NULL, 'mobile:camera', 'mobile', 'Use camera features', 'mobile', 'camera', true),
(NULL, 'mobile:location', 'mobile', 'Access location services', 'mobile', 'location', true),

-- Push Notification Permissions
(NULL, 'notifications:send', 'notifications', 'Send push notifications', 'notifications', 'send', true),
(NULL, 'notifications:receive', 'notifications', 'Receive push notifications', 'notifications', 'receive', true),

-- PWA Configuration Permissions
(NULL, 'pwa:configure', 'pwa', 'Configure PWA settings', 'pwa', 'configure', true),
(NULL, 'pwa:deploy', 'pwa', 'Deploy PWA updates', 'pwa', 'deploy', true);

-- =============================================================================
-- UPDATE TRIGGERS
-- =============================================================================

CREATE TRIGGER update_mobile_app_settings_updated_at
    BEFORE UPDATE ON mobile_app_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_camera_templates_updated_at
    BEFORE UPDATE ON camera_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pwa_configurations_updated_at
    BEFORE UPDATE ON pwa_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
