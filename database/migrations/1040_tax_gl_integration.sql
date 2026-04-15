-- ============================================================================
-- MIGRATION: 1040_tax_gl_integration.sql
-- PURPOSE: Post tax transactions to General Ledger
-- DEPENDS ON: 1020_opening_balance_system.sql
-- PATTERN: Follows 1015_refund_system_production_grade.sql
-- DATE: April 15, 2026
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: ADD INPUT VAT ACCOUNT (2125) IF MISSING
-- ============================================================================

DO $$
DECLARE
    v_business RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_business IN SELECT id FROM businesses LOOP
        IF NOT EXISTS (
            SELECT 1 FROM chart_of_accounts 
            WHERE business_id = v_business.id AND account_code = '2125'
        ) THEN
            INSERT INTO chart_of_accounts (
                id, business_id, account_code, account_name, account_type, is_active, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), v_business.id, '2125', 'Input VAT Receivable', 'asset', true, NOW(), NOW()
            );
            v_count := v_count + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Added Input VAT account (2125) to % businesses', v_count;
END $$;

-- ============================================================================
-- SECTION 2: POST SINGLE TAX TO GL FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS post_tax_to_gl(UUID, UUID);

CREATE OR REPLACE FUNCTION post_tax_to_gl(
    p_tax_transaction_id UUID,
    p_user_id UUID
)
RETURNS TABLE(success BOOLEAN, journal_entry_id UUID, message TEXT) AS $$
DECLARE
    v_tax RECORD;
    v_business_id UUID;
    v_tax_account_id UUID;
    v_journal_entry_id UUID;
    v_reference_number VARCHAR(100);
    v_error_message TEXT;
BEGIN
    -- Get tax transaction details
    SELECT 
        tt.*, 
        tt.transaction_id, 
        tt.transaction_type,
        tt.business_id,
        tt.tax_amount,
        tt.transaction_date,
        tt.created_by
    INTO v_tax
    FROM transaction_taxes tt
    WHERE tt.id = p_tax_transaction_id;
    
    IF NOT FOUND THEN
        success := FALSE;
        journal_entry_id := NULL;
        message := 'Tax transaction not found: ' || p_tax_transaction_id;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Check if already posted
    IF v_tax.is_posted_to_ledger = TRUE THEN
        success := FALSE;
        journal_entry_id := v_tax.journal_entry_id;
        message := 'Tax already posted to GL';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Determine tax account based on transaction type
    -- Sales/POS/Invoice -> Sales Tax Payable (2120) - Liability
    -- Purchases/Expenses -> Input VAT Receivable (2125) - Asset
    IF v_tax.transaction_type IN ('POS', 'INVOICE', 'SALE') THEN
        SELECT id INTO v_tax_account_id
        FROM chart_of_accounts
        WHERE business_id = v_tax.business_id
          AND account_code = '2120'
          AND is_active = true;
          
        IF v_tax_account_id IS NULL THEN
            success := FALSE;
            journal_entry_id := NULL;
            message := 'Sales Tax Payable account (2120) not found';
            RETURN NEXT;
            RETURN;
        END IF;
    ELSE
        SELECT id INTO v_tax_account_id
        FROM chart_of_accounts
        WHERE business_id = v_tax.business_id
          AND account_code = '2125'
          AND is_active = true;
          
        IF v_tax_account_id IS NULL THEN
            success := FALSE;
            journal_entry_id := NULL;
            message := 'Input VAT Receivable account (2125) not found';
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;
    
    -- Generate reference number
    v_reference_number := 'TAX-' || TO_CHAR(v_tax.transaction_date, 'YYYYMMDD') || '-' || 
                          SUBSTRING(p_tax_transaction_id::text, 1, 8);
    
    -- Create journal entry for tax
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
        v_tax.business_id, 
        v_tax.transaction_date, 
        v_reference_number,
        'TAX_POSTING', 
        p_tax_transaction_id::text,
        'Tax posting for ' || v_tax.transaction_type || ' transaction: ' || v_tax.tax_amount || ' ' || 
        CASE 
            WHEN v_tax.transaction_type IN ('POS', 'INVOICE', 'SALE') THEN 'Sales Tax Payable'
            ELSE 'Input VAT Receivable'
        END,
        v_tax.tax_amount, 
        'posted', 
        COALESCE(p_user_id, v_tax.created_by), 
        NOW()
    ) RETURNING id INTO v_journal_entry_id;
    
    -- Create journal entry line for tax
    -- Sales: Credit Tax Payable (increase liability)
    -- Purchases: Debit Input VAT (increase asset)
    IF v_tax.transaction_type IN ('POS', 'INVOICE', 'SALE') THEN
        INSERT INTO journal_entry_lines (
            journal_entry_id, 
            business_id, 
            account_id, 
            line_type, 
            amount, 
            description
        ) VALUES (
            v_journal_entry_id, 
            v_tax.business_id, 
            v_tax_account_id, 
            'credit',
            v_tax.tax_amount, 
            'Sales tax on ' || v_tax.transaction_type || ' transaction ' || v_tax.transaction_id
        );
    ELSE
        INSERT INTO journal_entry_lines (
            journal_entry_id, 
            business_id, 
            account_id, 
            line_type, 
            amount, 
            description
        ) VALUES (
            v_journal_entry_id, 
            v_tax.business_id, 
            v_tax_account_id, 
            'debit',
            v_tax.tax_amount, 
            'Input VAT on ' || v_tax.transaction_type || ' transaction ' || v_tax.transaction_id
        );
    END IF;
    
    -- Update tax transaction as posted
    UPDATE transaction_taxes
    SET is_posted_to_ledger = TRUE,
        journal_entry_id = v_journal_entry_id,
        updated_at = NOW()
    WHERE id = p_tax_transaction_id;
    
    -- Audit log
    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        new_values,
        created_at
    ) VALUES (
        v_tax.business_id,
        COALESCE(p_user_id, v_tax.created_by),
        'tax.posted_to_gl',
        'transaction_taxes',
        p_tax_transaction_id,
        jsonb_build_object(
            'journal_entry_id', v_journal_entry_id,
            'tax_amount', v_tax.tax_amount,
            'transaction_type', v_tax.transaction_type
        ),
        NOW()
    );
    
    success := TRUE;
    journal_entry_id := v_journal_entry_id;
    message := 'Tax posted to GL successfully with journal entry: ' || v_journal_entry_id;
    RETURN NEXT;
    
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    
    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        new_values,
        created_at
    ) VALUES (
        COALESCE(v_tax.business_id, '00000000-0000-0000-0000-000000000000'::UUID),
        COALESCE(p_user_id, v_tax.created_by, '00000000-0000-0000-0000-000000000000'::UUID),
        'tax.post_to_gl.error',
        'transaction_taxes',
        p_tax_transaction_id,
        jsonb_build_object('error', v_error_message, 'sqlstate', SQLSTATE),
        NOW()
    );
    
    success := FALSE;
    journal_entry_id := NULL;
    message := SQLERRM;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 3: BATCH POST TAXES FOR DATE RANGE
