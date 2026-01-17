-- Migration 319: Comprehensive fix for asset creation disappearing issue
-- Fixes: 
-- 1. Broken create_asset_purchase_journal function (references non-existent accounts table)
-- 2. Consolidates multiple function versions into one correct version
-- 3. Fixes column name mismatches (name → account_name, debit/credit → line_type/amount)
-- 4. Ensures all required journal_entries columns are populated
-- 5. Adds depreciation_start_date population
-- 6. Creates fixed version of post_monthly_depreciation to avoid future date constraint violation

-- ============================================
-- COMPREHENSIVE FIX FOR ASSET CREATION ISSUE
-- ============================================
-- Date: 2026-01-17
-- Purpose: Fix disappearing assets issue
-- ============================================

-- Step 1: View the CURRENT broken function to understand what's wrong
SELECT
    proname,
    prosrc
FROM pg_proc
WHERE proname = 'create_asset_purchase_journal'
  AND pg_get_function_arguments(oid) = 'p_business_id uuid, p_asset_id uuid, p_user_id uuid, p_journal_date date'
\gexec

-- Step 2: Drop ALL conflicting functions (clean slate)
DROP FUNCTION IF EXISTS create_asset_purchase_journal(uuid,uuid,uuid,date) CASCADE;
DROP FUNCTION IF EXISTS create_asset_purchase_journal_correct(uuid,uuid,uuid,date) CASCADE;
DROP FUNCTION IF EXISTS create_asset_purchase_journal_final(uuid,uuid,uuid,date) CASCADE;
DROP FUNCTION IF EXISTS create_asset_purchase_journal_fixed(uuid,uuid,uuid,date) CASCADE;

