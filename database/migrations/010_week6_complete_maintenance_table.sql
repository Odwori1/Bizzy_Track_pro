-- Complete asset_maintenance table structure
ALTER TABLE asset_maintenance 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'scheduled',
ADD COLUMN IF NOT EXISTS maintenance_type VARCHAR(50) DEFAULT 'routine';

-- Also complete asset_depreciation table
ALTER TABLE asset_depreciation 
ADD COLUMN IF NOT EXISTS beginning_value DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS ending_value DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS depreciation_amount DECIMAL(12,2);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_asset_id ON asset_maintenance(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_date ON asset_maintenance(maintenance_date);
CREATE INDEX IF NOT EXISTS idx_asset_depreciation_asset_id ON asset_depreciation(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_depreciation_period ON asset_depreciation(period_date);
