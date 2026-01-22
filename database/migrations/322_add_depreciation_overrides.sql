-- Migration: Add depreciation_overrides table for correcting posted depreciation
-- File: 502_add_depreciation_overrides.sql

CREATE TABLE IF NOT EXISTS depreciation_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id),
    period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
    period_year INTEGER NOT NULL CHECK (period_year >= 2000 AND period_year <= 2100),
    override_amount DECIMAL(15,2) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    approved_by UUID REFERENCES users(id),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one override per asset per period
    UNIQUE(business_id, asset_id, period_month, period_year),
    
    -- Foreign key constraints
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Create indexes for performance
CREATE INDEX idx_depreciation_overrides_business_id ON depreciation_overrides(business_id);
CREATE INDEX idx_depreciation_overrides_asset_id ON depreciation_overrides(asset_id);
CREATE INDEX idx_depreciation_overrides_period ON depreciation_overrides(period_year, period_month);

-- Add comments
COMMENT ON TABLE depreciation_overrides IS 'Tracks manual overrides/corrections to depreciation amounts';
COMMENT ON COLUMN depreciation_overrides.override_amount IS 'Corrected depreciation amount (replaces original)';
COMMENT ON COLUMN depreciation_overrides.reason IS 'Reason for the override/correction';
COMMENT ON COLUMN depreciation_overrides.approved_by IS 'User who approved the override (if approval workflow is used)';