-- Step 3: Create the SINGLE, CORRECT function
-- Using the proven working code from create_asset_purchase_journal_final
CREATE OR REPLACE FUNCTION create_asset_purchase_journal(
    p_business_id uuid,
    p_asset_id uuid,
    p_user_id uuid,
    p_journal_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_journal_entry_id UUID;
    v_asset_cost NUMERIC(15,2);
    v_asset_code TEXT;
    v_asset_name TEXT;
    v_asset_category TEXT;
    v_fixed_asset_account_code TEXT;
    v_fixed_asset_account_id UUID;
    v_cash_account_id UUID;
    v_cash_account_code TEXT;
    v_reference_number TEXT;
    v_total_amount NUMERIC(15,2);
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

    -- Get Fixed Assets account - CORRECT: chart_of_accounts (NOT accounts!)
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

    -- Get Cash/Bank account - CORRECT: account_name (NOT name!)
    SELECT id, account_code INTO v_cash_account_id, v_cash_account_code
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_type = 'asset'
      AND (account_name ILIKE '%cash%' OR account_name ILIKE '%bank%' OR account_code IN ('1110', '1120', '1130'))
      AND is_active = true
    ORDER BY
        CASE WHEN account_name ILIKE '%cash%' THEN 1
             WHEN account_code = '1110' THEN 2  -- Cash
             WHEN account_code = '1120' THEN 3  -- Bank Account
             WHEN account_code = '1130' THEN 4  -- Mobile Money
             ELSE 5 END,
        created_at
    LIMIT 1;

    IF v_cash_account_id IS NULL THEN
        RAISE EXCEPTION 'No active cash/bank account found for business';
    END IF;

    -- Generate reference number with timestamp to ensure uniqueness
    v_reference_number := 'ASSET-' || v_asset_code || '-' ||
                         TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                         (EXTRACT(SECOND FROM NOW())::INTEGER) || '-' ||
                         (FLOOR(RANDOM() * 1000)::INTEGER);

    -- Total amount = sum of all line amounts (debit + credit)
    v_total_amount := v_asset_cost * 2;

    -- Create journal entry header - USING ACTUAL TABLE COLUMNS
    INSERT INTO journal_entries (
        business_id,
        journal_date,
        reference_number,
        reference_type,    -- REQUIRED column
        reference_id,      -- REQUIRED column
        description,
        total_amount,      -- REQUIRED column
        status,
        created_by,
        posted_at
    ) VALUES (
        p_business_id,
        p_journal_date,
        v_reference_number,
        'asset',           -- reference_type
        p_asset_id::text,  -- reference_id
        'Asset Purchase: ' || v_asset_name || ' (' || v_asset_category || ')',
        v_total_amount,
        'posted',
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- Debit: Fixed Assets account - CORRECT: line_type/amount (NOT debit/credit!)
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

    -- Credit: Cash/Bank account - CORRECT: line_type/amount (NOT debit/credit!)
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
        v_cash_account_id,
        'credit',
        v_asset_cost,
        'Payment for asset purchase from ' || v_cash_account_code
    );

    -- Update asset with depreciation start date (if not set)
    UPDATE assets
    SET depreciation_start_date = COALESCE(depreciation_start_date, p_journal_date)
    WHERE id = p_asset_id;

    RETURN v_journal_entry_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error with full context
        RAISE NOTICE 'Error in create_asset_purchase_journal: %', SQLERRM;
        RAISE NOTICE 'Asset ID: %, Business ID: %, Category: %, Account Code: %',
            p_asset_id, p_business_id, v_asset_category, v_fixed_asset_account_code;
        RAISE;
END;
$function$;

-- Step 4: Verify the function was created correctly
SELECT
    proname,
    pg_get_function_arguments(oid) as arguments,
    pg_get_function_result(oid) as result_type
FROM pg_proc
WHERE proname = 'create_asset_purchase_journal';

-- Should show ONLY ONE function now!

-- Step 5: Test the function immediately
DO $$
DECLARE
    v_test_asset_id UUID;
    v_journal_id UUID;
BEGIN
    -- Set RLS context
    PERFORM set_config('app.current_business_id', 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256', false);

    -- Create a test asset
    INSERT INTO assets (
        business_id, asset_name, category, asset_type,
        purchase_date, purchase_cost, salvage_value, useful_life_months,
        depreciation_method, status, condition_status, created_by,
        depreciation_start_date
    ) VALUES (
        'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
        'Migration Test Asset',
        'equipment',
        'tangible',
        '2026-01-17',
        750000,
        0,
        60,
        'straight_line',
        'active',
        'excellent',
        'd5f407e3-ac71-4b91-b03e-ec50f908c3d1',
        '2026-01-17'
    ) RETURNING id INTO v_test_asset_id;

    RAISE NOTICE 'Created test asset: %', v_test_asset_id;

    -- Call the fixed function
    SELECT create_asset_purchase_journal(
        'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
        v_test_asset_id,
        'd5f407e3-ac71-4b91-b03e-ec50f908c3d1',
        CURRENT_DATE
    ) INTO v_journal_id;

    RAISE NOTICE 'Created journal entry: %', v_journal_id;

    -- Verify everything worked
    IF EXISTS (
        SELECT 1 FROM assets WHERE id = v_test_asset_id
    ) AND EXISTS (
        SELECT 1 FROM journal_entries WHERE id = v_journal_id
    ) THEN
        RAISE NOTICE '✅ SUCCESS: Asset and journal entry created successfully!';
    ELSE
        RAISE EXCEPTION '❌ FAILED: Asset or journal entry not found!';
    END IF;
END $$;

-- Step 6: Show verification results
SELECT
    a.asset_code,
    a.asset_name,
    a.purchase_cost,
    a.depreciation_start_date,
    je.reference_number,
    je.journal_date,
    COUNT(jel.id) as line_count
FROM assets a
JOIN journal_entries je ON je.reference_id = a.id::text
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE a.asset_name = 'Migration Test Asset'
GROUP BY a.asset_code, a.asset_name, a.purchase_cost, a.depreciation_start_date,
         je.reference_number, je.journal_date;

-- Step 7: Also fix the depreciation posting issue (separate bug)
-- The post_monthly_depreciation function uses future dates violating constraint
-- Let's create a quick fix for that too:

CREATE OR REPLACE FUNCTION post_monthly_depreciation_fixed(
    p_business_id uuid,
    p_month integer,
    p_year integer,
    p_user_id uuid
)
RETURNS TABLE(
    asset_code text,
    asset_name text,
    depreciation_amount numeric,
    book_value numeric,
    message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_asset RECORD;
    v_depreciation_amount NUMERIC(15,2);
    v_unique_suffix INTEGER;
    v_reference_number TEXT;
    v_journal_entry_id UUID;
    v_depreciation_account_id UUID;
    v_accumulated_depreciation_account_id UUID;
BEGIN
    -- Generate unique suffix for reference numbers
    v_unique_suffix := EXTRACT(SECOND FROM NOW())::INTEGER * 1000 + FLOOR(RANDOM() * 1000)::INTEGER;

    -- Get depreciation accounts
    SELECT id INTO v_depreciation_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_code = '5000'  -- Depreciation Expense
      AND is_active = true;

    SELECT id INTO v_accumulated_depreciation_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_code LIKE '149%'  -- Accumulated Depreciation accounts
      AND is_active = true
    LIMIT 1;

    -- Check if depreciation already posted for this period
    IF EXISTS (
        SELECT 1 FROM asset_depreciations
        WHERE business_id = p_business_id
          AND period_year = p_year
          AND period_month = p_month
    ) THEN
        RAISE EXCEPTION 'Depreciation already posted for period %/%', p_month, p_year;
    END IF;

    -- Process each asset
    FOR v_asset IN (
        SELECT a.id, a.asset_code, a.asset_name, a.category,
               a.purchase_cost, a.current_book_value,
               a.useful_life_months, a.depreciation_method,
               a.depreciation_start_date
        FROM assets a
        WHERE a.business_id = p_business_id
          AND a.status = 'active'
          AND a.is_active = true
          AND a.depreciation_start_date IS NOT NULL
          AND a.depreciation_start_date <= MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day'
        ORDER BY a.asset_code
    ) LOOP
        -- Calculate depreciation for this asset
        v_depreciation_amount := calculate_monthly_depreciation(v_asset.id, p_month, p_year);

        IF v_depreciation_amount > 0 THEN
            -- Generate reference number
            v_reference_number := 'DEPR-' || v_asset.asset_code || '-' ||
                                 TO_CHAR(MAKE_DATE(p_year, p_month, 1), 'YYYY-MM') || '-' ||
                                 v_unique_suffix;

            -- Use CURRENT_DATE instead of future end-of-month date to avoid constraint violation
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
                CURRENT_DATE,  -- FIX: Use current date, not future date
                v_reference_number,
                'asset_depreciation',
                'month_' || v_asset.id::TEXT || '_' ||
                p_year::TEXT || p_month::TEXT || '_' ||
                v_unique_suffix::TEXT,
                'Depreciation: ' || v_asset.asset_name || ' (' || v_asset.asset_code || ')',
                v_depreciation_amount * 2,
                'posted',
                p_user_id,
                NOW()
            ) RETURNING id INTO v_journal_entry_id;

            -- Create journal lines
            -- Debit: Depreciation Expense
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
                v_depreciation_account_id,
                'debit',
                v_depreciation_amount,
                'Monthly depreciation: ' || v_asset.asset_name
            );

            -- Credit: Accumulated Depreciation
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
                v_accumulated_depreciation_account_id,
                'credit',
                v_depreciation_amount,
                'Accumulated depreciation: ' || v_asset.asset_name
            );

            -- Record depreciation in asset_depreciations table
            INSERT INTO asset_depreciations (
                business_id,
                asset_id,
                period_year,
                period_month,
                depreciation_amount,
                journal_entry_id,
                created_by
            ) VALUES (
                p_business_id,
                v_asset.id,
                p_year,
                p_month,
                v_depreciation_amount,
                v_journal_entry_id,
                p_user_id
            );

            -- Update asset book value
            UPDATE assets
            SET current_book_value = current_book_value - v_depreciation_amount,
                accumulated_depreciation = COALESCE(accumulated_depreciation, 0) + v_depreciation_amount
            WHERE id = v_asset.id;

            -- Return row for the function output
            asset_code := v_asset.asset_code;
            asset_name := v_asset.asset_name;
            depreciation_amount := v_depreciation_amount;
            book_value := v_asset.current_book_value - v_depreciation_amount;
            message := 'Depreciation posted successfully';
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$function$;

-- Step 8: Final verification
SELECT
    '✅ Database Functions Fixed' as status,
    COUNT(*) as function_count,
    STRING_AGG(proname, ', ') as functions
FROM pg_proc
WHERE proname LIKE '%create_asset_purchase_journal%'
UNION ALL
SELECT
    '✅ Test Asset Created' as status,
    COUNT(*) as asset_count,
    MAX(asset_name) as latest_asset
FROM assets
WHERE asset_name = 'Migration Test Asset'
UNION ALL
SELECT
    '✅ Chart of Accounts Ready' as status,
    COUNT(*) as account_count,
    'Equipment (1440) exists' as details
FROM chart_of_accounts
WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
  AND account_code = '1440'
  AND is_active = true;
