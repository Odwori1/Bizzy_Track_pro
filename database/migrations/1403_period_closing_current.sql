-- Fix the close_accounting_period function to handle future dates
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
    v_closing_date DATE;
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
    
    -- Use the earlier of period end date or current date (can't post future dates)
    v_closing_date := LEAST(v_period.end_date, CURRENT_DATE);
    
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
    
    -- Calculate revenue total for the period (up to current date)
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
        AND je.journal_date BETWEEN v_period.start_date AND v_closing_date
        AND je.status = 'posted'
        AND je.voided_at IS NULL
        AND a.account_type IN ('revenue', 'income');
    
    -- Calculate expense total for the period (up to current date)
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
        AND je.journal_date BETWEEN v_period.start_date AND v_closing_date
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
    
    -- Create closing journal entry (using v_closing_date, not future date)
    v_reference_number := 'CLOSE-' || TO_CHAR(v_period.end_date, 'YYYYMMDD');
    
    INSERT INTO journal_entries (
        business_id, journal_date, reference_number, reference_type, reference_id,
        description, total_amount, status, created_by, posted_at
    ) VALUES (
        p_business_id, 
        v_closing_date,  -- FIXED: Use current date or period end (whichever is earlier)
        v_reference_number, 
        'PERIOD_CLOSE', 
        v_reference_number,
        'Closing entries for period: ' || v_period.period_name || ' (' || TO_CHAR(v_period.start_date, 'YYYY-MM-DD') || ' to ' || TO_CHAR(v_closing_date, 'YYYY-MM-DD') || ')',
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
            AND je.journal_date BETWEEN v_period.start_date AND v_closing_date
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
            AND je.journal_date BETWEEN v_period.start_date AND v_closing_date
            AND je.status = 'posted'
            AND je.voided_at IS NULL
            AND a.account_type IN ('expense', 'cogs')
        GROUP BY a.id, a.account_name
        HAVING SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END) != 0;
        
        -- Debit Retained Earnings for total expenses
        INSERT INTO journal_entry_lines (journal_entry_id, business_id, account_id, line_type, amount, description)
        VALUES (v_journal_entry_id, p_business_id, v_retained_earnings_id, 'debit', v_expense_total, 'Transfer expenses to Retained Earnings');
    END IF;
    
    -- Record in closing_entries table
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
    message := format('Period closed successfully. Closing Date: %s, Revenue: %s, Expenses: %s, Net Income: %s', 
                      v_closing_date, v_revenue_total, v_expense_total, v_net_income);
    RETURN NEXT;
    
EXCEPTION
    WHEN OTHERS THEN
        success := FALSE;
        journal_entry_id := NULL;
        message := 'Error closing period: ' || SQLERRM;
        RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
