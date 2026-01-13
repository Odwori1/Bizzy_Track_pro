-- Migration 309: Fix asset trigger for existing assets
-- Date: 2026-01-12
-- Purpose: Fix the generate_asset_code trigger to handle existing assets correctly

BEGIN;

-- Drop and recreate the trigger function
CREATE OR REPLACE FUNCTION generate_asset_code()
RETURNS TRIGGER AS $$
DECLARE
    v_prefix VARCHAR(10);
    v_next_number INTEGER;
BEGIN
    -- Get business prefix from business name
    SELECT SUBSTRING(name FROM 1 FOR 3) INTO v_prefix
    FROM businesses
    WHERE id = NEW.business_id;

    -- Default prefix if business name is too short
    IF LENGTH(v_prefix) < 3 THEN
        v_prefix := 'AST';
    END IF;

    -- Get next sequence number for this business
    SELECT COALESCE(MAX(CAST(SUBSTRING(asset_code FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_next_number
    FROM assets
    WHERE business_id = NEW.business_id
      AND asset_code ~ ('^' || v_prefix || '-[0-9]+$');

    -- Set asset code
    NEW.asset_code := v_prefix || '-' || LPAD(v_next_number::TEXT, 4, '0');

    -- Calculate depreciation rate for declining balance method
    IF NEW.depreciation_method = 'declining_balance' AND NEW.useful_life_months > 0 THEN
        -- Default to double declining balance (200% / useful life)
        NEW.depreciation_rate := (200.0 / (NEW.useful_life_months / 12.0));
    END IF;

    -- Set initial book value to purchase cost ONLY IF NOT AN EXISTING ASSET
    -- For existing assets, current_book_value is set by the application
    IF NEW.is_existing_asset = true THEN
        -- For existing assets, we should NOT override current_book_value
        -- It's already set to initial_book_value by the application
        -- Just ensure accumulated_depreciation matches existing_accumulated_depreciation
        NEW.accumulated_depreciation := COALESCE(NEW.existing_accumulated_depreciation, 0);
    ELSE
        -- For new purchases, set initial book value to purchase cost
        NEW.current_book_value := NEW.purchase_cost;
        NEW.accumulated_depreciation := 0;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Now we need to fix the existing office building record
UPDATE assets
SET 
    current_book_value = initial_book_value,
    accumulated_depreciation = existing_accumulated_depreciation,
    updated_at = NOW()
WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
AND asset_code = 'sys-0004'
AND is_existing_asset = true;

COMMIT;
