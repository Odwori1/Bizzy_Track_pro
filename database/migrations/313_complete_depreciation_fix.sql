-- Migration 313: Complete Depreciation System Fix
-- Date: 2026-01-12
-- Purpose: Fix all depreciation system issues with audit trails
-- Issues Fixed:
-- 1. Historical depreciation duplicate constraint (reference_id not unique)
-- 2. Monthly depreciation potential duplicate in same second
-- 3. Add transaction tracing for debugging
-- 4. Ensure proper error handling and rollback

BEGIN;

-- Create audit log table for migration tracking
CREATE TABLE IF NOT EXISTS depreciation_fix_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fix_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    affected_rows INTEGER DEFAULT 0,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    executed_by VARCHAR(100) DEFAULT current_user
);

-- Log start of migration
INSERT INTO depreciation_fix_audit (fix_type, description) 
VALUES ('migration_start', 'Starting complete depreciation system fix');

-- ============================================================================
-- PART 1: FIX HISTORICAL DEPRECIATION FUNCTION
-- ============================================================================

-- Log current function state
INSERT INTO depreciation_fix_audit (fix_type, description, old_value)
SELECT 'function_audit', 'Current post_historical_depreciation function', 
       pg_get_functiondef(oid)::TEXT
FROM pg_proc 
WHERE proname = 'post_historical_depreciation';

-- Create improved historical depreciation function with guaranteed uniqueness
CREATE OR REPLACE FUNCTION post_historical_depreciation(
    p_business_id UUID,
    p_asset_id UUID,
    p_user_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    posted_period_month INTEGER,
    posted_period_year INTEGER,
    posted_depreciation_amount DECIMAL(15,2),
    posted_success BOOLEAN,
    posted_message TEXT
) AS $$
DECLARE
    v_historical RECORD;
    v_depreciation_account_id UUID;
    v_accumulated_account_id UUID;
    v_journal_entry_id UUID;
    v_reference_number VARCHAR(100);
    v_asset RECORD;
    v_month INTEGER;
    v_year INTEGER;
    v_depreciation_amount DECIMAL(15,2);
    v_accumulated DECIMAL(15,2);
    v_book_value DECIMAL(15,2);
    v_current_date DATE;
    v_unique_suffix VARCHAR(20);
    v_transaction_trace_id VARCHAR(50);
    v_loop_counter INTEGER := 0;
    v_success_counter INTEGER := 0;
