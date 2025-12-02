-- ============================================================================
-- MIGRATION 028: FIX ASSET CODE GENERATION
-- Date: December 2025
-- Purpose: Fix duplicate asset_code issue by creating helper function
-- ============================================================================

-- Create a function that safely generates the next asset code
CREATE OR REPLACE FUNCTION generate_next_asset_code(p_business_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    max_code_num INTEGER;
    next_code VARCHAR;
    attempt_count INTEGER := 0;
BEGIN
    -- Find the maximum numeric part from existing ASSET-XXX codes
    SELECT MAX(CAST(SUBSTRING(asset_code FROM 'ASSET-(\d+)') AS INTEGER))
    INTO max_code_num
    FROM fixed_assets 
    WHERE business_id = p_business_id
      AND asset_code ~ '^ASSET-\d+$';
    
    -- If no existing codes, start from 1
    IF max_code_num IS NULL THEN
        max_code_num := 0;
    END IF;
    
    -- Try to find next available code (handle gaps)
    WHILE attempt_count < 100 LOOP
        max_code_num := max_code_num + 1;
        next_code := 'ASSET-' || LPAD(max_code_num::TEXT, 3, '0');
        
        -- Check if this code already exists
        IF NOT EXISTS (
            SELECT 1 FROM fixed_assets 
            WHERE business_id = p_business_id 
            AND asset_code = next_code
        ) THEN
            RETURN next_code;
        END IF;
        
        attempt_count := attempt_count + 1;
    END LOOP;
    
    -- Fallback: Use timestamp if we can't find a unique code
    RETURN 'ASSET-' || EXTRACT(EPOCH FROM NOW())::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- Create an index to help with code generation performance
CREATE INDEX IF NOT EXISTS idx_fixed_assets_asset_code_pattern 
ON fixed_assets (business_id, asset_code) 
WHERE asset_code ~ '^ASSET-\d+$';

-- Add comment to the unique constraint for clarity
COMMENT ON CONSTRAINT fixed_assets_business_id_asset_code_key ON fixed_assets 
IS 'Ensures unique asset codes per business. Use generate_next_asset_code() function.';

-- Test the function with a sample (commented out in production)
-- SELECT generate_next_asset_code('243a15b5-255a-4852-83bf-5cb46aa62b5e');
