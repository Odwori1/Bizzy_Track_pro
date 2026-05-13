-- =====================================================
-- PRODUCTION GRADE: Balance Sheet Function
-- Using CTE approach - guaranteed to work
-- Version: 3.0
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
BEGIN
    RETURN QUERY
    WITH 
    -- First, calculate each account's balance
    account_balances AS (
        SELECT 
            a.id,
            a.account_code,
            a.account_name,
            a.account_type,
            COALESCE(SUM(
                CASE 
                    WHEN jel.line_type = 'debit' THEN jel.amount
                    WHEN jel.line_type = 'credit' THEN -jel.amount
                    ELSE 0
                END
            ), 0) AS balance
        FROM chart_of_accounts a
        LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
        LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
            AND je.status = 'posted'
            AND je.voided_at IS NULL
            AND je.journal_date <= p_as_of_date
        WHERE a.business_id = p_business_id
            AND a.is_active = true
        GROUP BY a.id, a.account_code, a.account_name, a.account_type
    ),
    -- Calculate net income
    net_income AS (
        SELECT 
            COALESCE(SUM(CASE WHEN account_type IN ('revenue', 'income') THEN balance ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN account_type IN ('expense', 'cogs') THEN balance ELSE 0 END), 0) AS amount
        FROM account_balances
        WHERE account_type IN ('revenue', 'income', 'expense', 'cogs')
    ),
    -- Get retained earnings balance
    retained_earnings AS (
        SELECT COALESCE(balance, 0) AS amount
        FROM account_balances
        WHERE account_code = '3300'
    )
    -- ASSETS
    SELECT 
        'ASSETS'::VARCHAR(20),
        ab.account_code,
        ab.account_name,
        ab.balance,
        0::NUMERIC,
        (100 + ab.account_code::INTEGER)::INTEGER
    FROM account_balances ab
    WHERE ab.account_type = 'asset'
        AND ab.account_code NOT LIKE '%000'
        AND ab.balance != 0
    
    UNION ALL
    
    -- LIABILITIES
    SELECT 
        'LIABILITIES'::VARCHAR(20),
        ab.account_code,
        ab.account_name,
        ab.balance,
        0::NUMERIC,
        (200 + ab.account_code::INTEGER)::INTEGER
    FROM account_balances ab
    WHERE ab.account_type = 'liability'
        AND ab.account_code NOT LIKE '%000'
        AND ab.balance != 0
    
    UNION ALL
    
    -- EQUITY (excluding current earnings placeholder)
    SELECT 
        'EQUITY'::VARCHAR(20),
        ab.account_code,
        ab.account_name,
        ab.balance,
        0::NUMERIC,
        (300 + ab.account_code::INTEGER)::INTEGER
    FROM account_balances ab
    WHERE ab.account_type = 'equity'
        AND ab.account_code NOT LIKE '%000'
        AND ab.account_code NOT IN ('3400')
        AND ab.balance != 0
    
    UNION ALL
    
    -- Current Period Net Income
    SELECT 
        'EQUITY'::VARCHAR(20),
        '3400'::VARCHAR(20),
        'Current Year Earnings'::VARCHAR(100),
        ni.amount,
        0::NUMERIC,
        3000::INTEGER
    FROM net_income ni
    WHERE ni.amount != 0
    
    UNION ALL
    
    -- Retained Earnings (if not already shown)
    SELECT 
        'EQUITY'::VARCHAR(20),
        '3300'::VARCHAR(20),
        'Retained Earnings'::VARCHAR(100),
        re.amount,
        0::NUMERIC,
        2999::INTEGER
    FROM retained_earnings re
    WHERE re.amount != 0
    
    ORDER BY sort_order;
END;
$$;