-- ============================================================================

DROP FUNCTION IF EXISTS post_all_taxes_for_period(UUID, DATE, DATE, UUID);

CREATE OR REPLACE FUNCTION post_all_taxes_for_period(
    p_business_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_user_id UUID
)
RETURNS TABLE(processed INTEGER, succeeded INTEGER, failed INTEGER, details TEXT) AS $$
DECLARE
    v_tax RECORD;
    v_result RECORD;
    v_processed INTEGER := 0;
    v_succeeded INTEGER := 0;
    v_failed INTEGER := 0;
    v_error_details TEXT := '';
BEGIN
    FOR v_tax IN
        SELECT id FROM transaction_taxes
        WHERE business_id = p_business_id
          AND transaction_date BETWEEN p_start_date AND p_end_date
          AND is_posted_to_ledger = FALSE
        ORDER BY transaction_date
    LOOP
        v_processed := v_processed + 1;
        
        SELECT * INTO v_result
        FROM post_tax_to_gl(v_tax.id, p_user_id);
        
        IF v_result.success THEN
            v_succeeded := v_succeeded + 1;
        ELSE
            v_failed := v_failed + 1;
            v_error_details := v_error_details || 'Tax ' || v_tax.id || ': ' || v_result.message || '; ';
        END IF;
    END LOOP;
    
    processed := v_processed;
    succeeded := v_succeeded;
    failed := v_failed;
    details := v_error_details;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 4: GET UNPOSTED TAXES
-- ============================================================================

