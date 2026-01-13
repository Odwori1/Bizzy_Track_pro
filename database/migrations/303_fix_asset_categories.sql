-- Migration 303: Fix asset categories to match schema
-- Date: 2026-01-11
-- Purpose: Update asset categories to match schema validation

BEGIN;

-- Drop the existing constraint
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_category_check;

-- Update categories in existing records to match new constraint
-- Map old categories to new categories
UPDATE assets 
SET category = CASE 
    WHEN category = 'land' THEN 'property'
    WHEN category = 'building' THEN 'property'
    WHEN category = 'computer' THEN 'electronics'
    WHEN category = 'software' THEN 'intangible'
    WHEN category = 'machinery' THEN 'equipment'  -- Map machinery to equipment
    ELSE category
END
WHERE category IN ('land', 'building', 'computer', 'software', 'machinery');

-- Add new constraint matching schema validation
ALTER TABLE assets 
ADD CONSTRAINT assets_category_check 
CHECK (category IN ('property', 'vehicle', 'furniture', 'electronics', 'machinery', 'equipment', 'intangible', 'other'));

-- Verify the update
SELECT DISTINCT category FROM assets ORDER BY category;

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '✅ Asset categories updated to match schema';
    RAISE NOTICE '   Old categories: land, building, vehicle, equipment, furniture, computer, software, other';
    RAISE NOTICE '   New categories: property, vehicle, furniture, electronics, machinery, equipment, intangible, other';
    RAISE NOTICE '   Mapping applied:';
    RAISE NOTICE '     land/building → property';
    RAISE NOTICE '     computer → electronics';
    RAISE NOTICE '     software → intangible';
    RAISE NOTICE '     machinery → equipment (if exists)';
END $$;