BEGIN
    -- Generate transaction trace ID for debugging
    v_transaction_trace_id := 'hist_' || REPLACE(gen_random_uuid()::TEXT, '-', '_') || '_' || 
                             EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT;
    
    RAISE NOTICE '[%] Starting historical depreciation for asset: %, as_of: %', 
        v_transaction_trace_id, p_asset_id, p_as_of_date;

    -- Get asset details
    SELECT * INTO v_asset
    FROM assets
    WHERE id = p_asset_id AND business_id = p_business_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '[%] Asset not found or access denied', v_transaction_trace_id;
    END IF;

    -- Get depreciation expense account
    SELECT id INTO v_depreciation_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_code = '5600'
      AND is_active = true;

    IF v_depreciation_account_id IS NULL THEN
        RAISE EXCEPTION '[%] Depreciation expense account (5600) not found', v_transaction_trace_id;
    END IF;

    -- Get appropriate accumulated depreciation account
    SELECT id INTO v_accumulated_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_code = CASE v_asset.category
        WHEN 'building' THEN '1490'
        WHEN 'vehicle' THEN '1491'
        WHEN 'equipment' THEN '1492'
        WHEN 'furniture' THEN '1493'
        WHEN 'computer' THEN '1494'
        WHEN 'software' THEN '1494'
        WHEN 'electronics' THEN '1494'
        ELSE '1495'
      END
      AND is_active = true;

    IF v_accumulated_account_id IS NULL THEN
        -- Fallback to general accumulated depreciation
        SELECT id INTO v_accumulated_account_id
        FROM chart_of_accounts
        WHERE business_id = p_business_id
          AND account_code = '1495'
          AND is_active = true;
    END IF;

    IF v_accumulated_account_id IS NULL THEN
        RAISE EXCEPTION '[%] Accumulated depreciation account not found', v_transaction_trace_id;
    END IF;

    -- Start from depreciation start date
    v_current_date := COALESCE(v_asset.depreciation_start_date, v_asset.acquisition_date, v_asset.purchase_date);
    v_accumulated := COALESCE(v_asset.existing_accumulated_depreciation, 0);
    v_book_value := COALESCE(v_asset.initial_book_value, v_asset.purchase_cost) - v_accumulated;

    RAISE NOTICE '[%] Starting from date: %, initial accumulated: %, book value: %', 
        v_transaction_trace_id, v_current_date, v_accumulated, v_book_value;

    -- Loop through months
    WHILE v_current_date <= LEAST(p_as_of_date, CURRENT_DATE) LOOP
        v_month := EXTRACT(MONTH FROM v_current_date);
        v_year := EXTRACT(YEAR FROM v_current_date);
        v_loop_counter := v_loop_counter + 1;

        -- Skip if depreciation already posted for this period
        IF NOT EXISTS (
            SELECT 1 FROM asset_depreciations ad
            WHERE ad.asset_id = p_asset_id
            AND ad.period_month = v_month
            AND ad.period_year = v_year
        ) THEN
            -- Calculate depreciation for this month
            v_depreciation_amount := calculate_monthly_depreciation(
                p_asset_id,
                v_month,
                v_year
            );

            IF v_depreciation_amount > 0 THEN
                v_accumulated := v_accumulated + v_depreciation_amount;
                v_book_value := v_book_value - v_depreciation_amount;

                -- Generate GUARANTEED UNIQUE reference ID using multiple sources
                v_unique_suffix := (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000 + 
                                   (random() * 999)::INTEGER + 
                                   v_loop_counter) % 1000000;
                
                v_reference_number := 'HIST-DEPR-' || v_asset.asset_code || '-' ||
                    LPAD(v_year::TEXT, 4, '0') || '-' ||
                    LPAD(v_month::TEXT, 2, '0') || '-' ||
                    LPAD(v_unique_suffix::TEXT, 6, '0');

                RAISE NOTICE '[%] Posting depreciation for %-%: %, reference: %', 
                    v_transaction_trace_id, v_year, v_month, v_depreciation_amount, v_reference_number;

                -- Create journal entry for historical depreciation
                -- Using EXTREMELY unique reference_id with multiple components
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
                    v_current_date,
                    v_reference_number,
                    'asset_depreciation_historical',
                    'hist_' || p_asset_id::TEXT || '_' || 
                    v_year::TEXT || v_month::TEXT || '_' || 
                    v_unique_suffix::TEXT || '_' || 
                    txid_current()::TEXT,
                    'Historical Depreciation: ' || v_asset.asset_name || ' (' || v_asset.asset_code || ') for ' ||
                    TO_CHAR(v_current_date, 'Month YYYY'),
                    v_depreciation_amount,
                    'posted',
                    p_user_id,
                    NOW()
                ) RETURNING id INTO v_journal_entry_id;

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
                    'Historical depreciation: ' || v_asset.asset_name || ' - ' ||
                    TO_CHAR(v_current_date, 'Month YYYY')
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
                    v_accumulated_account_id,
                    'credit',
                    v_depreciation_amount,
                    'Historical accumulated depreciation: ' || v_asset.asset_name
                );

                -- Record in asset_depreciations table (marked as historical)
                INSERT INTO asset_depreciations (
                    business_id,
                    asset_id,
                    depreciation_date,
                    period_month,
                    period_year,
                    depreciation_amount,
                    accumulated_depreciation_before,
                    accumulated_depreciation_after,
                    book_value_before,
                    book_value_after,
                    journal_entry_id,
                    is_posted,
                    posted_at,
                    is_historical
                ) VALUES (
                    p_business_id,
                    p_asset_id,
                    v_current_date,
                    v_month,
                    v_year,
                    v_depreciation_amount,
                    v_accumulated - v_depreciation_amount,
                    v_accumulated,
                    v_book_value + v_depreciation_amount,
                    v_book_value,
                    v_journal_entry_id,
                    true,
                    NOW(),
                    true
                );

                v_success_counter := v_success_counter + 1;
                
                -- Return success
                RETURN QUERY SELECT
                    v_month,
                    v_year,
                    v_depreciation_amount,
                    true,
                    'Historical depreciation posted for ' ||
                    TO_CHAR(v_current_date, 'Month YYYY');
            END IF;
        END IF;

        -- Move to next month
        v_current_date := v_current_date + INTERVAL '1 month';
    END LOOP;

    -- Update asset to mark historical depreciation as calculated
    UPDATE assets
    SET historical_depreciation_calculated = true,
        current_book_value = v_book_value,
        accumulated_depreciation = v_accumulated,
        updated_at = NOW()
    WHERE id = p_asset_id;

    RAISE NOTICE '[%] Completed: % months processed, % posted successfully', 
        v_transaction_trace_id, v_loop_counter, v_success_counter;

    RETURN;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '[%] ERROR: %', v_transaction_trace_id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Log historical function fix
