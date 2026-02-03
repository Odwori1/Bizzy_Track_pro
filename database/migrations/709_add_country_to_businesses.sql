-- Migration 709: Add country column to businesses table for tax compliance
-- Author: Tax Integration Team
-- Date: 2026-01-30

-- Add country column with default 'UG' for Uganda
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS country_code CHAR(2) DEFAULT 'UG',
ADD COLUMN IF NOT EXISTS country_name VARCHAR(100) DEFAULT 'Uganda';

-- Update existing records (system accounts business)
UPDATE businesses 
SET country_code = 'UG', country_name = 'Uganda'
WHERE id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
AND country_code IS NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_businesses_country_code 
ON businesses(country_code);

-- Add foreign key constraint to tax_countries for validation
ALTER TABLE businesses
ADD CONSTRAINT fk_businesses_country_code 
FOREIGN KEY (country_code) 
REFERENCES tax_countries(country_code)
ON DELETE SET DEFAULT;

-- Add comment for documentation
COMMENT ON COLUMN businesses.country_code IS 'ISO 3166-1 alpha-2 country code for tax jurisdiction (e.g., UG for Uganda)';
COMMENT ON COLUMN businesses.country_name IS 'Full country name for display purposes';

-- Verify the migration
DO $$
DECLARE
    v_business_count INT;
    v_updated_count INT;
BEGIN
    RAISE NOTICE '=== VERIFYING MIGRATION 709 ===';
    
    -- Check if columns were added
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'businesses' AND column_name = 'country_code'
    ) THEN
        RAISE NOTICE '✅ country_code column added successfully';
    ELSE
        RAISE NOTICE '❌ Failed to add country_code column';
    END IF;
    
    -- Count businesses with country set
    SELECT COUNT(*) INTO v_business_count FROM businesses;
    SELECT COUNT(*) INTO v_updated_count FROM businesses WHERE country_code = 'UG';
    
    RAISE NOTICE 'Total businesses: %', v_business_count;
    RAISE NOTICE 'Businesses with Uganda country: %', v_updated_count;
    
    IF v_updated_count > 0 THEN
        RAISE NOTICE '✅ Business country configuration complete';
    ELSE
        RAISE NOTICE '⚠️ No businesses have country configured';
    END IF;
    
    RAISE NOTICE '=== MIGRATION 709 COMPLETE ===';
END $$;
