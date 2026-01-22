-- Migration: Fix depreciation override function (remove notes column reference)
-- File: 503_fix_depreciation_override_function.sql

-- Drop the function if it exists
DROP FUNCTION IF EXISTS apply_depreciation_override(
    UUID, UUID, INTEGER, INTEGER, DECIMAL, VARCHAR, UUID
);

-- Create corrected function
CREATE OR REPLACE FUNCTION apply_depreciation_override(
    p_business_id UUID,
    p_asset_id UUID,
    p_period_month INTEGER,
    p_period_year INTEGER,
    p_override_amount DECIMAL(15,2),
    p_reason VARCHAR(500),
    p_user_id UUID
)
RETURNS TABLE(
    success BOOLEAN,
    message VARCHAR(500),
    original_amount DECIMAL(15,2),
    new_amount DECIMAL(15,2),
    override_id UUID
) AS $$
DECLARE
    v_original_depreciation_id UUID;
    v_original_amount DECIMAL(15,2);
    v_journal_entry_id UUID;
    v_override_id UUID;
    v_asset_code VARCHAR(255);
    v_asset_name VARCHAR(255);
    v_error_message TEXT;
BEGIN
    -- Get asset details for logging
    SELECT asset_code, asset_name INTO v_asset_code, v_asset_name
    FROM assets 
    WHERE id = p_asset_id AND business_id = p_business_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Asset not found or access denied'::VARCHAR, 
                        0::DECIMAL(15,2), 0::DECIMAL(15,2), NULL::UUID;
        RETURN;
    END IF;
    
    -- Check if depreciation exists for this period
    SELECT id, depreciation_amount, journal_entry_id 
    INTO v_original_depreciation_id, v_original_amount, v_journal_entry_id
    FROM asset_depreciations 
    WHERE asset_id = p_asset_id 
      AND period_month = p_period_month 
      AND period_year = p_period_year;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'No depreciation found for the specified period'::VARCHAR, 
                        0::DECIMAL(15,2), 0::DECIMAL(15,2), NULL::UUID;
        RETURN;
    END IF;
    
    -- Check if override already exists
    PERFORM id FROM depreciation_overrides
    WHERE business_id = p_business_id 
      AND asset_id = p_asset_id 
      AND period_month = p_period_month 
      AND period_year = p_period_year;
    
    IF FOUND THEN
        RETURN QUERY SELECT false, 'Override already exists for this period'::VARCHAR, 
                        v_original_amount, p_override_amount, NULL::UUID;
        RETURN;
    END IF;
    
    -- Create override record
    INSERT INTO depreciation_overrides (
        business_id, asset_id, period_month, period_year,
        override_amount, reason, created_by
    ) VALUES (
        p_business_id, p_asset_id, p_period_month, p_period_year,
        p_override_amount, p_reason, p_user_id
    ) RETURNING id INTO v_override_id;
    
    -- Update the depreciation record with override amount (NO notes column)
    UPDATE asset_depreciations
    SET depreciation_amount = p_override_amount,
        updated_at = NOW()
    WHERE id = v_original_depreciation_id;
    
    -- Calculate the difference
    DECLARE
        v_difference DECIMAL(15,2) := p_override_amount - v_original_amount;
    BEGIN
        -- Update asset's current book value and accumulated depreciation
        UPDATE assets
        SET current_book_value = current_book_value - v_difference,
            accumulated_depreciation = accumulated_depreciation + v_difference,
            updated_at = NOW()
        WHERE id = p_asset_id;
    END;
    
    RETURN QUERY SELECT true, 
        'Depreciation override applied successfully'::VARCHAR, 
        v_original_amount, 
        p_override_amount, 
        v_override_id;
    
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    RETURN QUERY SELECT false, 
        ('Error applying override: ' || v_error_message)::VARCHAR(500), 
        0::DECIMAL(15,2), 
        0::DECIMAL(15,2), 
        NULL::UUID;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION apply_depreciation_override IS 'Applies a manual override/correction to posted depreciation amounts';
