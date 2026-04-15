-- ============================================================================
-- MIGRATION: 1030_financial_statements.sql
-- PURPOSE: Financial statement generation functions
-- DEPENDS ON: 1020_opening_balance_system.sql, 1040_tax_gl_integration.sql
-- PATTERN: Follows 1015_refund_system_production_grade.sql
-- DATE: April 15, 2026
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: PROFIT & LOSS STATEMENT (Income Statement)
-- ============================================================================

DROP FUNCTION IF EXISTS get_profit_loss(UUID, DATE, DATE, BOOLEAN);

CREATE OR REPLACE FUNCTION get_profit_loss(
    p_business_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_compare_with_previous BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
    section VARCHAR(20),
    account_code VARCHAR(20),
    account_name VARCHAR(100),
    current_amount NUMERIC(15,2),
    previous_amount NUMERIC(15,2),
    change_percentage NUMERIC(10,2),
    sort_order INTEGER
) AS $$
DECLARE
    v_prev_start DATE;
    v_prev_end DATE;
    v_revenue_total NUMERIC := 0;
    v_expense_total NUMERIC := 0;
BEGIN
    -- Calculate previous period dates if comparing
    IF p_compare_with_previous THEN
        v_prev_start := p_start_date - (p_end_date - p_start_date + 1);
        v_prev_end := p_start_date - 1;
    END IF;

    -- Revenue section (4000-4999, excluding parent accounts)
    RETURN QUERY
    SELECT
        'REVENUE'::VARCHAR(20),
        ca.account_code,
        ca.account_name,
        COALESCE(SUM(CASE WHEN je.journal_date BETWEEN p_start_date AND p_end_date
            THEN CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
            ELSE 0 END), 0)::NUMERIC(15,2),
        COALESCE(CASE WHEN p_compare_with_previous THEN
            SUM(CASE WHEN je.journal_date BETWEEN v_prev_start AND v_prev_end
                THEN CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
                ELSE 0 END)
        ELSE 0 END, 0)::NUMERIC(15,2),
        0::NUMERIC(10,2),
        ROW_NUMBER() OVER (ORDER BY ca.account_code)::INTEGER
    FROM chart_of_accounts ca
    LEFT JOIN journal_entry_lines jel ON ca.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
        AND je.status = 'posted'
        AND je.voided_at IS NULL
    WHERE ca.business_id = p_business_id
        AND ca.account_code >= '4000'
        AND ca.account_code < '5000'
        AND ca.account_code NOT IN ('4000', '5000')
        AND ca.is_active = true
    GROUP BY ca.account_code, ca.account_name, ca.id
    HAVING COALESCE(SUM(CASE WHEN je.journal_date BETWEEN p_start_date AND p_end_date
        THEN CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
        ELSE 0 END), 0) != 0

    UNION ALL

    -- COGS section (5100 only)
    SELECT
        'COGS'::VARCHAR(20),
        ca.account_code,
        ca.account_name,
        COALESCE(SUM(CASE WHEN je.journal_date BETWEEN p_start_date AND p_end_date
            THEN CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
            ELSE 0 END), 0)::NUMERIC(15,2),
        COALESCE(CASE WHEN p_compare_with_previous THEN
            SUM(CASE WHEN je.journal_date BETWEEN v_prev_start AND v_prev_end
                THEN CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
                ELSE 0 END)
        ELSE 0 END, 0)::NUMERIC(15,2),
        0::NUMERIC(10,2),
        1000::INTEGER
    FROM chart_of_accounts ca
    LEFT JOIN journal_entry_lines jel ON ca.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
        AND je.status = 'posted'
        AND je.voided_at IS NULL
    WHERE ca.business_id = p_business_id
        AND ca.account_code = '5100'
        AND ca.is_active = true
    GROUP BY ca.account_code, ca.account_name, ca.id
    HAVING COALESCE(SUM(CASE WHEN je.journal_date BETWEEN p_start_date AND p_end_date
        THEN CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
        ELSE 0 END), 0) != 0

    UNION ALL

    -- Expense section (5000-5999, excluding COGS and parent)
    SELECT
        'EXPENSE'::VARCHAR(20),
        ca.account_code,
        ca.account_name,
        COALESCE(SUM(CASE WHEN je.journal_date BETWEEN p_start_date AND p_end_date
            THEN CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
            ELSE 0 END), 0)::NUMERIC(15,2),
        COALESCE(CASE WHEN p_compare_with_previous THEN
            SUM(CASE WHEN je.journal_date BETWEEN v_prev_start AND v_prev_end
                THEN CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
                ELSE 0 END)
        ELSE 0 END, 0)::NUMERIC(15,2),
        0::NUMERIC(10,2),
        (ROW_NUMBER() OVER (ORDER BY ca.account_code) + 2000)::INTEGER
    FROM chart_of_accounts ca
    LEFT JOIN journal_entry_lines jel ON ca.id = jel.account_id
    LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
        AND je.status = 'posted'
        AND je.voided_at IS NULL
    WHERE ca.business_id = p_business_id
        AND ca.account_code >= '5000'
        AND ca.account_code < '6000'
        AND ca.account_code NOT IN ('5000', '5100')
        AND ca.is_active = true
    GROUP BY ca.account_code, ca.account_name, ca.id
    HAVING COALESCE(SUM(CASE WHEN je.journal_date BETWEEN p_start_date AND p_end_date
        THEN CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
        ELSE 0 END), 0) != 0;

    -- Calculate percentages in a second pass using a subquery
    -- This avoids the UNION ORDER BY issue
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 2: PROFIT & LOSS WITH COMPARATIVE PERCENTAGES
-- ============================================================================

