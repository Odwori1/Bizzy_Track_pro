-- =====================================================
-- FIX: Period Closing Functions (Matching Actual Schema)
-- Date: 2026-05-08
-- =====================================================

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS create_accounting_period(UUID, VARCHAR, VARCHAR, DATE, DATE, UUID);
DROP FUNCTION IF EXISTS close_accounting_period(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS reopen_accounting_period(UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS get_current_period(UUID, DATE);

-- =====================================================
-- FUNCTION 1: Get Current Open Period
-- =====================================================
CREATE OR REPLACE FUNCTION get_current_period(
    p_business_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    period_id UUID,
    period_name VARCHAR(50),
    period_type VARCHAR(20),
    start_date DATE,
    end_date DATE,
    status VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ap.id,
        ap.period_name,
        ap.period_type,
        ap.start_date,
        ap.end_date,
        ap.status
    FROM accounting_periods ap
    WHERE ap.business_id = p_business_id
        AND p_as_of_date BETWEEN ap.start_date AND ap.end_date
        AND ap.status = 'OPEN'
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION 2: Create Accounting Period (NO created_by)
-- =====================================================
CREATE OR REPLACE FUNCTION create_accounting_period(
    p_business_id UUID,
    p_period_name VARCHAR(50),
    p_period_type VARCHAR(20),
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE(
    success BOOLEAN,
    period_id UUID,
    message TEXT
) AS $$
DECLARE
    v_period_id UUID;
    v_overlap_exists BOOLEAN;
BEGIN
    -- Validate period type
    IF p_period_type NOT IN ('MONTHLY', 'QUARTERLY', 'YEARLY') THEN
        success := FALSE;
        period_id := NULL;
        message := 'Invalid period_type. Must be MONTHLY, QUARTERLY, or YEARLY';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Validate dates
    IF p_start_date > p_end_date THEN
        success := FALSE;
        period_id := NULL;
        message := 'Start date must be before or equal to end date';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Check for overlapping periods
    SELECT EXISTS(
        SELECT 1 FROM accounting_periods
        WHERE business_id = p_business_id
            AND status = 'OPEN'
            AND (start_date, end_date) OVERLAPS (p_start_date, p_end_date)
    ) INTO v_overlap_exists;
    
    IF v_overlap_exists THEN
        success := FALSE;
        period_id := NULL;
        message := 'Period overlaps with an existing open period';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Create the period (created_at will auto-set, no created_by column)
    INSERT INTO accounting_periods (
        business_id, period_name, period_type, start_date, end_date, status
    ) VALUES (
        p_business_id, p_period_name, p_period_type, p_start_date, p_end_date, 'OPEN'
    )
    RETURNING id INTO v_period_id;
    
    success := TRUE;
    period_id := v_period_id;
    message := 'Accounting period created successfully';
    RETURN NEXT;
    
EXCEPTION
    WHEN unique_violation THEN
        success := FALSE;
        period_id := NULL;
        message := 'A period with this name already exists for this business';
        RETURN NEXT;
    WHEN OTHERS THEN
        success := FALSE;
        period_id := NULL;
        message := 'Error creating period: ' || SQLERRM;
        RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION 3: Close Accounting Period
-- =====================================================
CREATE OR REPLACE FUNCTION close_accounting_period(
    p_business_id UUID,
    p_period_id UUID,
    p_closed_by UUID
)
RETURNS TABLE(
    success BOOLEAN,
    journal_entry_id UUID,
    message TEXT
) AS $$
DECLARE
    v_period RECORD;
    v_journal_entry_id UUID;
    v_revenue_total NUMERIC := 0;
    v_expense_total NUMERIC := 0;
    v_net_income NUMERIC := 0;
    v_reference_number VARCHAR(50);
    v_retained_earnings_id UUID;
    v_row_count INTEGER;
BEGIN
    -- Get period details
    SELECT * INTO v_period
    FROM accounting_periods
    WHERE id = p_period_id AND business_id = p_business_id;
    
    IF NOT FOUND THEN
        success := FALSE;
        journal_entry_id := NULL;
        message := 'Period not found';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Check if period is already closed
    IF v_period.status != 'OPEN' THEN
        success := FALSE;
        journal_entry_id := NULL;
        message := 'Period is already ' || v_period.status;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Get Retained Earnings account ID (3300)
    SELECT id INTO v_retained_earnings_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id AND account_code = '3300';
    
    IF v_retained_earnings_id IS NULL THEN
        success := FALSE;
        journal_entry_id := NULL;
        message := 'Retained Earnings account (3300) not found. Please run chart of accounts setup.';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Calculate revenue total for the period
    SELECT COALESCE(SUM(
        CASE 
            WHEN a.account_type IN ('revenue', 'income') THEN
                CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
            ELSE 0
        END
    ), 0) INTO v_revenue_total
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts a ON jel.account_id = a.id
    WHERE je.business_id = p_business_id
        AND je.journal_date BETWEEN v_period.start_date AND v_period.end_date
        AND je.status = 'posted'
        AND je.voided_at IS NULL
        AND a.account_type IN ('revenue', 'income');
    
    -- Calculate expense total for the period
    SELECT COALESCE(SUM(
        CASE 
            WHEN a.account_type IN ('expense', 'cogs') THEN
                CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
            ELSE 0
        END
    ), 0) INTO v_expense_total
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts a ON jel.account_id = a.id
    WHERE je.business_id = p_business_id
        AND je.journal_date BETWEEN v_period.start_date AND v_period.end_date
        AND je.status = 'posted'
        AND je.voided_at IS NULL
        AND a.account_type IN ('expense', 'cogs');
    
    v_net_income := v_revenue_total - v_expense_total;
    
    -- If no activity, just close the period
    IF v_net_income = 0 AND v_revenue_total = 0 AND v_expense_total = 0 THEN
        UPDATE accounting_periods
        SET 
            status = 'CLOSED',
            closed_by = p_closed_by,
            closed_at = NOW(),
            updated_at = NOW()
        WHERE id = p_period_id;
        
        success := TRUE;
        journal_entry_id := NULL;
        message := 'Period closed with no financial activity';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Create closing journal entry
    v_reference_number := 'CLOSE-' || TO_CHAR(v_period.end_date, 'YYYYMMDD');
    
    INSERT INTO journal_entries (
        business_id, journal_date, reference_number, reference_type, reference_id,
        description, total_amount, status, created_by, posted_at
    ) VALUES (
        p_business_id, 
        v_period.end_date, 
        v_reference_number, 
        'PERIOD_CLOSE', 
        v_reference_number,
        'Closing entries for period: ' || v_period.period_name || ' (' || TO_CHAR(v_period.start_date, 'YYYY-MM-DD') || ' to ' || TO_CHAR(v_period.end_date, 'YYYY-MM-DD') || ')',
        ABS(v_net_income), 
        'posted', 
        p_closed_by, 
        NOW()
    ) RETURNING id INTO v_journal_entry_id;
    
    -- Close Revenue accounts (debit to zero)
    IF v_revenue_total > 0 THEN
        INSERT INTO journal_entry_lines (journal_entry_id, business_id, account_id, line_type, amount, description)
        SELECT 
            v_journal_entry_id,
            p_business_id,
            a.id,
            'debit',
            SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END),
            'Closing revenue account: ' || a.account_name
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        JOIN chart_of_accounts a ON jel.account_id = a.id
        WHERE je.business_id = p_business_id
            AND je.journal_date BETWEEN v_period.start_date AND v_period.end_date
            AND je.status = 'posted'
            AND je.voided_at IS NULL
            AND a.account_type IN ('revenue', 'income')
        GROUP BY a.id, a.account_name
        HAVING SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END) != 0;
        
        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        
        -- Credit Retained Earnings for total revenue
        INSERT INTO journal_entry_lines (journal_entry_id, business_id, account_id, line_type, amount, description)
        VALUES (v_journal_entry_id, p_business_id, v_retained_earnings_id, 'credit', v_revenue_total, 'Transfer revenue to Retained Earnings');
    END IF;
    
    -- Close Expense accounts (credit to zero)
    IF v_expense_total > 0 THEN
        INSERT INTO journal_entry_lines (journal_entry_id, business_id, account_id, line_type, amount, description)
        SELECT 
            v_journal_entry_id,
            p_business_id,
            a.id,
            'credit',
            SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END),
            'Closing expense account: ' || a.account_name
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        JOIN chart_of_accounts a ON jel.account_id = a.id
        WHERE je.business_id = p_business_id
            AND je.journal_date BETWEEN v_period.start_date AND v_period.end_date
            AND je.status = 'posted'
            AND je.voided_at IS NULL
            AND a.account_type IN ('expense', 'cogs')
        GROUP BY a.id, a.account_name
        HAVING SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END) != 0;
        
        -- Debit Retained Earnings for total expenses
        INSERT INTO journal_entry_lines (journal_entry_id, business_id, account_id, line_type, amount, description)
        VALUES (v_journal_entry_id, p_business_id, v_retained_earnings_id, 'debit', v_expense_total, 'Transfer expenses to Retained Earnings');
    END IF;
    
    -- Record in closing_entries table (created_at auto-sets)
    INSERT INTO closing_entries (business_id, period_id, journal_entry_id, closing_type, amount, description)
    VALUES 
        (p_business_id, p_period_id, v_journal_entry_id, 'REVENUE_CLOSE', v_revenue_total, 'Revenue closed to Retained Earnings'),
        (p_business_id, p_period_id, v_journal_entry_id, 'EXPENSE_CLOSE', v_expense_total, 'Expenses closed to Retained Earnings');
    
    -- Update period status
    UPDATE accounting_periods
    SET 
        status = 'CLOSED',
        closed_by = p_closed_by,
        closed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_period_id;
    
    success := TRUE;
    journal_entry_id := v_journal_entry_id;
    message := format('Period closed successfully. Revenue: %s, Expenses: %s, Net Income: %s', 
                      v_revenue_total, v_expense_total, v_net_income);
    RETURN NEXT;
    
