-- Connect to database
psql -U postgres -p 5434 -d bizzytrack_pro

-- Drop and recreate the function with fixed column references
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
    SELECT ca.id INTO v_retained_earnings_id
    FROM chart_of_accounts ca
    WHERE ca.business_id = p_business_id AND ca.account_code = '3300';

    -- Calculate profit from OPEN periods (not yet closed)
    FOR v_open_periods IN
        SELECT ap.start_date, ap.end_date
        FROM accounting_periods ap
        WHERE ap.business_id = p_business_id
            AND p_as_of_date BETWEEN ap.start_date AND ap.end_date
            AND ap.status = 'OPEN'
    LOOP
        SELECT COALESCE(SUM(
            CASE 
                WHEN a.account_type IN ('revenue', 'income') THEN
                    CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
                WHEN a.account_type IN ('expense', 'cogs') THEN
                    CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
                ELSE 0
            END
        ), 0) INTO v_total_open_profit
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        JOIN chart_of_accounts a ON jel.account_id = a.id
        WHERE je.business_id = p_business_id
            AND je.journal_date BETWEEN v_open_periods.start_date AND LEAST(v_open_periods.end_date, p_as_of_date)
            AND je.status = 'posted'
            AND je.voided_at IS NULL
            AND a.account_type IN ('revenue', 'income', 'expense', 'cogs');
    END LOOP;

    -- Get closed periods' retained earnings
    SELECT COALESCE(ca.current_balance, 0) INTO v_closed_retained_earnings
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
        0::NUMERIC as previous_balance,
        ROW_NUMBER() OVER (ORDER BY ca.account_code)::INTEGER as sort_order
    FROM chart_of_accounts ca
    LEFT JOIN journal_entry_lines jel ON ca.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
        AND je.status = 'posted'
        AND je.voided_at IS NULL
    WHERE ca.business_id = p_business_id
        AND ca.account_type = 'asset'
        AND ca.is_active = true
        AND ca.account_code NOT IN ('1000')
    GROUP BY ca.account_code, ca.account_name, ca.id
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
        0::NUMERIC as previous_balance,
        (1000 + ROW_NUMBER() OVER (ORDER BY ca.account_code))::INTEGER as sort_order
    FROM chart_of_accounts ca
    LEFT JOIN journal_entry_lines jel ON ca.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
        AND je.status = 'posted'
        AND je.voided_at IS NULL
    WHERE ca.business_id = p_business_id
        AND ca.account_type = 'liability'
        AND ca.is_active = true
        AND ca.account_code NOT IN ('2000')
    GROUP BY ca.account_code, ca.account_name, ca.id
    HAVING COALESCE(SUM(
        CASE WHEN je.journal_date <= p_as_of_date THEN
            CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
        ELSE 0 END
    ), 0) != 0

    UNION ALL

    -- Return CLOSED PERIOD EQUITY from Retained Earnings
    SELECT 
        'EQUITY'::VARCHAR(20),
        '3300'::VARCHAR(20),
        'Retained Earnings (Closed Periods)'::VARCHAR(100),
        COALESCE(v_closed_retained_earnings, 0) as current_balance,
        0::NUMERIC as previous_balance,
        2000::INTEGER as sort_order
    WHERE COALESCE(v_closed_retained_earnings, 0) != 0

    UNION ALL

    -- Return OPEN PERIOD PROFIT (Current Period Earnings)
    SELECT 
        'EQUITY'::VARCHAR(20),
        '3400'::VARCHAR(20),
        'Current Period Earnings (Open Periods)'::VARCHAR(100),
        COALESCE(v_total_open_profit, 0) as current_balance,
        0::NUMERIC as previous_balance,
        3000::INTEGER as sort_order
    WHERE COALESCE(v_total_open_profit, 0) != 0

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
        0::NUMERIC as previous_balance,
        (2000 + ROW_NUMBER() OVER (ORDER BY ca.account_code))::INTEGER as sort_order
    FROM chart_of_accounts ca
    LEFT JOIN journal_entry_lines jel ON ca.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
        AND je.status = 'posted'
        AND je.voided_at IS NULL
    WHERE ca.business_id = p_business_id
        AND ca.account_type = 'equity'
        AND ca.is_active = true
        AND ca.account_code NOT IN ('3000', '3300', '3400')
    GROUP BY ca.account_code, ca.account_name, ca.id
    HAVING COALESCE(SUM(
        CASE WHEN je.journal_date <= p_as_of_date THEN
            CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
        ELSE 0 END
    ), 0) != 0

    ORDER BY sort_order;
END;
$$ LANGUAGE plpgsql;

-- Verify the function works
SELECT * FROM get_balance_sheet(
    '0eb7d105-d6cb-43c1-b497-41a710d37b4b'::UUID,
    '2026-05-09'::DATE,
    false
);
