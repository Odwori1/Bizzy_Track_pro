-- Migration: Add asset_transfers table for tracking asset transfers
-- File: 501_add_asset_transfers.sql

CREATE TABLE IF NOT EXISTS asset_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id),
    from_department_id UUID REFERENCES departments(id),
    to_department_id UUID REFERENCES departments(id),
    from_location VARCHAR(255),
    to_location VARCHAR(255),
    transfer_date DATE NOT NULL,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_asset_transfers_business_id ON asset_transfers(business_id);
CREATE INDEX idx_asset_transfers_asset_id ON asset_transfers(asset_id);
CREATE INDEX idx_asset_transfers_transfer_date ON asset_transfers(transfer_date);

-- Add comment
COMMENT ON TABLE asset_transfers IS 'Tracks asset transfers between departments/locations';
COMMENT ON COLUMN asset_transfers.transfer_date IS 'Date when the transfer took effect';
COMMENT ON COLUMN asset_transfers.notes IS 'Optional notes about the transfer reason';
