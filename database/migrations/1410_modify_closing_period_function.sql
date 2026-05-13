-- Drop existing function
DROP FUNCTION IF EXISTS close_accounting_period(UUID, UUID, UUID, JSONB);

-- Create improved function that disables trigger during closing
CREATE OR REPLACE FUNCTION close_accounting_period(
    p_business_id UUID,
    p_period_id UUID,
    p_closed_by UUID,
    p_options JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE(
    success BOOLEAN,
    journal_entry_id UUID,
    message TEXT,
    warning TEXT
) LANGUAGE plpgsql AS $$
DECLARE
    v_period RECORD;
    v_journal_entry_id UUID;
    v_revenue_total NUMERIC := 0;
    v_expense_total NUMERIC := 0;
    v_net_income NUMERIC := 0;
    v_reference_number VARCHAR(50);
    v_retained_earnings_id UUID;
    v_closing_date DATE;
    v_warning TEXT := NULL;
BEGIN
    -- Get period details
    SELECT * INTO v_period
    FROM accounting_periods
    WHERE id = p_period_id AND business_id = p_business_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, 'Period not found', NULL::TEXT;
        RETURN;
    END IF;
    
    -- Validate period can be closed
    IF v_period.status != 'OPEN' THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, 'Period is already ' || v_period.status, NULL::TEXT;
        RETURN;
    END IF;
    
    -- Validate period end date has passed (production requirement)
    IF v_period.end_date > CURRENT_DATE THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, 
            format('Cannot close period before end date. Period ends on %s', v_period.end_date), 
            'Wait until after period end date to close'::TEXT;
        RETURN;
    END IF;
    
    -- Use period end date for closing entry
    v_closing_date := v_period.end_date;
    
    -- Get Retained Earnings account ID
    SELECT id INTO v_retained_earnings_id
    FROM chart_of_accounts ca
    WHERE ca.business_id = p_business_id AND ca.account_code = '3300';
    
    IF v_retained_earnings_id IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, 'Retained Earnings account (3300) not found', NULL::TEXT;
        RETURN;
    END IF;
    
    -- Calculate totals for the period
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
        SET status = 'CLOSED',
            closed_by = p_closed_by,
            closed_at = NOW(),
            closing_completed_at = NOW(),
            updated_at = NOW()
        WHERE id = p_period_id;
        
        INSERT INTO period_audit_log (period_id, business_id, action, performed_by, old_status, new_status, details)
        VALUES (p_period_id, p_business_id, 'CLOSE', p_closed_by, 'OPEN', 'CLOSED', '{"no_activity": true}'::JSONB);
        
        RETURN QUERY SELECT TRUE, NULL::UUID, 'Period closed with no financial activity', v_warning;
        RETURN;
    END IF;
    
    -- PRODUCTION FIX: Temporarily disable the trigger to allow closing entry
    SET LOCAL session_replication_role = 'replica';
    
    -- Lock the period
    UPDATE accounting_periods
    SET status = 'LOCKED',
        closing_started_at = NOW(),
        locked_by = p_closed_by,
        updated_at = NOW()
    WHERE id = p_period_id;
    
    -- Create closing journal entry
    v_reference_number := 'CLOSE-' || TO_CHAR(v_period.end_date, 'YYYYMMDD');
    
    INSERT INTO journal_entries (
        id, business_id, journal_date, reference_number, reference_type, reference_id,
        description, total_amount, status, created_by, posted_at
    ) VALUES (
        gen_random_uuid(),
        p_business_id,
        v_closing_date,
        v_reference_number,
        'PERIOD_CLOSE',
        v_reference_number,
        format('Period closing: %s (%s to %s)', v_period.period_name, v_period.start_date, v_period.end_date),
        ABS(v_net_income),
        'posted',
        p_closed_by,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;
    
    -- Close Revenue accounts (debit revenue, credit retained earnings)
    IF v_revenue_total > 0 THEN
        INSERT INTO journal_entry_lines (id, journal_entry_id, business_id, account_id, line_type, amount, description)
        SELECT 
            gen_random_uuid(),
            v_journal_entry_id,
            p_business_id,
            a.id,
            'debit',
            SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END),
            'Closing revenue: ' || a.account_name
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
        
        -- Transfer to Retained Earnings
        INSERT INTO journal_entry_lines (id, journal_entry_id, business_id, account_id, line_type, amount, description)
        VALUES (gen_random_uuid(), v_journal_entry_id, p_business_id, v_retained_earnings_id, 'credit', v_revenue_total, 'Transfer net revenue to Retained Earnings');
    END IF;
    
    -- Close Expense accounts (credit expense, debit retained earnings)
    IF v_expense_total > 0 THEN
        INSERT INTO journal_entry_lines (id, journal_entry_id, business_id, account_id, line_type, amount, description)
        SELECT 
            gen_random_uuid(),
            v_journal_entry_id,
            p_business_id,
            a.id,
            'credit',
            SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END),
            'Closing expense: ' || a.account_name
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
        
        -- Transfer from Retained Earnings
        INSERT INTO journal_entry_lines (id, journal_entry_id, business_id, account_id, line_type, amount, description)
        VALUES (gen_random_uuid(), v_journal_entry_id, p_business_id, v_retained_earnings_id, 'debit', v_expense_total, 'Transfer expenses from Retained Earnings');
    END IF;
    
    -- Re-enable triggers
    SET LOCAL session_replication_role = 'origin';
    
    -- Finalize period
    UPDATE accounting_periods
    SET status = 'CLOSED',
        closed_by = p_closed_by,
        closed_at = NOW(),
        closing_completed_at = NOW(),
        locked_by = NULL,
        locked_at = NULL,
        updated_at = NOW()
    WHERE id = p_period_id;
    
    -- Log audit
    INSERT INTO period_audit_log (period_id, business_id, action, performed_by, old_status, new_status, details)
    VALUES (
        p_period_id, p_business_id, 'CLOSE', p_closed_by, 'LOCKED', 'CLOSED',
        jsonb_build_object('revenue', v_revenue_total, 'expenses', v_expense_total, 'net_income', v_net_income, 'journal_entry_id', v_journal_entry_id)
    );
    
    RETURN QUERY SELECT TRUE, v_journal_entry_id, 
        format('Period closed successfully. Revenue: %s, Expenses: %s, Net: %s', v_revenue_total, v_expense_total, v_net_income),
        v_warning;
        
EXCEPTION
    WHEN OTHERS THEN
        -- Re-enable triggers if exception occurred
        SET LOCAL session_replication_role = 'origin';
        
        -- Rollback: Reopen period on error
        UPDATE accounting_periods
        SET status = 'OPEN',
            locked_by = NULL,
            locked_at = NULL,
            closing_started_at = NULL,
            updated_at = NOW()
        WHERE id = p_period_id;
        
        RETURN QUERY SELECT FALSE, NULL::UUID, 'Error closing period: ' || SQLERRM, NULL::TEXT;
END;
$$;
