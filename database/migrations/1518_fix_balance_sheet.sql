CREATE OR REPLACE FUNCTION public.get_balance_sheet(p_business_id uuid, p_as_of_date date, p_include_comparative boolean DEFAULT false)
 RETURNS TABLE(section character varying, account_code character varying, account_name character varying, current_balance numeric, previous_balance numeric, sort_order integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_prev_date DATE;
    v_net_profit NUMERIC;
    v_retained_earnings NUMERIC;
    v_retained_earnings_id UUID;
BEGIN
    IF p_include_comparative THEN
        v_prev_date := p_as_of_date - INTERVAL '1 year';
    ELSE
        v_prev_date := NULL;
    END IF;

    SELECT ca.id INTO v_retained_earnings_id
    FROM chart_of_accounts ca
    WHERE ca.business_id = p_business_id
        AND ca.account_code = '3300'
        AND ca.is_active = true;

    -- FIX (1518): net profit must be a signed sum across ALL lines per
    -- account, not credit-only for revenue / debit-only for expense.
    -- The old filter silently ignored contra-revenue debits (e.g. Sales
    -- Returns 4150) and expense-account credit reversals (e.g. COGS
    -- reversed on refund), overstating net profit whenever either exists.
    SELECT
        COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            INNER JOIN chart_of_accounts a ON jel.account_id = a.id
            WHERE je.business_id = p_business_id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
                AND a.account_type IN ('revenue', 'income')
        ), 0) - COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            INNER JOIN chart_of_accounts a ON jel.account_id = a.id
            WHERE je.business_id = p_business_id
                AND je.journal_date <= p_as_of_date
                AND je.status = 'posted'
                AND je.voided_at IS NULL
                AND a.account_type IN ('expense', 'cogs')
        ), 0) INTO v_net_profit;

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

    RETURN QUERY
    SELECT
        'ASSETS'::VARCHAR(20), a.account_code, a.account_name,
        COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id AND jel.account_id = a.id
                AND je.journal_date <= p_as_of_date AND je.status = 'posted' AND je.voided_at IS NULL
        ), 0) AS current_balance,
        CASE WHEN p_include_comparative THEN
            COALESCE((
                SELECT SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END)
                FROM journal_entry_lines jel
                INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
                WHERE je.business_id = p_business_id AND jel.account_id = a.id
                    AND je.journal_date <= v_prev_date AND je.status = 'posted' AND je.voided_at IS NULL
            ), 0)
        ELSE 0 END AS previous_balance,
        (100 + a.account_code::INTEGER) AS sort_order
    FROM chart_of_accounts a
    WHERE a.business_id = p_business_id AND a.account_type = 'asset' AND a.is_active = true
        AND a.account_code NOT IN ('1000')
        AND COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id AND jel.account_id = a.id
                AND je.journal_date <= p_as_of_date AND je.status = 'posted' AND je.voided_at IS NULL
        ), 0) != 0

    UNION ALL

    SELECT
        'LIABILITIES'::VARCHAR(20), a.account_code, a.account_name,
        COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id AND jel.account_id = a.id
                AND je.journal_date <= p_as_of_date AND je.status = 'posted' AND je.voided_at IS NULL
        ), 0) AS current_balance,
        CASE WHEN p_include_comparative THEN
            COALESCE((
                SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
                FROM journal_entry_lines jel
                INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
                WHERE je.business_id = p_business_id AND jel.account_id = a.id
                    AND je.journal_date <= v_prev_date AND je.status = 'posted' AND je.voided_at IS NULL
            ), 0)
        ELSE 0 END AS previous_balance,
        (200 + a.account_code::INTEGER) AS sort_order
    FROM chart_of_accounts a
    WHERE a.business_id = p_business_id AND a.account_type = 'liability' AND a.is_active = true
        AND a.account_code NOT IN ('2000')
        AND COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id AND jel.account_id = a.id
                AND je.journal_date <= p_as_of_date AND je.status = 'posted' AND je.voided_at IS NULL
        ), 0) != 0

    UNION ALL

    SELECT
        'EQUITY'::VARCHAR(20), a.account_code, a.account_name,
        COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id AND jel.account_id = a.id
                AND je.journal_date <= p_as_of_date AND je.status = 'posted' AND je.voided_at IS NULL
        ), 0) AS current_balance,
        CASE WHEN p_include_comparative THEN
            COALESCE((
                SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
                FROM journal_entry_lines jel
                INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
                WHERE je.business_id = p_business_id AND jel.account_id = a.id
                    AND je.journal_date <= v_prev_date AND je.status = 'posted' AND je.voided_at IS NULL
            ), 0)
        ELSE 0 END AS previous_balance,
        (300 + a.account_code::INTEGER) AS sort_order
    FROM chart_of_accounts a
    WHERE a.business_id = p_business_id AND a.account_type = 'equity' AND a.is_active = true
        AND a.account_code NOT IN ('3000', '3400')
        AND COALESCE((
            SELECT SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
            FROM journal_entry_lines jel
            INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = p_business_id AND jel.account_id = a.id
                AND je.journal_date <= p_as_of_date AND je.status = 'posted' AND je.voided_at IS NULL
        ), 0) != 0

    UNION ALL

    SELECT 'EQUITY'::VARCHAR(20), '3300'::VARCHAR(20), 'Retained Earnings'::VARCHAR(100),
        v_retained_earnings, 0::NUMERIC, 2999 AS sort_order
    WHERE v_retained_earnings != 0

    UNION ALL

    SELECT 'EQUITY'::VARCHAR(20), '3400'::VARCHAR(20), 'Current Year Earnings'::VARCHAR(100),
        v_net_profit, 0::NUMERIC, 3000 AS sort_order
    WHERE v_net_profit != 0

    ORDER BY sort_order;
END;
$function$;
