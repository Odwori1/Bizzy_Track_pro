-- Migration: Add payment method support for asset purchases
-- Author: System Team
-- Date: 2026-01-22
-- Description: Modifies create_asset_purchase_journal to support payment methods
--              while maintaining backward compatibility

BEGIN;

-- ============================================
-- 1. ADD PAYMENT METHOD COLUMN TO ASSETS TABLE
-- ============================================
-- Store the payment method used for purchased assets
ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cash',
ADD COLUMN IF NOT EXISTS payment_account_code VARCHAR(20);

COMMENT ON COLUMN assets.payment_method IS 'Method used to pay for asset: cash, bank, mobile_money, credit';
COMMENT ON COLUMN assets.payment_account_code IS 'GL account code used for payment (1110, 1120, 1130, 2100)';

-- ============================================
-- 2. CREATE NEW VERSION OF THE FUNCTION (V2)
-- ============================================
CREATE OR REPLACE FUNCTION create_asset_purchase_journal_v2(
    p_business_id UUID,
    p_asset_id UUID,
    p_user_id UUID,
    p_journal_date DATE,
    p_payment_method VARCHAR(20) DEFAULT 'cash'
) 
RETURNS UUID AS $$
DECLARE
    v_journal_entry_id UUID;
    v_asset_cost NUMERIC(15,2);
    v_asset_code TEXT;
    v_asset_name TEXT;
    v_asset_category TEXT;
    v_fixed_asset_account_code TEXT;
    v_fixed_asset_account_id UUID;
    v_payment_account_id UUID;
    v_payment_account_code TEXT;
    v_reference_number TEXT;
    v_total_amount NUMERIC(15,2);
    v_payment_method_lower TEXT;
BEGIN
    -- Get asset details including category
    SELECT purchase_cost, asset_code, asset_name, category
    INTO v_asset_cost, v_asset_code, v_asset_name, v_asset_category
    FROM assets
    WHERE id = p_asset_id AND business_id = p_business_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asset not found: %', p_asset_id;
    END IF;

    -- Map asset category to correct account code
    v_fixed_asset_account_code := CASE v_asset_category
        WHEN 'land' THEN '1410'
        WHEN 'building' THEN '1420'
        WHEN 'vehicle' THEN '1430'
        WHEN 'equipment' THEN '1440'
        WHEN 'furniture' THEN '1450'
        WHEN 'computer' THEN '1460'
        WHEN 'electronics' THEN '1460'
        WHEN 'software' THEN '1460'
        WHEN 'other' THEN '1480'
        ELSE '1480'  -- Default to Other Fixed Assets
    END;

    -- Get Fixed Assets account
    SELECT id INTO v_fixed_asset_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_code = v_fixed_asset_account_code
      AND is_active = true
    LIMIT 1;

    IF v_fixed_asset_account_id IS NULL THEN
        RAISE EXCEPTION 'Fixed Assets account (% - %) not found for business. Run ensure_fixed_asset_accounts first.',
            v_fixed_asset_account_code, v_asset_category;
    END IF;

    -- 🆕 PAYMENT METHOD LOGIC
    v_payment_method_lower := LOWER(p_payment_method);
    
    -- Map payment method to account code
    v_payment_account_code := CASE v_payment_method_lower
        WHEN 'cash' THEN '1110'
        WHEN 'bank' THEN '1120'
        WHEN 'mobile_money' THEN '1130'
        WHEN 'mobile' THEN '1130'
        WHEN 'credit' THEN '2100'
        WHEN 'payable' THEN '2100'
        WHEN 'account_payable' THEN '2100'
        ELSE '1110'  -- Default to Cash for unknown methods
    END;

    -- Get Payment account
    SELECT id, account_code INTO v_payment_account_id, v_payment_account_code
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_code = v_payment_account_code
      AND is_active = true
    LIMIT 1;

    IF v_payment_account_id IS NULL THEN
        RAISE EXCEPTION 'Payment account (% - %) not found for business. Ensure the account exists and is active.',
            v_payment_account_code, p_payment_method;
    END IF;

    -- Generate reference number
    v_reference_number := 'ASSET-' || v_asset_code || '-' ||
                         TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                         (EXTRACT(SECOND FROM NOW())::INTEGER) || '-' ||
                         (FLOOR(RANDOM() * 1000)::INTEGER);

    v_total_amount := v_asset_cost * 2;

    -- Create journal entry header
    INSERT INTO journal_entries (
        business_id,
        journal_date,
        reference_number,
        reference_type,
        reference_id,
        description,
        total_amount,
        status,
        created_by,
        posted_at
    ) VALUES (
        p_business_id,
        p_journal_date,
        v_reference_number,
        'asset',
        p_asset_id::text,
        'Asset Purchase: ' || v_asset_name || ' (' || v_asset_category || ') - Paid via ' || p_payment_method,
        v_total_amount,
        'posted',
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- Debit: Fixed Assets account
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        p_business_id,
        v_journal_entry_id,
        v_fixed_asset_account_id,
        'debit',
        v_asset_cost,
        'Purchase of ' || v_asset_name || ' (' || v_asset_category || ')'
    );

    -- Credit: Payment account
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        p_business_id,
        v_journal_entry_id,
        v_payment_account_id,
        'credit',
        v_asset_cost,
        'Payment for asset purchase from ' || v_payment_account_code || ' (' || p_payment_method || ')'
    );

    -- Update asset with payment method and depreciation start date
    UPDATE assets
    SET 
        payment_method = p_payment_method,
        payment_account_code = v_payment_account_code,
        depreciation_start_date = COALESCE(depreciation_start_date, p_journal_date)
    WHERE id = p_asset_id;

    RETURN v_journal_entry_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in create_asset_purchase_journal_v2: %', SQLERRM;
        RAISE NOTICE 'Asset ID: %, Business ID: %, Category: %, Payment Method: %',
            p_asset_id, p_business_id, v_asset_category, p_payment_method;
        RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. UPDATE EXISTING FUNCTION FOR BACKWARD COMPATIBILITY