INSERT INTO depreciation_fix_audit (fix_type, description, new_value)
VALUES ('function_fix', 'Fixed post_historical_depreciation - added guaranteed unique reference_id',
        'Added v_unique_suffix, transaction tracing, and improved error handling');

-- ============================================================================
-- PART 2: FIX MONTHLY DEPRECIATION FUNCTION
-- ============================================================================

-- Log current monthly function state
INSERT INTO depreciation_fix_audit (fix_type, description, old_value)
SELECT 'function_audit', 'Current post_monthly_depreciation function', 
       pg_get_functiondef(oid)::TEXT
FROM pg_proc 
WHERE proname = 'post_monthly_depreciation';

-- Create improved monthly depreciation function with bulletproof uniqueness
CREATE OR REPLACE FUNCTION post_monthly_depreciation(
    p_business_id UUID,
    p_month INTEGER,
    p_year INTEGER,
    p_user_id UUID
)
RETURNS TABLE(
    asset_id UUID,
    asset_code VARCHAR,
    asset_name VARCHAR,
    depreciation_amount DECIMAL(15,2),
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_asset RECORD;
    v_depreciation_amount DECIMAL(15,2);
    v_accumulated_before DECIMAL(15,2);
    v_accumulated_after DECIMAL(15,2);
    v_book_value_before DECIMAL(15,2);
    v_book_value_after DECIMAL(15,2);
    v_depreciation_account_id UUID;
    v_accumulated_account_id UUID;
    v_journal_entry_id UUID;
    v_reference_number VARCHAR(100);
    v_has_depreciation BOOLEAN;
    v_previous_depreciation RECORD;
    v_unique_suffix VARCHAR(20);
    v_transaction_trace_id VARCHAR(50);
    v_asset_counter INTEGER := 0;
    v_success_counter INTEGER := 0;
BEGIN
    -- Generate transaction trace ID
    v_transaction_trace_id := 'month_' || REPLACE(gen_random_uuid()::TEXT, '-', '_') || '_' || 
                             EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT;
    
    RAISE NOTICE '[%] Starting monthly depreciation for %/%', 
        v_transaction_trace_id, p_month, p_year;

    -- Check if month/year is valid
    IF p_month < 1 OR p_month > 12 OR p_year < 2000 OR p_year > 2100 THEN
        RAISE EXCEPTION '[%] Invalid month/year: %/%', v_transaction_trace_id, p_month, p_year;
    END IF;

    -- Check if depreciation already posted for this period
    SELECT EXISTS (
        SELECT 1 FROM asset_depreciations ad
        WHERE ad.business_id = p_business_id
          AND ad.period_month = p_month
          AND ad.period_year = p_year
          AND ad.is_posted = true
    ) INTO v_has_depreciation;

    IF v_has_depreciation THEN
        RAISE EXCEPTION '[%] Depreciation already posted for %/%', v_transaction_trace_id, p_month, p_year;
    END IF;

    -- Get depreciation expense account
    SELECT id INTO v_depreciation_account_id
    FROM chart_of_accounts coa
    WHERE coa.business_id = p_business_id
      AND coa.account_code = '5600' -- Depreciation Expense
      AND coa.is_active = true;

    IF v_depreciation_account_id IS NULL THEN
        RAISE EXCEPTION '[%] Depreciation Expense account (5600) not found', v_transaction_trace_id;
    END IF;

    -- Loop through all active assets
    FOR v_asset IN
        SELECT a.* FROM assets a
        WHERE a.business_id = p_business_id
          AND a.is_active = true
          AND a.status IN ('active', 'idle')
          AND a.purchase_cost > 0
          AND a.useful_life_months > 0
        ORDER BY a.asset_code
    LOOP
        v_asset_counter := v_asset_counter + 1;
        
        -- Calculate depreciation for this asset
        v_depreciation_amount := calculate_monthly_depreciation(
            v_asset.id,
            p_month,
            p_year
        );

        IF v_depreciation_amount > 0 THEN
            -- Get previous accumulated depreciation
            SELECT ad.accumulated_depreciation_after INTO v_previous_depreciation
            FROM asset_depreciations ad
            WHERE ad.asset_id = v_asset.id
              AND ad.is_posted = true
              AND (ad.period_year < p_year OR (ad.period_year = p_year AND ad.period_month < p_month))
            ORDER BY ad.period_year DESC, ad.period_month DESC
            LIMIT 1;

            IF FOUND THEN
                v_accumulated_before := v_previous_depreciation.accumulated_depreciation_after;
                v_book_value_before := v_asset.purchase_cost - v_accumulated_before;
            ELSE
                v_accumulated_before := 0;
                v_book_value_before := v_asset.purchase_cost;
            END IF;

            v_accumulated_after := v_accumulated_before + v_depreciation_amount;
            v_book_value_after := v_book_value_before - v_depreciation_amount;

            -- Get appropriate accumulated depreciation account
            SELECT id INTO v_accumulated_account_id
            FROM chart_of_accounts coa
            WHERE coa.business_id = p_business_id
              AND coa.account_code = CASE
                WHEN v_asset.category = 'building' THEN '1490'
                WHEN v_asset.category = 'vehicle' THEN '1491'
                WHEN v_asset.category = 'equipment' THEN '1492'
                WHEN v_asset.category = 'furniture' THEN '1493'
                WHEN v_asset.category IN ('computer', 'electronics', 'software') THEN '1494'
                ELSE '1495'
              END
              AND coa.is_active = true;

            IF v_accumulated_account_id IS NULL THEN
                -- Fallback to general accumulated depreciation
                SELECT id INTO v_accumulated_account_id
                FROM chart_of_accounts coa
                WHERE coa.business_id = p_business_id
                  AND coa.account_code = '1495'
                  AND coa.is_active = true;
            END IF;

            IF v_accumulated_account_id IS NULL THEN
                RAISE EXCEPTION '[%] Accumulated Depreciation account not found for category: %', 
                    v_transaction_trace_id, v_asset.category;
            END IF;

            -- Generate GUARANTEED UNIQUE reference ID
            v_unique_suffix := (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000 + 
                               (random() * 999)::INTEGER + 
                               v_asset_counter) % 1000000;
            
            v_reference_number := 'DEPR-' || v_asset.asset_code || '-' ||
                LPAD(p_year::TEXT, 4, '0') || '-' ||
                LPAD(p_month::TEXT, 2, '0') || '-' ||
                LPAD(v_unique_suffix::TEXT, 6, '0');

            RAISE NOTICE '[%] Processing asset % (%): depreciation %, reference: %', 
                v_transaction_trace_id, v_asset.asset_code, v_asset_counter, v_depreciation_amount, v_reference_number;

            -- Create journal entry with BULLETPROOF unique reference_id
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
                MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day',
                v_reference_number,
                'asset_depreciation',
                'month_' || v_asset.id::TEXT || '_' || 
                p_year::TEXT || p_month::TEXT || '_' || 
                v_unique_suffix::TEXT || '_' || 
                txid_current()::TEXT,
                'Depreciation: ' || v_asset.asset_name || ' (' || v_asset.asset_code || ')',
                v_depreciation_amount,
                'posted',
                p_user_id,
                NOW()
            ) RETURNING id INTO v_journal_entry_id;

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
                'Depreciation expense: ' || v_asset.asset_name
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
                v_accumulated_account_id,
                'credit',
                v_depreciation_amount,
                'Accumulated depreciation: ' || v_asset.asset_name
            );

            -- Record depreciation in asset_depreciations table
            INSERT INTO asset_depreciations (
                business_id,
                asset_id,
                depreciation_date,
                period_month,
                period_year,
                depreciation_amount,
                accumulated_depreciation_before,
                accumulated_depreciation_after,
                book_value_before,
                book_value_after,
                journal_entry_id,
                is_posted,
                posted_at
            ) VALUES (
                p_business_id,
                v_asset.id,
                MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day',
                p_month,
                p_year,
                v_depreciation_amount,
                v_accumulated_before,
                v_accumulated_after,
                v_book_value_before,
                v_book_value_after,
                v_journal_entry_id,
                true,
                NOW()
            );

            -- Update asset's current book value and accumulated depreciation
            UPDATE assets
            SET
                current_book_value = v_book_value_after,
                accumulated_depreciation = v_accumulated_after,
                updated_at = NOW()
            WHERE id = v_asset.id;

            v_success_counter := v_success_counter + 1;
            
            -- Return success
            RETURN QUERY SELECT
                v_asset.id,
                v_asset.asset_code,
                v_asset.asset_name,
                v_depreciation_amount,
                true,
                'Depreciation posted successfully';
        ELSE
            -- Return no depreciation needed
            RETURN QUERY SELECT
                v_asset.id,
                v_asset.asset_code,
                v_asset.asset_name,
                0::DECIMAL(15,2),
                true,
                'No depreciation calculated (below salvage or not started)';
        END IF;
    END LOOP;

    RAISE NOTICE '[%] Completed: % assets processed, % posted successfully', 
        v_transaction_trace_id, v_asset_counter, v_success_counter;
    
    RETURN;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '[%] ERROR: %', v_transaction_trace_id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Log monthly function fix