DROP FUNCTION IF EXISTS get_profit_loss_with_comparison(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_profit_loss_with_comparison(
    p_business_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE(
    section VARCHAR(20),
    account_code VARCHAR(20),
    account_name VARCHAR(100),
    current_amount NUMERIC(15,2),
    previous_amount NUMERIC(15,2),
    change_percentage NUMERIC(10,2),
    sort_order INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pl.section,
        pl.account_code,
        pl.account_name,
        pl.current_amount,
        pl.previous_amount,
        CASE
            WHEN pl.previous_amount != 0
            THEN ((pl.current_amount - pl.previous_amount) / pl.previous_amount) * 100
            ELSE 0
        END::NUMERIC(10,2),
        pl.sort_order
    FROM get_profit_loss(p_business_id, p_start_date, p_end_date, TRUE) pl
    ORDER BY pl.sort_order;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 3: BALANCE SHEET (Fixed ambiguous column reference)
-- ============================================================================

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
    current_balance NUMERIC(15,2),
    previous_balance NUMERIC(15,2),
    sort_order INTEGER
) AS $$
DECLARE
    v_prev_date DATE;
BEGIN
    IF p_include_comparative THEN
        v_prev_date := p_as_of_date - INTERVAL '1 year';
    END IF;

    RETURN QUERY
    WITH account_balances AS (
        SELECT
            ca.account_code as acc_code,
            ca.account_name as acc_name,
            ca.account_type as acc_type,
            COALESCE(SUM(
                CASE WHEN je.journal_date <= p_as_of_date THEN
                    CASE
                        WHEN ca.account_type IN ('asset', 'expense') THEN
                            CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
                        ELSE
                            CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
                    END
                ELSE 0 END
            ), 0) as curr_balance,
            COALESCE(CASE WHEN p_include_comparative THEN
                SUM(
                    CASE WHEN je.journal_date <= v_prev_date THEN
                        CASE
                            WHEN ca.account_type IN ('asset', 'expense') THEN
                                CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
                            ELSE
                                CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
                        END
                    ELSE 0 END
                )
            ELSE 0 END, 0) as prev_balance
        FROM chart_of_accounts ca
        LEFT JOIN journal_entry_lines jel ON ca.id = jel.account_id
        LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
            AND je.status = 'posted'
            AND je.voided_at IS NULL
        WHERE ca.business_id = p_business_id
            AND ca.account_type IN ('asset', 'liability', 'equity')
            AND ca.account_code NOT IN ('1000', '2000', '3000')
            AND ca.is_active = true
        GROUP BY ca.account_code, ca.account_name, ca.account_type
    )
    SELECT
        CASE
            WHEN acc_type = 'asset' THEN 'ASSETS'::VARCHAR(20)
            WHEN acc_type = 'liability' THEN 'LIABILITIES'::VARCHAR(20)
            ELSE 'EQUITY'::VARCHAR(20)
        END,
        acc_code,
        acc_name,
        curr_balance,
        prev_balance,
        ROW_NUMBER() OVER (ORDER BY acc_type, acc_code)::INTEGER
    FROM account_balances
    WHERE curr_balance != 0 OR prev_balance != 0
    ORDER BY sort_order;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 4: CASH FLOW STATEMENT
-- ============================================================================

DROP FUNCTION IF EXISTS get_cash_flow(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_cash_flow(
    p_business_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE(
    category VARCHAR(30),
    description TEXT,
    amount NUMERIC(15,2),
    sort_order INTEGER
) AS $$
DECLARE
    v_net_income NUMERIC := 0;
    v_depreciation NUMERIC := 0;
    v_ar_change NUMERIC := 0;
    v_ap_change NUMERIC := 0;
    v_inventory_change NUMERIC := 0;
    v_cash_flow NUMERIC := 0;
    v_row RECORD;
BEGIN
    -- Calculate Net Income from P&L
    FOR v_row IN SELECT section, current_amount FROM get_profit_loss(p_business_id, p_start_date, p_end_date, FALSE) LOOP
        IF v_row.section = 'REVENUE' THEN
            v_net_income := v_net_income + v_row.current_amount;
        ELSIF v_row.section IN ('COGS', 'EXPENSE') THEN
            v_net_income := v_net_income - v_row.current_amount;
        END IF;
    END LOOP;

    -- Add back non-cash expenses (Depreciation)
    SELECT COALESCE(SUM(jel.amount), 0) INTO v_depreciation
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts ca ON jel.account_id = ca.id
    WHERE je.business_id = p_business_id
        AND je.journal_date BETWEEN p_start_date AND p_end_date
        AND je.status = 'posted'
        AND je.voided_at IS NULL
        AND ca.account_code = '5600'
        AND jel.line_type = 'debit';

    -- Calculate Accounts Receivable change
    SELECT COALESCE(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END), 0)
    INTO v_ar_change
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts ca ON jel.account_id = ca.id
    WHERE je.business_id = p_business_id
        AND je.journal_date BETWEEN p_start_date AND p_end_date
        AND je.status = 'posted'
        AND je.voided_at IS NULL
        AND ca.account_code = '1200';

    -- Calculate Accounts Payable change
    SELECT COALESCE(SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END), 0)
    INTO v_ap_change
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts ca ON jel.account_id = ca.id
    WHERE je.business_id = p_business_id
        AND je.journal_date BETWEEN p_start_date AND p_end_date
        AND je.status = 'posted'
        AND je.voided_at IS NULL
        AND ca.account_code = '2100';

    -- Calculate Inventory change
    SELECT COALESCE(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END), 0)
    INTO v_inventory_change
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts ca ON jel.account_id = ca.id
    WHERE je.business_id = p_business_id
        AND je.journal_date BETWEEN p_start_date AND p_end_date
        AND je.status = 'posted'
        AND je.voided_at IS NULL
        AND ca.account_code = '1300';

    -- Calculate net cash from operations
    v_cash_flow := v_net_income + v_depreciation - v_ar_change - v_inventory_change + v_ap_change;

    -- Return Operating Activities
    RETURN QUERY SELECT 'OPERATING'::VARCHAR(30), 'Net Income'::TEXT, v_net_income::NUMERIC(15,2), 10 WHERE v_net_income != 0;
    RETURN QUERY SELECT 'OPERATING'::VARCHAR(30), 'Depreciation'::TEXT, v_depreciation::NUMERIC(15,2), 20 WHERE v_depreciation != 0;
    RETURN QUERY SELECT 'OPERATING'::VARCHAR(30), 'Change in Accounts Receivable'::TEXT, (-v_ar_change)::NUMERIC(15,2), 30 WHERE v_ar_change != 0;
    RETURN QUERY SELECT 'OPERATING'::VARCHAR(30), 'Change in Inventory'::TEXT, (-v_inventory_change)::NUMERIC(15,2), 40 WHERE v_inventory_change != 0;
    RETURN QUERY SELECT 'OPERATING'::VARCHAR(30), 'Change in Accounts Payable'::TEXT, v_ap_change::NUMERIC(15,2), 50 WHERE v_ap_change != 0;
    RETURN QUERY SELECT 'OPERATING'::VARCHAR(30), 'Net Cash from Operating Activities'::TEXT, v_cash_flow::NUMERIC(15,2), 60;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 5: ENHANCED TRIAL BALANCE
-- ============================================================================

DROP FUNCTION IF EXISTS get_trial_balance_enhanced(UUID, DATE, BOOLEAN);

CREATE OR REPLACE FUNCTION get_trial_balance_enhanced(
    p_business_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE,
    p_include_zero_balances BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
    account_code VARCHAR(20),
    account_name VARCHAR(100),
    account_type VARCHAR(20),
    opening_debits NUMERIC(15,2),
    opening_credits NUMERIC(15,2),
    period_debits NUMERIC(15,2),
    period_credits NUMERIC(15,2),
    closing_debits NUMERIC(15,2),
    closing_credits NUMERIC(15,2)
) AS $$
BEGIN
    RETURN QUERY
    WITH opening_balances_cte AS (
        SELECT DISTINCT ON (ob.account_id)
            ob.account_id,
            ob.balance_amount,
            ob.balance_type
        FROM opening_balances ob
        WHERE ob.business_id = p_business_id
            AND ob.as_of_date <= p_as_of_date
        ORDER BY ob.account_id, ob.as_of_date DESC
    ),
    period_transactions AS (
        SELECT
            jel.account_id,
            SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as period_debits,
            SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) as period_credits
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        WHERE je.business_id = p_business_id
            AND je.journal_date <= p_as_of_date
            AND je.status = 'posted'
            AND je.voided_at IS NULL
        GROUP BY jel.account_id
    )
    SELECT
        ca.account_code,
        ca.account_name,
        ca.account_type,
        COALESCE(CASE WHEN ob.balance_type = 'debit' THEN ob.balance_amount ELSE 0 END, 0)::NUMERIC(15,2),
        COALESCE(CASE WHEN ob.balance_type = 'credit' THEN ob.balance_amount ELSE 0 END, 0)::NUMERIC(15,2),
        COALESCE(pt.period_debits, 0)::NUMERIC(15,2),
        COALESCE(pt.period_credits, 0)::NUMERIC(15,2),
        (COALESCE(CASE WHEN ob.balance_type = 'debit' THEN ob.balance_amount ELSE 0 END, 0) +
            COALESCE(pt.period_debits, 0))::NUMERIC(15,2),
        (COALESCE(CASE WHEN ob.balance_type = 'credit' THEN ob.balance_amount ELSE 0 END, 0) +
            COALESCE(pt.period_credits, 0))::NUMERIC(15,2)
    FROM chart_of_accounts ca
    LEFT JOIN opening_balances_cte ob ON ca.id = ob.account_id
    LEFT JOIN period_transactions pt ON ca.id = pt.account_id
    WHERE ca.business_id = p_business_id
        AND ca.is_active = true
        AND (p_include_zero_balances = TRUE OR
            COALESCE(ob.balance_amount, 0) != 0 OR
            COALESCE(pt.period_debits, 0) != 0 OR
            COALESCE(pt.period_credits, 0) != 0)
    ORDER BY ca.account_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 6: FINANCIAL SUMMARY DASHBOARD