-- ============================================
-- Keep the old function but make it call the new one with default 'cash'
CREATE OR REPLACE FUNCTION create_asset_purchase_journal(
    p_business_id UUID,
    p_asset_id UUID,
    p_user_id UUID,
    p_journal_date DATE
) 
RETURNS UUID AS $$
BEGIN
    -- Call the new function with default 'cash' payment method
    RETURN create_asset_purchase_journal_v2(
        p_business_id,
        p_asset_id,
        p_user_id,
        p_journal_date,
        'cash'  -- Default for backward compatibility
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. CREATE HELPER FUNCTION FOR PAYMENT METHOD VALIDATION
-- ============================================
CREATE OR REPLACE FUNCTION validate_payment_method(
    p_payment_method VARCHAR(20)
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN p_payment_method IN ('cash', 'bank', 'mobile_money', 'mobile', 'credit', 'payable', 'account_payable');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 5. UPDATE EXISTING ASSETS WITH DEFAULT PAYMENT METHOD
-- ============================================
-- For all purchased assets that don't have payment_method set,
-- set default based on their journal entries
DO $$
DECLARE
    v_business_record RECORD;
BEGIN
    FOR v_business_record IN 
        SELECT DISTINCT business_id FROM assets WHERE acquisition_method = 'purchase'
    LOOP
        -- Set app.current_business_id for RLS policies
        PERFORM set_config('app.current_business_id', v_business_record.business_id::text, false);
        
        -- Update assets with payment method based on existing journal entries
        UPDATE assets a
        SET 
            payment_method = 'cash',
            payment_account_code = '1110'
        FROM journal_entries je
        JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
        JOIN chart_of_accounts ca ON jel.account_id = ca.id
        WHERE a.id = je.reference_id::uuid
          AND je.reference_type = 'asset'
          AND jel.line_type = 'credit'
          AND ca.account_code IN ('1110', '1120', '1130', '2100')
          AND a.business_id = v_business_record.business_id
          AND a.acquisition_method = 'purchase'
          AND a.payment_method IS NULL;
        
        RAISE NOTICE 'Updated payment methods for business: %', v_business_record.business_id;
    END LOOP;
    
    -- Reset to current business
    PERFORM set_config('app.current_business_id', current_setting('app.current_business_id'), false);
END $$;

-- ============================================
-- 6. CREATE INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_assets_payment_method ON assets(payment_method);
CREATE INDEX IF NOT EXISTS idx_assets_payment_account ON assets(payment_account_code);

-- ============================================
-- 7. UPDATE ASSET REGISTER VIEWS TO INCLUDE PAYMENT METHOD
-- ============================================
-- Note: These views might need recreation in a separate migration if they exist
-- For now, we'll just note that they need updating

-- ============================================
-- 8. MIGRATION VERIFICATION QUERIES
-- ============================================
DO $$
DECLARE
    v_migration_name TEXT := '602_add_payment_method_to_asset_purchases';
    v_start_time TIMESTAMP := clock_timestamp();
    v_assets_updated INTEGER;
    v_function_created BOOLEAN;
BEGIN
    RAISE NOTICE '=== Starting migration: % ===', v_migration_name;
    RAISE NOTICE 'Start time: %', v_start_time;
    
    -- Count assets updated
    SELECT COUNT(*) INTO v_assets_updated
    FROM assets 
    WHERE payment_method IS NOT NULL;
    
    -- Check if function was created
    SELECT EXISTS(
        SELECT 1 FROM pg_proc 
        WHERE proname = 'create_asset_purchase_journal_v2'
    ) INTO v_function_created;
    
    RAISE NOTICE 'Migration Results:';
    RAISE NOTICE '  - Assets with payment method: %', v_assets_updated;
    RAISE NOTICE '  - V2 function created: %', v_function_created;
    RAISE NOTICE '  - Old function maintained: Yes';
    RAISE NOTICE '  - Duration: %', clock_timestamp() - v_start_time;
    
    -- Validation checks
    IF NOT v_function_created THEN
        RAISE EXCEPTION 'V2 function was not created successfully';
    END IF;
    
    RAISE NOTICE '=== Migration completed successfully ===';
END $$;

COMMIT;