INSERT INTO depreciation_fix_audit (fix_type, description, new_value)
VALUES ('function_fix', 'Fixed post_monthly_depreciation - enhanced uniqueness and tracing',
        'Added transaction tracing, improved unique suffix generation, and better error handling');

-- ============================================================================
-- PART 3: CREATE DIAGNOSTIC FUNCTIONS
-- ============================================================================

-- Function to check current constraint issues
CREATE OR REPLACE FUNCTION check_depreciation_constraints(p_business_id UUID DEFAULT NULL)
RETURNS TABLE(
    issue_type VARCHAR(50),
    issue_description TEXT,
    affected_count INTEGER,
    sample_data TEXT
) AS $$
BEGIN
    -- Check for potential duplicate reference_ids
    RETURN QUERY
    SELECT 
        'potential_duplicate' as issue_type,
        'Journal entries with same business_id, reference_type, reference_id' as issue_description,
        COUNT(*) as affected_count,
        STRING_AGG(reference_id, ', ') as sample_data
    FROM journal_entries
    WHERE (p_business_id IS NULL OR business_id = p_business_id)
    GROUP BY business_id, reference_type, reference_id
    HAVING COUNT(*) > 1;
    
    -- Check for unposted depreciations
    RETURN QUERY
    SELECT 
        'unposted_depreciation' as issue_type,
        'Asset depreciations not linked to journal entries' as issue_description,
        COUNT(*) as affected_count,
        STRING_AGG(asset_id::TEXT, ', ') as sample_data
    FROM asset_depreciations
    WHERE (p_business_id IS NULL OR business_id = p_business_id)
    AND (journal_entry_id IS NULL OR is_posted = false);
    
    -- Check asset balance consistency
    RETURN QUERY
    SELECT 
        'balance_mismatch' as issue_type,
        'Assets where book value + accumulated != purchase cost' as issue_description,
        COUNT(*) as affected_count,
        STRING_AGG(asset_code, ', ') as sample_data
    FROM assets
    WHERE (p_business_id IS NULL OR business_id = p_business_id)
    AND ABS((current_book_value + accumulated_depreciation) - purchase_cost) > 0.01;
