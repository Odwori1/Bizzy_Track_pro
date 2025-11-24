-- Drop the existing constraint
ALTER TABLE asset_maintenance 
DROP CONSTRAINT IF EXISTS asset_maintenance_maintenance_type_check;

-- Add new constraint with all allowed maintenance types
ALTER TABLE asset_maintenance 
ADD CONSTRAINT asset_maintenance_maintenance_type_check 
CHECK (maintenance_type IN ('routine', 'repair', 'inspection', 'emergency', 'preventive'));

-- Also fix any existing records that might have invalid types
UPDATE asset_maintenance 
SET maintenance_type = 'routine' 
WHERE maintenance_type NOT IN ('routine', 'repair', 'inspection', 'emergency', 'preventive');
