-- Migration: 801_tax_dashboard_system.sql
-- Phase 8: Tax Dashboard & Reporting System
-- Created: February 18, 2026

BEGIN;

-- ============================================================================
-- 1. DROP EXISTING TABLES (if any from previous attempts)
-- ============================================================================

DROP TABLE IF EXISTS report_schedules CASCADE;
DROP TABLE IF EXISTS dashboard_preferences CASCADE;
DROP TABLE IF EXISTS dashboard_cache CASCADE;

-- ============================================================================
-- 2. CREATE dashboard_preferences TABLE
-- Stores user-specific dashboard widget configurations
-- ============================================================================

CREATE TABLE dashboard_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Widget configuration (stores positions, sizes, enabled widgets)
    widget_config JSONB NOT NULL DEFAULT '{
        "widgets": [
            {"id": "tax_liabilities", "enabled": true, "position": 1, "size": "large"},
            {"id": "upcoming_deadlines", "enabled": true, "position": 2, "size": "medium"},
            {"id": "compliance_score", "enabled": true, "position": 3, "size": "medium"},
            {"id": "recent_returns", "enabled": true, "position": 4, "size": "small"}
        ]
    }'::JSONB,

    -- Default date range for dashboard
    default_date_range VARCHAR(20) DEFAULT 'month' 
        CHECK (default_date_range IN ('week', 'month', 'quarter', 'year', 'custom')),

    -- Refresh interval in minutes (null = manual refresh only)
    auto_refresh_interval INTEGER CHECK (auto_refresh_interval IN (5, 10, 15, 30, 60, null)),

    -- Theme preferences
    color_scheme VARCHAR(20) DEFAULT 'light' 
        CHECK (color_scheme IN ('light', 'dark', 'system')),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),

    -- Each user can have only one preference set per business
    UNIQUE(business_id, user_id)
);

-- ============================================================================
-- 3. CREATE report_schedules TABLE
-- Stores scheduled report generation and distribution
-- ============================================================================

CREATE TABLE report_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),

    -- Report identification
    report_name VARCHAR(50) NOT NULL 
        CHECK (report_name IN (
            'sales_tax_summary',
            'wht_certificate_register', 
            'wht_returns_history',
            'vat_returns_history',
            'tax_credit_report',
            'supplier_compliance',
            'import_duty_register',
            'customer_tax_classification',
            'tax_audit_trail',
            'tax_reconciliation'
        )),

    -- Report parameters (JSON filter criteria)
    report_parameters JSONB DEFAULT '{}'::JSONB,

    -- Schedule configuration
    schedule_type VARCHAR(20) NOT NULL
        CHECK (schedule_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'once')),
    
    -- For weekly: day of week (1-7, Monday=1)
    weekly_day INTEGER CHECK (weekly_day BETWEEN 1 AND 7),
    
    -- For monthly: day of month (1-31)
    monthly_day INTEGER CHECK (monthly_day BETWEEN 1 AND 31),
    
    -- Time of day to run (UTC)
    run_time TIME DEFAULT '08:00:00',

    -- Export formats
    export_formats JSONB NOT NULL DEFAULT '["pdf"]'::JSONB 
        CHECK (export_formats <@ '["pdf", "excel", "csv", "json"]'::JSONB),

    -- Distribution
    recipients JSONB NOT NULL DEFAULT '[]'::JSONB,
    include_attachments BOOLEAN DEFAULT true,

    -- Status tracking
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    last_run_status VARCHAR(20) 
        CHECK (last_run_status IN ('success', 'failed', 'processing', null)),
    last_run_error TEXT,
    next_run_at TIMESTAMPTZ,
    total_runs INTEGER DEFAULT 0,
    successful_runs INTEGER DEFAULT 0,

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure schedule parameters are valid
    CONSTRAINT valid_schedule_params CHECK (
        (schedule_type = 'weekly' AND weekly_day IS NOT NULL) OR
        (schedule_type = 'monthly' AND monthly_day IS NOT NULL) OR
        (schedule_type IN ('daily', 'quarterly', 'once'))
    )
);

-- ============================================================================
-- 4. CREATE dashboard_cache TABLE (OPTIONAL - for performance)
-- Stores pre-calculated dashboard data to improve load times
-- ============================================================================

CREATE TABLE dashboard_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    -- Cache key (e.g., 'summary', 'liabilities', 'deadlines')
    cache_key VARCHAR(50) NOT NULL,
    
    -- Cache data
    cache_data JSONB NOT NULL,
    
    -- Period the cache represents
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Cache metadata
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    generation_time_ms INTEGER, -- How long it took to generate

    -- Each business can have only one cache entry per key per period
    UNIQUE(business_id, cache_key, period_start, period_end)
);

-- ============================================================================
-- 5. CREATE REPORT LOGS TABLE (for tracking report generation)
-- ============================================================================

CREATE TABLE report_generation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    schedule_id UUID REFERENCES report_schedules(id) ON DELETE SET NULL,

    -- Report details
    report_name VARCHAR(50) NOT NULL,
    report_parameters JSONB NOT NULL,
    export_format VARCHAR(10) NOT NULL,

    -- Generation details
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    generated_by UUID REFERENCES users(id),
    generation_time_ms INTEGER,
    file_size_bytes INTEGER,
    file_url VARCHAR(500),

    -- Status
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
    error_message TEXT,

    -- Distribution
    recipients TEXT[],
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMPTZ
);

-- ============================================================================
-- 6. CREATE INDEXES
-- ============================================================================

-- Dashboard preferences indexes
CREATE INDEX idx_dashboard_preferences_business ON dashboard_preferences(business_id);
CREATE INDEX idx_dashboard_preferences_user ON dashboard_preferences(user_id);