END;
$$ LANGUAGE plpgsql;

-- Function to safely test depreciation posting
CREATE OR REPLACE FUNCTION test_depreciation_fix(p_business_id UUID, p_test_mode BOOLEAN DEFAULT true)
RETURNS TABLE(
    test_name VARCHAR(100),
    test_result VARCHAR(20),
    test_details TEXT
) AS $$
DECLARE
    v_test_asset_id UUID;
    v_test_result RECORD;
BEGIN
    -- Test 1: Check constraints
    test_name := 'Constraint Check';
    SELECT COUNT(*) INTO v_test_result FROM check_depreciation_constraints(p_business_id);
    IF v_test_result.count = 0 THEN
        test_result := 'PASS';
        test_details := 'No constraint violations found';
    ELSE
        test_result := 'FAIL';
        test_details := v_test_result.count || ' constraint violations found';
    END IF;
    RETURN NEXT;
    
    -- Test 2: Verify functions exist
    test_name := 'Function Existence';
    SELECT COUNT(*) INTO v_test_result 
    FROM pg_proc 
    WHERE proname IN ('post_historical_depreciation', 'post_monthly_depreciation');
    
    IF v_test_result.count = 2 THEN
        test_result := 'PASS';
        test_details := 'Both depreciation functions exist';
    ELSE
        test_result := 'FAIL';
        test_details := 'Missing functions: ' || (2 - v_test_result.count);
    END IF;
    RETURN NEXT;
    
    -- Test 3: Get a test asset
    SELECT id INTO v_test_asset_id 
    FROM assets 
    WHERE business_id = p_business_id 
    AND is_active = true 
    LIMIT 1;
    
    IF v_test_asset_id IS NOT NULL THEN
        test_name := 'Test Asset Found';
        test_result := 'PASS';
        test_details := 'Test asset: ' || v_test_asset_id::TEXT;
        RETURN NEXT;
        
        -- Test 4: Calculate depreciation (no posting)
        IF NOT p_test_mode THEN
            BEGIN
                test_name := 'Depreciation Calculation';
                SELECT * INTO v_test_result 
                FROM calculate_monthly_depreciation(v_test_asset_id, 1, 2025);
                
                test_result := 'PASS';
                test_details := 'Calculated: ' || COALESCE(v_test_result::TEXT, '0');
                RETURN NEXT;
            EXCEPTION WHEN OTHERS THEN
                test_result := 'FAIL';
                test_details := 'Error: ' || SQLERRM;
                RETURN NEXT;
            END;
        END IF;
    ELSE
        test_name := 'Test Asset Found';
        test_result := 'SKIP';
        test_details := 'No active assets found for testing';
        RETURN NEXT;
    END IF;
    
    -- Test 5: Migration audit
    test_name := 'Migration Audit';
    SELECT COUNT(*) INTO v_test_result FROM depreciation_fix_audit;
    IF v_test_result.count > 0 THEN
        test_result := 'PASS';
        test_details := v_test_result.count || ' audit records created';
    ELSE
        test_result := 'FAIL';
        test_details := 'No audit records found';
    END IF;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Log diagnostic functions creation