EXCEPTION
    WHEN OTHERS THEN
        success := FALSE;
        journal_entry_id := NULL;
        message := 'Error closing period: ' || SQLERRM;
        RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION 4: Reopen Accounting Period
-- =====================================================
CREATE OR REPLACE FUNCTION reopen_accounting_period(
    p_business_id UUID,
    p_period_id UUID,
    p_reopened_by UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_period RECORD;
BEGIN
    -- Get period details
    SELECT * INTO v_period
    FROM accounting_periods
    WHERE id = p_period_id AND business_id = p_business_id;
    
    IF NOT FOUND THEN
        success := FALSE;
        message := 'Period not found';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Only CLOSED periods can be reopened
    IF v_period.status != 'CLOSED' THEN
        success := FALSE;
        message := 'Only CLOSED periods can be reopened. Current status: ' || v_period.status;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Update period status back to OPEN
    UPDATE accounting_periods
    SET 
        status = 'OPEN',
        reopened_by = p_reopened_by,
        reopened_at = NOW(),
        reopening_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_period_id;
    
    success := TRUE;
    message := 'Period reopened successfully. You can now modify transactions in this period.';
    RETURN NEXT;
    
EXCEPTION
    WHEN OTHERS THEN
        success := FALSE;
        message := 'Error reopening period: ' || SQLERRM;
        RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION 5: Check Period Lock Before Transaction
-- =====================================================
CREATE OR REPLACE FUNCTION check_period_lock_before_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_period_status VARCHAR(20);
    v_transaction_date DATE;
BEGIN
    -- Determine transaction date based on table
    IF TG_TABLE_NAME = 'pos_transactions' THEN
        v_transaction_date := NEW.created_at::DATE;
    ELSIF TG_TABLE_NAME = 'journal_entries' THEN
        v_transaction_date := NEW.journal_date;
    ELSE
        RETURN NEW;
    END IF;
    
    -- Check if date falls in a closed or locked period
    SELECT ap.status INTO v_period_status
    FROM accounting_periods ap
    WHERE ap.business_id = NEW.business_id
        AND v_transaction_date BETWEEN ap.start_date AND ap.end_date
        AND ap.status != 'OPEN'
    LIMIT 1;
    
    IF v_period_status IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot modify transaction in % period (Date: %)', v_period_status, v_transaction_date
        USING HINT = 'Please reopen the period or change the transaction date';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Verification
-- =====================================================
DO $$
DECLARE
    functions_created TEXT[] := ARRAY[
        'get_current_period',
        'create_accounting_period',
        'close_accounting_period',
        'reopen_accounting_period',
        'check_period_lock_before_transaction'
    ];
    func_name TEXT;
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Phase 14 Functions Created (Fixed):';
    RAISE NOTICE '==========================================';
    
    FOREACH func_name IN ARRAY functions_created
    LOOP
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = func_name) THEN
            RAISE NOTICE '✅ %', func_name;
        ELSE
            RAISE NOTICE '❌ % (MISSING)', func_name;
        END IF;
    END LOOP;
    
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'No new tables or account codes created.';
    RAISE NOTICE 'Using existing Retained Earnings (3300).';
    RAISE NOTICE '==========================================';
END $$;