-- Report schedules indexes
CREATE INDEX idx_report_schedules_business ON report_schedules(business_id);
CREATE INDEX idx_report_schedules_next_run ON report_schedules(next_run_at) WHERE is_active = true;
CREATE INDEX idx_report_schedules_report_name ON report_schedules(report_name);
CREATE INDEX idx_report_schedules_schedule_type ON report_schedules(schedule_type);

-- Dashboard cache indexes
CREATE INDEX idx_dashboard_cache_business ON dashboard_cache(business_id);
CREATE INDEX idx_dashboard_cache_key ON dashboard_cache(cache_key);
CREATE INDEX idx_dashboard_cache_expires ON dashboard_cache(expires_at);
CREATE INDEX idx_dashboard_cache_period ON dashboard_cache(business_id, cache_key, period_start, period_end);

-- Report logs indexes
CREATE INDEX idx_report_logs_business ON report_generation_logs(business_id);
CREATE INDEX idx_report_logs_schedule ON report_generation_logs(schedule_id);
CREATE INDEX idx_report_logs_generated_at ON report_generation_logs(generated_at);

-- ============================================================================
-- 7. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE dashboard_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_generation_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for dashboard_preferences
CREATE POLICY dashboard_preferences_isolation ON dashboard_preferences
    USING (business_id = current_setting('app.current_business_id')::UUID);

-- RLS Policies for report_schedules
CREATE POLICY report_schedules_isolation ON report_schedules
    USING (business_id = current_setting('app.current_business_id')::UUID);

-- RLS Policies for dashboard_cache
CREATE POLICY dashboard_cache_isolation ON dashboard_cache
    USING (business_id = current_setting('app.current_business_id')::UUID);

-- RLS Policies for report_generation_logs
CREATE POLICY report_logs_isolation ON report_generation_logs
    USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- 8. CREATE FUNCTIONS
-- ============================================================================

-- Function to calculate next run date for a schedule
CREATE OR REPLACE FUNCTION calculate_next_run_date(
    p_schedule_type VARCHAR,
    p_run_time TIME,
    p_weekly_day INTEGER,
    p_monthly_day INTEGER,
    p_from_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    v_next_date DATE;
    v_result TIMESTAMPTZ;
BEGIN
    CASE p_schedule_type
        WHEN 'daily' THEN
            v_next_date := (p_from_date + INTERVAL '1 day')::DATE;
        
        WHEN 'weekly' THEN
            -- Find next occurrence of specified day of week
            v_next_date := (
                p_from_date::DATE + 
                ((p_weekly_day - EXTRACT(DOW FROM p_from_date) + 7) % 7)::INTEGER * INTERVAL '1 day'
            )::DATE;
            IF v_next_date <= p_from_date::DATE THEN
                v_next_date := v_next_date + INTERVAL '7 days';
            END IF;
        
        WHEN 'monthly' THEN
            -- Handle month boundaries correctly
            v_next_date := DATE_TRUNC('month', p_from_date) + (p_monthly_day - 1) * INTERVAL '1 day';
            IF v_next_date <= p_from_date::DATE THEN
                v_next_date := (DATE_TRUNC('month', p_from_date) + INTERVAL '1 month') + (p_monthly_day - 1) * INTERVAL '1 day';
            END IF;
        
        WHEN 'quarterly' THEN
            -- Next quarter start
            v_next_date := DATE_TRUNC('quarter', p_from_date) + INTERVAL '3 months';
            IF v_next_date <= p_from_date::DATE THEN
                v_next_date := v_next_date + INTERVAL '3 months';
            END IF;
        
        WHEN 'once' THEN
            RETURN NULL; -- No next run for one-time schedules
    END CASE;

    -- Combine date with run time
    v_result := v_next_date + p_run_time;
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to update next_run_at when schedule changes
CREATE OR REPLACE FUNCTION update_schedule_next_run()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active AND NEW.schedule_type != 'once' THEN
        NEW.next_run_at := calculate_next_run_date(
            NEW.schedule_type,
            NEW.run_time,
            NEW.weekly_day,
            NEW.monthly_day,
            NOW()
        );
    ELSE
        NEW.next_run_at := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. CREATE TRIGGERS
-- ============================================================================

-- Update triggers for timestamps
CREATE TRIGGER update_dashboard_preferences_updated_at
    BEFORE UPDATE ON dashboard_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_report_schedules_updated_at
    BEFORE UPDATE ON report_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to automatically calculate next_run_at
CREATE TRIGGER set_schedule_next_run
    BEFORE INSERT OR UPDATE OF is_active, schedule_type, run_time, weekly_day, monthly_day
    ON report_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_schedule_next_run();

-- ============================================================================
-- 10. INSERT DEFAULT PREFERENCES FOR EXISTING USERS
-- ============================================================================

-- Create default dashboard preferences for all existing users
INSERT INTO dashboard_preferences (business_id, user_id, created_by)
SELECT DISTINCT 
    u.business_id,
    u.id as user_id,
    u.id as created_by
FROM users u
WHERE u.business_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM dashboard_preferences dp 
    WHERE dp.business_id = u.business_id AND dp.user_id = u.id
);

-- ============================================================================
-- 11. VERIFICATION
-- ============================================================================

-- Count tables created
SELECT 'dashboard_preferences' as table_name, COUNT(*) as row_count FROM dashboard_preferences
UNION ALL
SELECT 'report_schedules', COUNT(*) FROM report_schedules
UNION ALL
SELECT 'dashboard_cache', COUNT(*) FROM dashboard_cache
UNION ALL
SELECT 'report_generation_logs', COUNT(*) FROM report_generation_logs;

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('dashboard_preferences', 'report_schedules', 'dashboard_cache', 'report_generation_logs');

COMMIT;
