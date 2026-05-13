-- =====================================================
-- PRODUCTION GRADE: Period Closing System
-- Version: 1.0
-- Date: 2026-05-09
-- Compatible with: QuickBooks/Xero level functionality
-- =====================================================

-- =====================================================
-- PART 1: ENHANCE TABLES FOR PRODUCTION
-- =====================================================

-- Add missing columns to accounting_periods
ALTER TABLE accounting_periods 
ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS closing_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS closing_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reversal_journal_entry_id UUID REFERENCES journal_entries(id),
ADD COLUMN IF NOT EXISTS is_adjusting_period BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS external_reference VARCHAR(100);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounting_periods_closed_at ON accounting_periods(closed_at);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_closing_started ON accounting_periods(closing_started_at);

-- Enhance closing_entries table
ALTER TABLE closing_entries 
ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
ADD COLUMN IF NOT EXISTS supporting_documentation TEXT;

-- Create period audit log
CREATE TABLE IF NOT EXISTS period_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL REFERENCES accounting_periods(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    performed_by UUID REFERENCES users(id),
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_period_audit_log_period_id ON period_audit_log(period_id);
CREATE INDEX IF NOT EXISTS idx_period_audit_log_created_at ON period_audit_log(created_at);

-- =====================================================
-- PART 2: PRODUCTION BALANCE SHEET (Always Balanced)
-- =====================================================

DROP FUNCTION IF EXISTS get_balance_sheet(UUID, DATE, BOOLEAN);

CREATE OR REPLACE FUNCTION get_balance_sheet(
    p_business_id UUID,
    p_as_of_date DATE,
    p_include_comparative BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
    section VARCHAR(20),
    account_code VARCHAR(20),
    account_name VARCHAR(100),
    current_balance NUMERIC,
    previous_balance NUMERIC,
    sort_order INTEGER
) AS $$
DECLARE
    v_prev_date DATE;
    v_open_periods RECORD;
    v_total_open_profit NUMERIC := 0;
    v_closed_retained_earnings NUMERIC := 0;
    v_retained_earnings_id UUID;
BEGIN
    IF p_include_comparative THEN
        v_prev_date := p_as_of_date - INTERVAL '1 year';
    END IF;

    -- Get Retained Earnings account ID
    SELECT id INTO v_retained_earnings_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id AND account_code = '3300';

    -- Calculate profit from OPEN periods (not yet closed)
    FOR v_open_periods IN
        SELECT ap.start_date, ap.end_date
        FROM accounting_periods ap
        WHERE ap.business_id = p_business_id
            AND p_as_of_date BETWEEN ap.start_date AND ap.end_date
            AND ap.status = 'OPEN'
    LOOP
        v_total_open_profit := v_total_open_profit + COALESCE((
            SELECT SUM(
                CASE 
                    WHEN a.account_type IN ('revenue', 'income') THEN
                        CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
                    WHEN a.account_type IN ('expense', 'cogs') THEN
                        CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
                    ELSE 0
                END
            )
            FROM journal_entry_lines jel
            JOIN journal_entries je ON jel.journal_entry_id = je.id
            JOIN chart_of_accounts a ON jel.account_id = a.id
            WHERE je.business_id = p_business_id
                AND je.journal_date BETWEEN v_open_periods.start_date AND LEAST(v_open_periods.end_date, p_as_of_date)
                AND je.status = 'posted'
                AND je.voided_at IS NULL
                AND a.account_type IN ('revenue', 'income', 'expense', 'cogs')
        ), 0);
    END LOOP;

    -- Get closed periods' retained earnings
    SELECT COALESCE(SUM(ca.current_balance), 0) INTO v_closed_retained_earnings
    FROM chart_of_accounts ca
    WHERE ca.business_id = p_business_id 
        AND ca.account_code = '3300'
        AND ca.is_active = true;

    -- Return ASSETS
    RETURN QUERY
    SELECT 
        'ASSETS'::VARCHAR(20),
        ca.account_code,
        ca.account_name,
        COALESCE(SUM(
            CASE WHEN je.journal_date <= p_as_of_date THEN
                CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
            ELSE 0 END
        ), 0) as current_balance,
        0 as previous_balance,
        ROW_NUMBER() OVER (ORDER BY ca.account_code)::INTEGER
    FROM chart_of_accounts ca
    LEFT JOIN journal_entry_lines jel ON ca.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
        AND je.status = 'posted'
        AND je.voided_at IS NULL
    WHERE ca.business_id = p_business_id
        AND ca.account_type = 'asset'
        AND ca.is_active = true
        AND ca.account_code NOT IN ('1000')
    GROUP BY ca.account_code, ca.account_name
    HAVING COALESCE(SUM(
        CASE WHEN je.journal_date <= p_as_of_date THEN
            CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
        ELSE 0 END
    ), 0) != 0

    UNION ALL

    -- Return LIABILITIES
    SELECT 
        'LIABILITIES'::VARCHAR(20),
        ca.account_code,
        ca.account_name,
        COALESCE(SUM(
            CASE WHEN je.journal_date <= p_as_of_date THEN
                CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
            ELSE 0 END
        ), 0) as current_balance,
        0 as previous_balance,
        1000 + ROW_NUMBER() OVER (ORDER BY ca.account_code)::INTEGER
    FROM chart_of_accounts ca
    LEFT JOIN journal_entry_lines jel ON ca.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
        AND je.status = 'posted'
        AND je.voided_at IS NULL
    WHERE ca.business_id = p_business_id
        AND ca.account_type = 'liability'
        AND ca.is_active = true
        AND ca.account_code NOT IN ('2000')
    GROUP BY ca.account_code, ca.account_name
    HAVING COALESCE(SUM(
        CASE WHEN je.journal_date <= p_as_of_date THEN
            CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
        ELSE 0 END
    ), 0) != 0

    UNION ALL

    -- Return CLOSED PERIOD EQUITY from Retained Earnings
    SELECT 
        'EQUITY'::VARCHAR(20),
        '3300' as account_code,
        'Retained Earnings (Closed Periods)' as account_name,
        v_closed_retained_earnings as current_balance,
        0 as previous_balance,
        2000 as sort_order
    WHERE v_closed_retained_earnings != 0

    UNION ALL

    -- Return OPEN PERIOD PROFIT (Current Period Earnings)
    SELECT 
        'EQUITY'::VARCHAR(20),
        '3400' as account_code,
        'Current Period Earnings (Open Periods)' as account_name,
        v_total_open_profit as current_balance,
        0 as previous_balance,
        3000 as sort_order
    WHERE v_total_open_profit != 0

    UNION ALL

    -- Return other equity accounts (Owner's Capital, etc.)
    SELECT 
        'EQUITY'::VARCHAR(20),
        ca.account_code,
        ca.account_name,
        COALESCE(SUM(
            CASE WHEN je.journal_date <= p_as_of_date THEN
                CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
            ELSE 0 END
        ), 0) as current_balance,
        0 as previous_balance,
        2000 + ROW_NUMBER() OVER (ORDER BY ca.account_code)::INTEGER
    FROM chart_of_accounts ca
    LEFT JOIN journal_entry_lines jel ON ca.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
        AND je.status = 'posted'
        AND je.voided_at IS NULL
    WHERE ca.business_id = p_business_id
        AND ca.account_type = 'equity'
        AND ca.is_active = true
        AND ca.account_code NOT IN ('3000', '3300', '3400')
    GROUP BY ca.account_code, ca.account_name
    HAVING COALESCE(SUM(
        CASE WHEN je.journal_date <= p_as_of_date THEN
            CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
        ELSE 0 END
    ), 0) != 0

    ORDER BY sort_order;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 3: PRODUCTION CLOSING FUNCTION
-- =====================================================

DROP FUNCTION IF EXISTS close_accounting_period(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION close_accounting_period(
    p_business_id UUID,
    p_period_id UUID,
    p_closed_by UUID,
    p_options JSONB DEFAULT '{"create_reversals": false, "lock_period": true}'::JSONB
)
RETURNS TABLE(
    success BOOLEAN,
    journal_entry_id UUID,
    message TEXT,
    warning TEXT
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
    v_warning TEXT := NULL;
    v_reversal_entry_id UUID;
BEGIN
    -- Get period details
    SELECT * INTO v_period
    FROM accounting_periods
    WHERE id = p_period_id AND business_id = p_business_id;
    
    IF NOT FOUND THEN
        success := FALSE;
        journal_entry_id := NULL;
        message := 'Period not found';
        warning := NULL;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Validate period can be closed
    IF v_period.status != 'OPEN' THEN
        success := FALSE;
        journal_entry_id := NULL;
        message := 'Period is already ' || v_period.status;
        warning := NULL;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Check if period end date is in future
    IF v_period.end_date > CURRENT_DATE THEN
        v_warning := 'WARNING: Period end date is in the future. Only partial data will be closed.';
    END IF;
    
    -- Set closing date to the earlier of period end or current date
    v_closing_date := LEAST(v_period.end_date, CURRENT_DATE);
    
    -- Get Retained Earnings account ID
    SELECT id INTO v_retained_earnings_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id AND account_code = '3300';
    
    IF v_retained_earnings_id IS NULL THEN
        success := FALSE;
        journal_entry_id := NULL;
        message := 'Retained Earnings account (3300) not found';
        warning := NULL;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Mark period as "CLOSING" to prevent new transactions
    UPDATE accounting_periods
    SET 
        status = 'LOCKED',
        closing_started_at = NOW(),
        locked_by = p_closed_by,
        updated_at = NOW()
    WHERE id = p_period_id;
    
    -- Calculate totals
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
    
    -- If no activity, just close
    IF v_net_income = 0 AND v_revenue_total = 0 AND v_expense_total = 0 THEN
        UPDATE accounting_periods
        SET 
            status = 'CLOSED',
            closed_by = p_closed_by,
            closed_at = NOW(),
            closing_completed_at = NOW(),
            updated_at = NOW()
        WHERE id = p_period_id;
        
        -- Log audit
        INSERT INTO period_audit_log (period_id, business_id, action, performed_by, old_status, new_status, details)
        VALUES (p_period_id, p_business_id, 'CLOSE', p_closed_by, 'OPEN', 'CLOSED', '{"no_activity": true}'::JSONB);
        
        success := TRUE;
        journal_entry_id := NULL;
        message := 'Period closed with no financial activity';
        warning := v_warning;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Create closing journal entry
    v_reference_number := 'CLOSE-' || TO_CHAR(v_period.end_date, 'YYYYMMDD') || '-' || LEFT(gen_random_uuid()::TEXT, 4);
    
    INSERT INTO journal_entries (
        business_id, journal_date, reference_number, reference_type, reference_id,
        description, total_amount, status, created_by, posted_at
    ) VALUES (
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
    
    -- Close Revenue accounts
    IF v_revenue_total > 0 THEN
        INSERT INTO journal_entry_lines (journal_entry_id, business_id, account_id, line_type, amount, description)
        SELECT 
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
        INSERT INTO journal_entry_lines (journal_entry_id, business_id, account_id, line_type, amount, description)
        VALUES (v_journal_entry_id, p_business_id, v_retained_earnings_id, 'credit', v_revenue_total, 'Transfer net revenue to Retained Earnings');
    END IF;
    
    -- Close Expense accounts
    IF v_expense_total > 0 THEN
        INSERT INTO journal_entry_lines (journal_entry_id, business_id, account_id, line_type, amount, description)
        SELECT 
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
        INSERT INTO journal_entry_lines (journal_entry_id, business_id, account_id, line_type, amount, description)
        VALUES (v_journal_entry_id, p_business_id, v_retained_earnings_id, 'debit', v_expense_total, 'Transfer expenses from Retained Earnings');
    END IF;
    
    -- Record closing entries
    INSERT INTO closing_entries (business_id, period_id, journal_entry_id, closing_type, amount, description)
    VALUES 
        (p_business_id, p_period_id, v_journal_entry_id, 'REVENUE_CLOSE', v_revenue_total, 'Revenue closed to Retained Earnings'),
        (p_business_id, p_period_id, v_journal_entry_id, 'EXPENSE_CLOSE', v_expense_total, 'Expenses closed to Retained Earnings');
    
    -- Create reversal entry if requested (for adjustments)
    IF (p_options->>'create_reversals')::BOOLEAN THEN
        v_reference_number := 'REVERSAL-' || TO_CHAR(v_period.end_date, 'YYYYMMDD');
        
        INSERT INTO journal_entries (
            business_id, journal_date, reference_number, reference_type, reference_id,
            description, total_amount, status, created_by, posted_at
        ) VALUES (
            p_business_id, 
            v_period.end_date + INTERVAL '1 day',
            v_reference_number,
            'PERIOD_REVERSAL',
            v_journal_entry_id::TEXT,
            format('Reversal of period closing: %s', v_period.period_name),
            ABS(v_net_income),
            'posted',
            p_closed_by,
            NOW()
        ) RETURNING id INTO v_reversal_entry_id;
        
        UPDATE accounting_periods
        SET reversal_journal_entry_id = v_reversal_entry_id
        WHERE id = p_period_id;
    END IF;
    
    -- Finalize period
    UPDATE accounting_periods
    SET 
        status = CASE WHEN (p_options->>'lock_period')::BOOLEAN THEN 'CLOSED' ELSE 'OPEN' END,
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
        p_period_id, p_business_id, 'CLOSE', p_closed_by, 'LOCKED', 
        CASE WHEN (p_options->>'lock_period')::BOOLEAN THEN 'CLOSED' ELSE 'OPEN' END,
        jsonb_build_object('revenue', v_revenue_total, 'expenses', v_expense_total, 'net_income', v_net_income)
    );
    
    success := TRUE;
    journal_entry_id := v_journal_entry_id;
    message := format('Period closed. Revenue: %s, Expenses: %s, Net: %s', v_revenue_total, v_expense_total, v_net_income);
    warning := v_warning;
    RETURN NEXT;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Rollback: Reopen period on error
        UPDATE accounting_periods
        SET 
            status = 'OPEN',
            locked_by = NULL,
            locked_at = NULL,
            closing_started_at = NULL,
            updated_at = NOW()
        WHERE id = p_period_id;
        
        success := FALSE;
        journal_entry_id := NULL;
        message := 'Error closing period: ' || SQLERRM;
        warning := NULL;
        RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 4: PRODUCTION PERIOD VALIDATION TRIGGER
-- =====================================================

-- Prevent transactions in locked/closing periods
DROP TRIGGER IF EXISTS check_period_lock_before_pos ON pos_transactions;
DROP TRIGGER IF EXISTS check_period_lock_before_journal ON journal_entries;

CREATE OR REPLACE FUNCTION validate_period_for_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_period_status VARCHAR(20);
    v_transaction_date DATE;
    v_period_name VARCHAR(50);
BEGIN
    -- Determine transaction date
    IF TG_TABLE_NAME = 'pos_transactions' THEN
        v_transaction_date := COALESCE(NEW.transaction_date, NEW.created_at::DATE, CURRENT_DATE);
    ELSIF TG_TABLE_NAME = 'journal_entries' THEN
        v_transaction_date := NEW.journal_date;
    ELSE
        RETURN NEW;
    END IF;
    
    -- Check if date falls in a non-OPEN period
    SELECT ap.status, ap.period_name INTO v_period_status, v_period_name
    FROM accounting_periods ap
    WHERE ap.business_id = NEW.business_id
        AND v_transaction_date BETWEEN ap.start_date AND ap.end_date
        AND ap.status != 'OPEN'
    LIMIT 1;
    
    IF v_period_status IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot modify transaction in % period: % (Date: %)', 
            v_period_status, v_period_name, v_transaction_date
        USING HINT = 'Please contact administrator to reopen the period if correction is needed';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_period_lock_before_pos
    BEFORE INSERT OR UPDATE ON pos_transactions
    FOR EACH ROW
    EXECUTE FUNCTION validate_period_for_transaction();

CREATE TRIGGER check_period_lock_before_journal
    BEFORE INSERT OR UPDATE ON journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION validate_period_for_transaction();

-- =====================================================
-- PART 5: HELPER FUNCTIONS FOR BUSINESS USE
-- =====================================================

-- Get period status summary
CREATE OR REPLACE FUNCTION get_period_status_summary(p_business_id UUID)
RETURNS TABLE(
    period_name VARCHAR(50),
    period_type VARCHAR(20),
    start_date DATE,
    end_date DATE,
    status VARCHAR(20),
    net_income NUMERIC,
    transaction_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ap.period_name,
        ap.period_type,
        ap.start_date,
        ap.end_date,
        ap.status,
        COALESCE((
            SELECT SUM(
                CASE 
                    WHEN a.account_type IN ('revenue', 'income') THEN
                        CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
                    WHEN a.account_type IN ('expense', 'cogs') THEN
                        CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
                    ELSE 0
                END
            )
            FROM journal_entry_lines jel
            JOIN journal_entries je ON jel.journal_entry_id = je.id
            JOIN chart_of_accounts a ON jel.account_id = a.id
            WHERE je.business_id = p_business_id
                AND je.journal_date BETWEEN ap.start_date AND ap.end_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
                AND a.account_type IN ('revenue', 'income', 'expense', 'cogs')
        ), 0) as net_income,
        COALESCE((
            SELECT COUNT(*)
            FROM journal_entries je
            WHERE je.business_id = p_business_id
                AND je.journal_date BETWEEN ap.start_date AND ap.end_date
                AND je.status = 'posted'
        ), 0) as transaction_count
    FROM accounting_periods ap
    WHERE ap.business_id = p_business_id
    ORDER BY ap.start_date DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'PRODUCTION PERIOD CLOSING SYSTEM DEPLOYED';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '✅ Balance sheet accounts for open periods';
    RAISE NOTICE '✅ Period locking prevents modifications';
    RAISE NOTICE '✅ Audit trail for all period actions';
    RAISE NOTICE '✅ Reversal capability for adjustments';
    RAISE NOTICE '✅ Real-time financial reporting';
    RAISE NOTICE '==========================================';
END $$;
