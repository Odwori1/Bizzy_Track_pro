-- Migration: 013_week12_advanced_analytics.sql
-- Description: Advanced Analytics & Reporting System

BEGIN;

-- =============================================================================
-- ANALYTICS & REPORTING CONFIGURATION TABLES
-- =============================================================================

-- Analytics Dashboard Configuration
CREATE TABLE analytics_dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    layout_config JSONB NOT NULL DEFAULT '{}',
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, name)
);

-- Customer Segmentation Definitions
CREATE TABLE customer_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    segment_criteria JSONB NOT NULL, -- Rules for segment membership
    segment_type VARCHAR(50) NOT NULL, -- behavioral, demographic, value_based
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cohort Analysis Definitions
CREATE TABLE cohort_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cohort_type VARCHAR(50) NOT NULL, -- time-based, event-based
    period_type VARCHAR(20) NOT NULL, -- daily, weekly, monthly
    metric_type VARCHAR(50) NOT NULL, -- retention, revenue, conversion
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scheduled Report Configurations
CREATE TABLE scheduled_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    report_type VARCHAR(100) NOT NULL, -- financial, operational, customer, staff
    frequency VARCHAR(50) NOT NULL, -- daily, weekly, monthly, quarterly
    config JSONB NOT NULL, -- Report configuration and filters
    recipients JSONB NOT NULL, -- Array of email recipients
    export_format VARCHAR(20) NOT NULL DEFAULT 'pdf', -- pdf, excel, csv
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Export Job Queue
CREATE TABLE export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES users(id),
    export_type VARCHAR(100) NOT NULL, -- customers, jobs, invoices, financials
    filters JSONB NOT NULL DEFAULT '{}',
    format VARCHAR(20) NOT NULL DEFAULT 'csv', -- csv, excel, pdf
    file_path VARCHAR(500),
    file_size INTEGER,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- BEHAVIORAL ANALYTICS TABLES
-- =============================================================================

-- Customer Behavior Events
CREATE TABLE customer_behavior_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL, -- purchase, service_usage, payment, complaint
    event_data JSONB NOT NULL,
    revenue_impact DECIMAL(12,2) DEFAULT 0,
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customer Lifetime Value Calculations
CREATE TABLE customer_lifetime_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    calculation_date DATE NOT NULL,
    total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_orders INTEGER NOT NULL DEFAULT 0,
    avg_order_value DECIMAL(10,2) NOT NULL DEFAULT 0,
    purchase_frequency DECIMAL(5,2) NOT NULL DEFAULT 0,
    customer_lifespan_days INTEGER NOT NULL DEFAULT 0,
    predicted_ltv DECIMAL(12,2) NOT NULL DEFAULT 0,
    segment VARCHAR(50), -- high_value, medium_value, low_value
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, customer_id, calculation_date)
);

-- Churn Prediction Models
CREATE TABLE churn_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    prediction_date DATE NOT NULL,
    churn_probability DECIMAL(5,4) NOT NULL, -- 0.0000 to 1.0000
    churn_risk_level VARCHAR(20) NOT NULL, -- low, medium, high, critical
    key_factors JSONB NOT NULL, -- Factors contributing to churn risk
    last_activity_date DATE,
    days_since_last_activity INTEGER,
    predicted_churn_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, customer_id, prediction_date)
);

-- A/B Testing Configurations
CREATE TABLE ab_testing_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    test_type VARCHAR(100) NOT NULL, -- pricing, promotion, messaging
    variants JSONB NOT NULL, -- Test variants configuration
    target_audience JSONB, -- Audience targeting rules
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, active, paused, completed
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ENHANCED DASHBOARD METRICS TABLES
-- =============================================================================

-- Real-time Business Metrics
CREATE TABLE real_time_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    metric_type VARCHAR(100) NOT NULL, -- revenue, expenses, jobs, customers
    metric_value DECIMAL(15,2) NOT NULL,
    comparison_value DECIMAL(15,2), -- Previous period value
    growth_percentage DECIMAL(8,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, metric_date, metric_type)
);

-- Staff Performance Analytics
CREATE TABLE staff_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    jobs_completed INTEGER NOT NULL DEFAULT 0,
    jobs_assigned INTEGER NOT NULL DEFAULT 0,
    total_hours_worked DECIMAL(5,2) NOT NULL DEFAULT 0,
    overtime_hours DECIMAL(5,2) NOT NULL DEFAULT 0,
    customer_rating_avg DECIMAL(3,2),
    efficiency_score DECIMAL(5,2), -- Performance score 0-100
    revenue_generated DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, staff_profile_id, metric_date)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Analytics Dashboards
CREATE INDEX idx_analytics_dashboards_business_id ON analytics_dashboards(business_id);
CREATE INDEX idx_analytics_dashboards_default ON analytics_dashboards(is_default) WHERE is_default = true;

-- Customer Segments
CREATE INDEX idx_customer_segments_business_id ON customer_segments(business_id);
CREATE INDEX idx_customer_segments_active ON customer_segments(is_active) WHERE is_active = true;

-- Cohort Analyses
CREATE INDEX idx_cohort_analyses_business_id ON cohort_analyses(business_id);

