-- Fix asset_maintenance table structure
ALTER TABLE asset_maintenance 
ADD COLUMN IF NOT EXISTS technician VARCHAR(255),
ADD COLUMN IF NOT EXISTS cost DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_maintenance_date DATE;

-- Fix asset_depreciation table structure as well (to be safe)
ALTER TABLE asset_depreciation 
ADD COLUMN IF NOT EXISTS depreciation_method VARCHAR(50) DEFAULT 'straight_line';

-- Update RLS policies if needed
DROP POLICY IF EXISTS "Users can manage own business maintenance" ON asset_maintenance;
CREATE POLICY "Users can manage own business maintenance" ON asset_maintenance
FOR ALL USING (business_id = current_setting('app.current_business_id')::uuid);

DROP POLICY IF EXISTS "Users can manage own business depreciation" ON asset_depreciation;
CREATE POLICY "Users can manage own business depreciation" ON asset_depreciation
FOR ALL USING (business_id = current_setting('app.current_business_id')::uuid);
