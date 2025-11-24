-- Add timestamp columns to asset_maintenance table
ALTER TABLE asset_maintenance 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Add timestamp columns to asset_depreciation table as well
ALTER TABLE asset_depreciation 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS created_by UUID;

-- Add any other missing columns we might need
ALTER TABLE asset_maintenance 
ADD COLUMN IF NOT EXISTS performed_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS parts_used JSONB,
ADD COLUMN IF NOT EXISTS next_maintenance_notes TEXT,
ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false;

-- Update the status column to match our service expectations
ALTER TABLE asset_maintenance 
ALTER COLUMN status TYPE VARCHAR(50),
ALTER COLUMN status SET DEFAULT 'scheduled';
