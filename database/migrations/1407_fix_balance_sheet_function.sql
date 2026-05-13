-- =====================================================
-- PRODUCTION GRADE: Balance Sheet Function (FIXED)
-- Version: 2.1
-- Date: 2026-05-09
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
) LANGUAGE plpgsql AS $$
DECLARE
    -- P&L totals for current period
    v_total_revenue NUMERIC := 0;
    v_total_expenses NUMERIC := 0;
    v_net_income NUMERIC := 0;
    
    -- Retained earnings from closed periods
    v_retained_earnings NUMERIC := 0;
    
    -- Account IDs
    v_retained_earnings_id UUID;
BEGIN
    -- 1. Get Retained Earnings account ID (3300)
    SELECT ca.id INTO v_retained_earnings_id
    FROM chart_of_accounts ca
    WHERE ca.business_id = p_business_id 
        AND ca.account_code = '3300' 
        AND ca.is_active = true;
    
    -- 2. Calculate current period Revenue (credit balances on revenue accounts)
    SELECT COALESCE(SUM(jel.amount), 0) INTO v_total_revenue
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
    INNER JOIN chart_of_accounts ac ON jel.account_id = ac.id
    WHERE je.business_id = p_business_id
        AND je.journal_date <= p_as_of_date
        AND je.status = 'posted'
        AND je.voided_at IS NULL
        AND ac.account_type IN ('revenue', 'income')
        AND jel.line_type = 'credit';
    
    -- 3. Calculate current period Expenses (debit balances on expense accounts)
    SELECT COALESCE(SUM(jel.amount), 0) INTO v_total_expenses
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
    INNER JOIN chart_of_accounts ac ON jel.account_id = ac.id
    WHERE je.business_id = p_business_id
        AND je.journal_date <= p_as_of_date
        AND je.status = 'posted'
        AND je.voided_at IS NULL
        AND ac.account_type IN ('expense', 'cogs')
        AND jel.line_type = 'debit';
    
    -- 4. Calculate Net Income
    v_net_income := v_total_revenue - v_total_expenses;
    
    -- 5. Get Retained Earnings balance
    IF v_retained_earnings_id IS NOT NULL THEN
        SELECT COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) -
            COALESCE((SELECT SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END)), 0)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id
                AND jel.account_id = v_retained_earnings_id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
        ), 0) INTO v_retained_earnings;
    END IF;
    
    -- 6. Return ASSETS section
    RETURN QUERY
    SELECT 
        'ASSETS'::VARCHAR(20),
        ca.account_code,
        ca.account_name,
        COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id
                AND jel.account_id = ca.id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
        ), 0),
        0::NUMERIC,
        ca.account_code::INTEGER
    FROM chart_of_accounts ca
    WHERE ca.business_id = p_business_id
        AND ca.account_type = 'asset'
        AND ca.is_active = true
        AND ca.account_code NOT LIKE '%000'
        AND COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id
                AND jel.account_id = ca.id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
        ), 0) != 0
    
    UNION ALL
    
    -- 7. Return LIABILITIES section
    SELECT 
        'LIABILITIES'::VARCHAR(20),
        ca.account_code,
        ca.account_name,
        COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id
                AND jel.account_id = ca.id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
        ), 0),
        0::NUMERIC,
        1000 + ca.account_code::INTEGER
    FROM chart_of_accounts ca
    WHERE ca.business_id = p_business_id
        AND ca.account_type = 'liability'
        AND ca.is_active = true
        AND ca.account_code NOT LIKE '%000'
        AND COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id
                AND jel.account_id = ca.id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
        ), 0) != 0
    
    UNION ALL
    
    -- 8. Return EQUITY section (permanent equity accounts excluding current earnings)
    SELECT 
        'EQUITY'::VARCHAR(20),
        ca.account_code,
        ca.account_name,
        COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id
                AND jel.account_id = ca.id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
        ), 0),
        0::NUMERIC,
        2000 + ca.account_code::INTEGER
    FROM chart_of_accounts ca
    WHERE ca.business_id = p_business_id
        AND ca.account_type = 'equity'
        AND ca.is_active = true
        AND ca.account_code NOT LIKE '%000'
        AND ca.account_code NOT IN ('3400')
        AND COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id
                AND jel.account_id = ca.id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
        ), 0) != 0
    
    UNION ALL
    
    -- 9. Add Current Period Net Income (if not zero)
    SELECT 
        'EQUITY'::VARCHAR(20),
        '3400'::VARCHAR(20),
        'Current Year Earnings'::VARCHAR(100),
        v_net_income,
        0::NUMERIC,
        3000::INTEGER
    WHERE v_net_income != 0
    
    UNION ALL
    
    -- 10. Add Retained Earnings (if not zero)
    SELECT 
        'EQUITY'::VARCHAR(20),
        '3300'::VARCHAR(20),
        'Retained Earnings'::VARCHAR(100),
        v_retained_earnings,
        0::NUMERIC,
        2999::INTEGER
    WHERE v_retained_earnings != 0 AND v_retained_earnings_id IS NOT NULL
    
    ORDER BY sort_order;
END;
$$;

-- Test the function
SELECT 
    section,
    account_code,
    account_name,
    current_balance
FROM get_balance_sheet(
    '0eb7d105-d6cb-43c1-b497-41a710d37b4b'::UUID,
    '2026-05-09'::DATE,
    false
)
ORDER BY sort_order;