DROP FUNCTION IF EXISTS get_unposted_taxes(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_unposted_taxes(
    p_business_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE(
    tax_id UUID,
    transaction_type VARCHAR(20),
    transaction_id UUID,
    transaction_date DATE,
    tax_type VARCHAR,
    taxable_amount NUMERIC(15,2),
    tax_rate NUMERIC(5,2),
    tax_amount NUMERIC(15,2),
    is_posted BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tt.id,
        tt.transaction_type,
        tt.transaction_id,
        tt.transaction_date,
        tt.tax_type_id::VARCHAR,
        tt.taxable_amount,
        tt.tax_rate,
        tt.tax_amount,
        tt.is_posted_to_ledger
    FROM transaction_taxes tt
    WHERE tt.business_id = p_business_id
      AND tt.is_posted_to_ledger = FALSE
      AND (p_start_date IS NULL OR tt.transaction_date >= p_start_date)
      AND (p_end_date IS NULL OR tt.transaction_date <= p_end_date)
    ORDER BY tt.transaction_date;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 5: TAX LIABILITY REPORT
-- ============================================================================

DROP FUNCTION IF EXISTS get_tax_liability_report(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_tax_liability_report(
    p_business_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE(
    tax_type VARCHAR(50),
    collected_amount NUMERIC(15,2),
    paid_amount NUMERIC(15,2),
    net_payable NUMERIC(15,2)
) AS $$
BEGIN
    RETURN QUERY
    WITH sales_tax AS (
        SELECT COALESCE(SUM(tax_amount), 0) as total
        FROM transaction_taxes
        WHERE business_id = p_business_id
          AND transaction_date BETWEEN p_start_date AND p_end_date
          AND transaction_type IN ('POS', 'INVOICE', 'SALE')
          AND is_posted_to_ledger = TRUE
    ),
    input_tax AS (
        SELECT COALESCE(SUM(tax_amount), 0) as total
        FROM transaction_taxes
        WHERE business_id = p_business_id
          AND transaction_date BETWEEN p_start_date AND p_end_date
          AND transaction_type NOT IN ('POS', 'INVOICE', 'SALE')
          AND is_posted_to_ledger = TRUE
    )
    SELECT 
        'VAT'::VARCHAR(50),
        (SELECT total FROM sales_tax) as collected_amount,
        (SELECT total FROM input_tax) as paid_amount,
        (SELECT total FROM sales_tax) - (SELECT total FROM input_tax) as net_payable;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 6: AUTO-POSTING TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_transaction_taxes_post ON transaction_taxes;
DROP FUNCTION IF EXISTS trigger_auto_tax_posting();

CREATE OR REPLACE FUNCTION trigger_auto_tax_posting()
RETURNS TRIGGER AS $$
DECLARE
    v_result RECORD;
BEGIN
    -- Only post when tax is not already posted
    IF NEW.is_posted_to_ledger = FALSE AND NEW.transaction_date IS NOT NULL THEN
        SELECT * INTO v_result
        FROM post_tax_to_gl(NEW.id, NEW.created_by);
        
        IF NOT v_result.success THEN
            RAISE WARNING 'Auto-posting failed for tax %: %', NEW.id, v_result.message;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_transaction_taxes_post
    AFTER INSERT ON transaction_taxes
    FOR EACH ROW
    EXECUTE FUNCTION trigger_auto_tax_posting();

-- ============================================================================
-- SECTION 7: BACKFILL EXISTING TAXES
-- ============================================================================

DO $$
DECLARE
    v_business RECORD;
    v_result RECORD;
    v_total_processed INTEGER := 0;
    v_total_succeeded INTEGER := 0;
    v_total_failed INTEGER := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'BACKFILLING EXISTING TAXES TO GL';
    RAISE NOTICE '========================================';
    
    FOR v_business IN SELECT id FROM businesses LOOP
        SELECT * INTO v_result
        FROM post_all_taxes_for_period(
            v_business.id,
            '2000-01-01'::DATE,
            CURRENT_DATE,
            NULL
        );
        
        v_total_processed := v_total_processed + v_result.processed;
        v_total_succeeded := v_total_succeeded + v_result.succeeded;
        v_total_failed := v_total_failed + v_result.failed;
        
        IF v_result.processed > 0 THEN
            RAISE NOTICE 'Business %: processed=%, succeeded=%, failed=%', 
                v_business.id, v_result.processed, v_result.succeeded, v_result.failed;
        END IF;
    END LOOP;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'BACKFILL COMPLETE';
    RAISE NOTICE 'Total processed: %', v_total_processed;
    RAISE NOTICE 'Total succeeded: %', v_total_succeeded;
    RAISE NOTICE 'Total failed: %', v_total_failed;
    RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- SECTION 8: VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_function_count INTEGER;
    v_trigger_exists BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO v_function_count
    FROM pg_proc
    WHERE proname IN (
        'post_tax_to_gl',
        'post_all_taxes_for_period',
        'get_unposted_taxes',
        'get_tax_liability_report'
    );
    
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_transaction_taxes_post'
    ) INTO v_trigger_exists;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TAX GL INTEGRATION INSTALLED';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Functions created: %/4', v_function_count;
    RAISE NOTICE 'Auto-post trigger active: %', v_trigger_exists;
    RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK SECTION
-- ============================================================================
/*
DROP TRIGGER IF EXISTS trigger_transaction_taxes_post ON transaction_taxes;
DROP FUNCTION IF EXISTS trigger_auto_tax_posting();
DROP FUNCTION IF EXISTS post_tax_to_gl(UUID, UUID);
DROP FUNCTION IF EXISTS post_all_taxes_for_period(UUID, DATE, DATE, UUID);
DROP FUNCTION IF EXISTS get_unposted_taxes(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS get_tax_liability_report(UUID, DATE, DATE);
-- Note: 2125 account removal requires separate ALTER if needed
*/
