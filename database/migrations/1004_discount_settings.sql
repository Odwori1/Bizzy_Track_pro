-- File: 1004_discount_settings.sql
-- PURPOSE: Store business-specific discount configuration
-- CREATED: February 28, 2026

-- Create discount_settings table
CREATE TABLE IF NOT EXISTS discount_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    approval_threshold NUMERIC(5,2) NOT NULL DEFAULT 20.00 CHECK (approval_threshold >= 0 AND approval_threshold <= 100),
    auto_approve_up_to NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (auto_approve_up_to >= 0 AND auto_approve_up_to <= 100),
    require_approval_for_stacked BOOLEAN DEFAULT false,
    max_discount_per_transaction NUMERIC(5,2) CHECK (max_discount_per_transaction >= 0 AND max_discount_per_transaction <= 100),
    default_allocation_method VARCHAR(20) DEFAULT 'PRO_RATA_AMOUNT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    
    -- Ensure one settings record per business
    CONSTRAINT unique_business_discount_settings UNIQUE (business_id)
);

-- Add trigger for updated_at
CREATE TRIGGER update_discount_settings_updated_at
    BEFORE UPDATE ON discount_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_discount_updated_at();

-- Create index for faster lookups
CREATE INDEX idx_discount_settings_business_id ON discount_settings(business_id);

-- Insert default settings for existing businesses
INSERT INTO discount_settings (business_id, created_by)
SELECT id, NULL FROM businesses b
WHERE NOT EXISTS (SELECT 1 FROM discount_settings ds WHERE ds.business_id = b.id);

-- Add comment for documentation
COMMENT ON TABLE discount_settings IS 'Stores business-specific discount configuration including approval thresholds';
COMMENT ON COLUMN discount_settings.approval_threshold IS 'Percentage above which discounts require approval (default 20%)';
COMMENT ON COLUMN discount_settings.auto_approve_up_to IS 'Discounts up to this percentage are auto-approved (0 means no auto-approval)';
COMMENT ON COLUMN discount_settings.require_approval_for_stacked IS 'Whether stacked discounts require approval even if individually under threshold';
COMMENT ON COLUMN discount_settings.max_discount_per_transaction IS 'Maximum total discount percentage allowed per transaction';
COMMENT ON COLUMN discount_settings.default_allocation_method IS 'Default method for allocating discounts across line items';