-- Scheduled Reports
CREATE INDEX idx_scheduled_reports_business_id ON scheduled_reports(business_id);
CREATE INDEX idx_scheduled_reports_active ON scheduled_reports(is_active) WHERE is_active = true;
CREATE INDEX idx_scheduled_reports_next_run ON scheduled_reports(next_run_at) WHERE is_active = true;

-- Export Jobs
CREATE INDEX idx_export_jobs_business_id ON export_jobs(business_id);
CREATE INDEX idx_export_jobs_status ON export_jobs(status);
CREATE INDEX idx_export_jobs_created_at ON export_jobs(created_at);

-- Behavioral Analytics
CREATE INDEX idx_customer_behavior_business_id ON customer_behavior_events(business_id);
CREATE INDEX idx_customer_behavior_customer_id ON customer_behavior_events(customer_id);
CREATE INDEX idx_customer_behavior_event_type ON customer_behavior_events(event_type);
CREATE INDEX idx_customer_behavior_created_at ON customer_behavior_events(created_at);

-- Customer LTV
CREATE INDEX idx_customer_ltv_business_id ON customer_lifetime_values(business_id);
CREATE INDEX idx_customer_ltv_customer_id ON customer_lifetime_values(customer_id);
CREATE INDEX idx_customer_ltv_calculation_date ON customer_lifetime_values(calculation_date);

-- Churn Predictions
CREATE INDEX idx_churn_predictions_business_id ON churn_predictions(business_id);
CREATE INDEX idx_churn_predictions_customer_id ON churn_predictions(customer_id);
CREATE INDEX idx_churn_predictions_risk_level ON churn_predictions(churn_risk_level);

-- A/B Testing
CREATE INDEX idx_ab_testing_business_id ON ab_testing_experiments(business_id);
CREATE INDEX idx_ab_testing_status ON ab_testing_experiments(status);

-- Real-time Metrics
CREATE INDEX idx_real_time_metrics_business_id ON real_time_metrics(business_id);
CREATE INDEX idx_real_time_metrics_date_type ON real_time_metrics(metric_date, metric_type);

-- Staff Performance
CREATE INDEX idx_staff_performance_business_id ON staff_performance_metrics(business_id);
CREATE INDEX idx_staff_performance_staff_id ON staff_performance_metrics(staff_profile_id);
CREATE INDEX idx_staff_performance_date ON staff_performance_metrics(metric_date);

-- =============================================================================
-- ROW LEVEL SECURITY ENABLEMENT
-- =============================================================================

-- Enable RLS on all new tables
ALTER TABLE analytics_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_behavior_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_lifetime_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE churn_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_testing_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE real_time_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_performance_metrics ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for all new tables
CREATE POLICY business_isolation_analytics_dashboards ON analytics_dashboards
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_customer_segments ON customer_segments
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_cohort_analyses ON cohort_analyses
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_scheduled_reports ON scheduled_reports
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_export_jobs ON export_jobs
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_customer_behavior_events ON customer_behavior_events
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_customer_lifetime_values ON customer_lifetime_values
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_churn_predictions ON churn_predictions
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_ab_testing_experiments ON ab_testing_experiments
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_real_time_metrics ON real_time_metrics
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_staff_performance_metrics ON staff_performance_metrics
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- =============================================================================
-- WEEK 12 PERMISSIONS (Added directly to migration following pattern)
-- =============================================================================

-- Add Analytics & Reporting permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- Analytics Permissions
(NULL, 'analytics:view', 'analytics', 'View analytics dashboards', 'analytics', 'view', true),
(NULL, 'analytics:export', 'analytics', 'Export analytics data', 'analytics', 'export', true),
(NULL, 'analytics:configure', 'analytics', 'Configure analytics dashboards', 'analytics', 'configure', true),

-- Reporting Permissions
(NULL, 'reports:generate', 'reports', 'Generate reports', 'reports', 'generate', true),
(NULL, 'reports:schedule', 'reports', 'Schedule automated reports', 'reports', 'schedule', true),
(NULL, 'reports:export', 'reports', 'Export reports', 'reports', 'export', true),

-- Behavioral Analytics Permissions
(NULL, 'behavioral_analytics:view', 'behavioral_analytics', 'View behavioral analytics', 'behavioral_analytics', 'view', true),
(NULL, 'behavioral_analytics:manage', 'behavioral_analytics', 'Manage behavioral analytics', 'behavioral_analytics', 'manage', true),

-- Data Export Permissions
(NULL, 'data_export:csv', 'data_export', 'Export data as CSV', 'data_export', 'csv', true),
(NULL, 'data_export:excel', 'data_export', 'Export data as Excel', 'data_export', 'excel', true),
(NULL, 'data_export:api', 'data_export', 'Access data via API', 'data_export', 'api', true);

-- =============================================================================
-- UPDATE TRIGGERS
-- =============================================================================

CREATE TRIGGER update_analytics_dashboards_updated_at
    BEFORE UPDATE ON analytics_dashboards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_segments_updated_at
    BEFORE UPDATE ON customer_segments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cohort_analyses_updated_at
    BEFORE UPDATE ON cohort_analyses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheduled_reports_updated_at
    BEFORE UPDATE ON scheduled_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_export_jobs_updated_at
    BEFORE UPDATE ON export_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ab_testing_experiments_updated_at
    BEFORE UPDATE ON ab_testing_experiments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
