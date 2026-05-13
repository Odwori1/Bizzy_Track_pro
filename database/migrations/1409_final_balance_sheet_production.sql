-- =====================================================
-- PRODUCTION GRADE: Balance Sheet Function (FIXED)
-- Version: 4.1 - Fixed ambiguous column references
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
    v_prev_date DATE;
    v_net_profit NUMERIC;
    v_retained_earnings NUMERIC;
    v_retained_earnings_id UUID;
BEGIN
    -- Set previous period date for comparison
    IF p_include_comparative THEN
        v_prev_date := p_as_of_date - INTERVAL '1 year';
    ELSE
        v_prev_date := NULL;
    END IF;

    -- Get Retained Earnings account ID - FIXED: qualify column references
    SELECT ca.id INTO v_retained_earnings_id
    FROM chart_of_accounts ca
    WHERE ca.business_id = p_business_id
        AND ca.account_code = '3300'
        AND ca.is_active = true;

    -- Calculate Net Profit for current period
    -- Revenue is credit balance (positive)
    -- Expenses are debit balance (positive)
    SELECT
        COALESCE((
            SELECT SUM(jel.amount)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            INNER JOIN chart_of_accounts a ON jel.account_id = a.id
            WHERE je.business_id = p_business_id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
                AND a.account_type IN ('revenue', 'income')
                AND jel.line_type = 'credit'
        ), 0) - COALESCE((
            SELECT SUM(jel.amount)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            INNER JOIN chart_of_accounts a ON jel.account_id = a.id
            WHERE je.business_id = p_business_id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
                AND a.account_type IN ('expense', 'cogs')
                AND jel.line_type = 'debit'
        ), 0) INTO v_net_profit;

    -- Calculate Retained Earnings balance
    SELECT COALESCE((
        SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
        FROM journal_entry_lines jel
        INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
        WHERE je.business_id = p_business_id
            AND jel.account_id = v_retained_earnings_id
            AND je.journal_date <= p_as_of_date
            AND je.status = 'posted'
            AND je.voided_at IS NULL
    ), 0) INTO v_retained_earnings;

    -- Return ASSETS (debit balances)
    RETURN QUERY
    SELECT
        'ASSETS'::VARCHAR(20),
        a.account_code,
        a.account_name,
        COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id
                AND jel.account_id = a.id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
        ), 0) AS current_balance,
        CASE WHEN p_include_comparative THEN
            COALESCE((
                SELECT SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END)
                FROM journal_entry_lines jel
                INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
                WHERE je.business_id = p_business_id
                    AND jel.account_id = a.id
                    AND je.journal_date <= v_prev_date
                    AND je.status = 'posted'
                    AND je.voided_at IS NULL
            ), 0)
        ELSE 0 END AS previous_balance,
        (100 + a.account_code::INTEGER) AS sort_order
    FROM chart_of_accounts a
    WHERE a.business_id = p_business_id
        AND a.account_type = 'asset'
        AND a.is_active = true
        AND a.account_code NOT IN ('1000')
        AND COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id
                AND jel.account_id = a.id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
        ), 0) != 0

    UNION ALL

    -- Return LIABILITIES (credit balances)
    SELECT
        'LIABILITIES'::VARCHAR(20),
        a.account_code,
        a.account_name,
        COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id
                AND jel.account_id = a.id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
        ), 0) AS current_balance,
        CASE WHEN p_include_comparative THEN
            COALESCE((
                SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
                FROM journal_entry_lines jel
                INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
                WHERE je.business_id = p_business_id
                    AND jel.account_id = a.id
                    AND je.journal_date <= v_prev_date
                    AND je.status = 'posted'
                    AND je.voided_at IS NULL
            ), 0)
        ELSE 0 END AS previous_balance,
        (200 + a.account_code::INTEGER) AS sort_order
    FROM chart_of_accounts a
    WHERE a.business_id = p_business_id
        AND a.account_type = 'liability'
        AND a.is_active = true
        AND a.account_code NOT IN ('2000')
        AND COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id
                AND jel.account_id = a.id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
        ), 0) != 0

    UNION ALL

    -- Return EQUITY accounts from chart (excluding 3400 which is calculated)
    SELECT
        'EQUITY'::VARCHAR(20),
        a.account_code,
        a.account_name,
        COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id
                AND jel.account_id = a.id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
        ), 0) AS current_balance,
        CASE WHEN p_include_comparative THEN
            COALESCE((
                SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
                FROM journal_entry_lines jel
                INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
                WHERE je.business_id = p_business_id
                    AND jel.account_id = a.id
                    AND je.journal_date <= v_prev_date
                    AND je.status = 'posted'
                    AND je.voided_at IS NULL
            ), 0)
        ELSE 0 END AS previous_balance,
        (300 + a.account_code::INTEGER) AS sort_order
    FROM chart_of_accounts a
    WHERE a.business_id = p_business_id
        AND a.account_type = 'equity'
        AND a.is_active = true
        AND a.account_code NOT IN ('3000', '3400')
        AND COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id
                AND jel.account_id = a.id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
        ), 0) != 0

    UNION ALL

    -- Add Retained Earnings if not zero
    SELECT
        'EQUITY'::VARCHAR(20),
        '3300'::VARCHAR(20),
        'Retained Earnings'::VARCHAR(100),
        v_retained_earnings,
        0::NUMERIC,
        2999 AS sort_order
    WHERE v_retained_earnings != 0

    UNION ALL

    -- Add Current Period Net Profit if not zero
    SELECT
        'EQUITY'::VARCHAR(20),
        '3400'::VARCHAR(20),
        'Current Year Earnings'::VARCHAR(100),
        v_net_profit,
        0::NUMERIC,
        3000 AS sort_order
    WHERE v_net_profit != 0

    ORDER BY sort_order;
END;
$$;

-- Verify the function works
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