-- ============================================================================

DROP FUNCTION IF EXISTS get_financial_summary(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_financial_summary(
    p_business_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE(
    metric_name VARCHAR(50),
    metric_value NUMERIC(15,2)
) AS $$
DECLARE
    v_total_revenue NUMERIC := 0;
    v_total_expenses NUMERIC := 0;
    v_net_profit NUMERIC := 0;
    v_total_assets NUMERIC := 0;
    v_total_liabilities NUMERIC := 0;
    v_total_equity NUMERIC := 0;
    v_current_ratio NUMERIC := 0;
    v_quick_ratio NUMERIC := 0;
    v_row RECORD;
BEGIN
    -- Get P&L totals
    FOR v_row IN SELECT section, current_amount FROM get_profit_loss(p_business_id, p_start_date, p_end_date, FALSE) LOOP
        IF v_row.section = 'REVENUE' THEN
            v_total_revenue := v_total_revenue + v_row.current_amount;
        ELSIF v_row.section IN ('COGS', 'EXPENSE') THEN
            v_total_expenses := v_total_expenses + v_row.current_amount;
        END IF;
    END LOOP;

    v_net_profit := v_total_revenue - v_total_expenses;

    -- Get Balance Sheet totals
    FOR v_row IN SELECT section, current_balance FROM get_balance_sheet(p_business_id, p_end_date, FALSE) LOOP
        IF v_row.section = 'ASSETS' THEN
            v_total_assets := v_total_assets + v_row.current_balance;
        ELSIF v_row.section = 'LIABILITIES' THEN
            v_total_liabilities := v_total_liabilities + v_row.current_balance;
        ELSIF v_row.section = 'EQUITY' THEN
            v_total_equity := v_total_equity + v_row.current_balance;
        END IF;
    END LOOP;

    -- Calculate ratios
    IF v_total_liabilities > 0 THEN
        v_current_ratio := v_total_assets / v_total_liabilities;
        v_quick_ratio := v_total_assets / v_total_liabilities;
    END IF;

    -- Return summary metrics
    RETURN QUERY SELECT 'Total Revenue'::VARCHAR(50), v_total_revenue;
    RETURN QUERY SELECT 'Total Expenses'::VARCHAR(50), v_total_expenses;
    RETURN QUERY SELECT 'Net Profit'::VARCHAR(50), v_net_profit;
    RETURN QUERY SELECT 'Total Assets'::VARCHAR(50), v_total_assets;
    RETURN QUERY SELECT 'Total Liabilities'::VARCHAR(50), v_total_liabilities;
    RETURN QUERY SELECT 'Total Equity'::VARCHAR(50), v_total_equity;
    RETURN QUERY SELECT 'Current Ratio'::VARCHAR(50), v_current_ratio;
    RETURN QUERY SELECT 'Quick Ratio'::VARCHAR(50), v_quick_ratio;
    RETURN QUERY SELECT 'Debt to Equity'::VARCHAR(50), CASE WHEN v_total_equity > 0 THEN v_total_liabilities / v_total_equity ELSE 0 END;
    RETURN QUERY SELECT 'Profit Margin %'::VARCHAR(50), CASE WHEN v_total_revenue > 0 THEN (v_net_profit / v_total_revenue) * 100 ELSE 0 END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 7: VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_function_count INTEGER;
    v_test_business_id UUID;
BEGIN
    SELECT COUNT(*) INTO v_function_count
    FROM pg_proc
    WHERE proname IN (
        'get_profit_loss',
        'get_profit_loss_with_comparison',
        'get_balance_sheet',
        'get_cash_flow',
        'get_trial_balance_enhanced',
        'get_financial_summary'
    );

    SELECT id INTO v_test_business_id FROM businesses LIMIT 1;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'FINANCIAL STATEMENTS SYSTEM INSTALLED';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Functions created: %/6', v_function_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Functions available:';
    RAISE NOTICE '  - get_profit_loss(business_id, start_date, end_date, compare)';
    RAISE NOTICE '  - get_profit_loss_with_comparison(business_id, start_date, end_date)';
    RAISE NOTICE '  - get_balance_sheet(business_id, as_of_date, include_comparative)';
    RAISE NOTICE '  - get_cash_flow(business_id, start_date, end_date)';
    RAISE NOTICE '  - get_trial_balance_enhanced(business_id, as_of_date, include_zero)';
    RAISE NOTICE '  - get_financial_summary(business_id, start_date, end_date)';
    RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK SECTION
-- ============================================================================
/*
DROP FUNCTION IF EXISTS get_profit_loss(UUID, DATE, DATE, BOOLEAN);
DROP FUNCTION IF EXISTS get_profit_loss_with_comparison(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS get_balance_sheet(UUID, DATE, BOOLEAN);
DROP FUNCTION IF EXISTS get_cash_flow(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS get_trial_balance_enhanced(UUID, DATE, BOOLEAN);
DROP FUNCTION IF EXISTS get_financial_summary(UUID, DATE, DATE);
*/
