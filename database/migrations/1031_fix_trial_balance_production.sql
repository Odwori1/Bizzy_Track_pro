-- ============================================================================
-- MIGRATION: 1031_fix_trial_balance_production.sql
-- PURPOSE: Fix trial balance for production accounting standards
-- DATE: April 16, 2026
-- ============================================================================

BEGIN;

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
        -- Get the most recent opening balance as of the reporting date
        SELECT DISTINCT ON (ob.account_id)
            ob.account_id,
            ob.balance_amount,
            ob.balance_type,
            ob.as_of_date
        FROM opening_balances ob
        WHERE ob.business_id = p_business_id
            AND ob.as_of_date <= p_as_of_date
        ORDER BY ob.account_id, ob.as_of_date DESC
    ),
    period_transactions AS (
        -- Get ALL journal entries that occurred AFTER the opening balance as_of_date
        -- This excludes the opening balance journal entry itself
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
            AND je.reference_type != 'OPENING_BALANCE'  -- KEY FIX: Exclude opening balance entries
        GROUP BY jel.account_id
    )
    SELECT
        ca.account_code,
        ca.account_name,
        ca.account_type,
        -- Opening: from opening_balances table only
        COALESCE(CASE WHEN ob.balance_type = 'debit' THEN ob.balance_amount ELSE 0 END, 0)::NUMERIC(15,2),
        COALESCE(CASE WHEN ob.balance_type = 'credit' THEN ob.balance_amount ELSE 0 END, 0)::NUMERIC(15,2),
        -- Period: only transactions AFTER opening balances
        COALESCE(pt.period_debits, 0)::NUMERIC(15,2),
        COALESCE(pt.period_credits, 0)::NUMERIC(15,2),
        -- Closing = Opening + Period
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
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_test_business_id UUID;
    v_opening_debits NUMERIC;
    v_period_debits NUMERIC;
    v_closing_debits NUMERIC;
BEGIN
    SELECT id INTO v_test_business_id FROM businesses WHERE name = 'phase 12' LIMIT 1;
    
    IF v_test_business_id IS NOT NULL THEN
        SELECT 
            SUM(opening_debits) as opening,
            SUM(period_debits) as period,
            SUM(closing_debits) as closing
        INTO v_opening_debits, v_period_debits, v_closing_debits
        FROM get_trial_balance_enhanced(v_test_business_id, CURRENT_DATE, false);
        
        RAISE NOTICE '========================================';
        RAISE NOTICE 'PRODUCTION TRIAL BALANCE VERIFICATION';
        RAISE NOTICE '========================================';
        RAISE NOTICE 'Opening Debits: %', v_opening_debits;
        RAISE NOTICE 'Period Debits:  %', v_period_debits;
        RAISE NOTICE 'Closing Debits: %', v_closing_debits;
        RAISE NOTICE '========================================';
        
        IF v_closing_debits = v_opening_debits AND v_period_debits = 0 THEN
            RAISE NOTICE '✅ PRODUCTION READY: No double-counting';
        ELSIF v_closing_debits = v_opening_debits + v_period_debits THEN
            RAISE NOTICE '⚠️ Still double-counting: Closing = Opening + Period';
        ELSE
            RAISE NOTICE '⚠️ Unexpected values: Please review';
        END IF;
    END IF;
END $$;

COMMIT;