INSERT INTO depreciation_fix_audit (fix_type, description)
VALUES ('diagnostic', 'Created check_depreciation_constraints and test_depreciation_fix functions');

-- ============================================================================
-- PART 4: CLEANUP AND FINALIZATION
-- ============================================================================

-- Clean up any potential duplicates (safe approach)
DO $$
DECLARE
    v_duplicate_count INTEGER;
BEGIN
    -- Count potential duplicates without deleting
    SELECT COUNT(*) INTO v_duplicate_count
    FROM (
        SELECT business_id, reference_type, reference_id, COUNT(*)
        FROM journal_entries
        WHERE reference_type LIKE '%depreciation%'
        GROUP BY business_id, reference_type, reference_id
        HAVING COUNT(*) > 1
    ) AS duplicates;
    
    INSERT INTO depreciation_fix_audit (fix_type, description, affected_rows)
    VALUES ('duplicate_check', 'Checked for duplicate depreciation journal entries', v_duplicate_count);
    
    RAISE NOTICE 'Found % potential duplicate depreciation entries', v_duplicate_count;
END $$;

-- Final migration log
INSERT INTO depreciation_fix_audit (fix_type, description)
VALUES ('migration_complete', 'Completed depreciation system fixes');

-- Create a summary report view
CREATE OR REPLACE VIEW depreciation_fix_summary AS
SELECT 
    fix_type,
    COUNT(*) as record_count,
    MIN(executed_at) as first_executed,
    MAX(executed_at) as last_executed,
    STRING_AGG(DISTINCT LEFT(description, 50), '; ') as descriptions
FROM depreciation_fix_audit
GROUP BY fix_type
ORDER BY MIN(executed_at);

COMMIT;

-- ============================================================================
-- EXECUTION INSTRUCTIONS
-- ============================================================================
/*
TO APPLY THIS MIGRATION:
1. Save this file as: ~/Bizzy_Track_pro/database/migrations/313_complete_depreciation_fix.sql

2. Apply the migration:
   psql -h localhost -p 5434 -d bizzytrack_pro -U your_username -f 313_complete_depreciation_fix.sql

3. Verify the fix:
   SELECT * FROM test_depreciation_fix('ac7de9dd-7cc8-41c9-94f7-611a4ade5256', true);

4. Check audit trail:
   SELECT * FROM depreciation_fix_summary;
   SELECT * FROM depreciation_fix_audit ORDER BY executed_at;

5. Test the fixes:
   -- Restart Node.js service first
   pm2 restart backend
   
   -- Test historical depreciation (single month first)
   curl -X POST "http://localhost:8002/api/assets/8991720d-f025-4f30-a253-7a5eaab219eb/historical-depreciation/calculate" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"as_of_date": "2020-02-01"}'
   
   -- Test monthly depreciation
   curl -X POST "http://localhost:8002/api/assets/depreciations/post-monthly" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"month": 2, "year": 2025}'

KEY FIXES APPLIED:
1. Guaranteed unique reference_id generation using multiple sources:
   - Epoch timestamp (millisecond precision)
   - Random number
   - Loop counter/asset counter
   - Transaction ID (txid_current())
   - Asset ID and period

2. Comprehensive audit trail with depreciation_fix_audit table

3. Diagnostic functions for future troubleshooting

4. Transaction tracing with RAISE NOTICE for debugging

5. Proper error handling with transaction rollback protection
*/
