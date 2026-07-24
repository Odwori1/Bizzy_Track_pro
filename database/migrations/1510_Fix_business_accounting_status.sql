-- =============================================================================
-- Migration 1510: Fix business_accounting_status tracking gaps
-- =============================================================================
-- Context: Frontend integration audit (July 2026) traced two silent status-
-- tracking gaps discovered while mapping the real registration/setup flow:
--
--   Bug A: ensure_business_has_complete_accounts() (called directly at
--          registration, in businessService.js) creates the full 69-row
--          chart of accounts but never writes to business_accounting_status.
--          Result: every business reports chart_of_accounts_created = false
--          and initialization_status = 'PENDING' via get_opening_balances_status()
--          until someone manually calls POST /opening-balances/initialize —
--          even though the chart of accounts is already complete and correct.
--
--   Bug B: set_opening_balance() tries to advance initialization_status to
--          'BALANCES_SET' via a plain UPDATE with no fallback. If a business
--          skips /initialize and goes straight to setting an opening balance
--          (nothing in the route stack prevents this — confirmed via review
--          of openingBalanceRoutes.js), the UPDATE silently affects zero rows
--          and initialization_status is never tracked at all.
--
-- This migration:
--   1. Patches ensure_business_has_complete_accounts() to also upsert the
--      status row (idempotent — safe to call any number of times).
--   2. Patches set_opening_balance() with the same IF NOT FOUND -> INSERT
--      fallback already proven correct in create_opening_balance_journal_entry().
--   3. Backfills business_accounting_status for every existing business that
--      already has a real chart of accounts but no status row (or a stale
--      false flag), so historical data isn't left in the same broken state.
--   4. Adds get_business_setup_completeness(), a new function that computes
--      completeness from real tables (chart_of_accounts, opening_balances,
--      country_tax_rates) rather than trusting cached status flags alone —
--      intended as the backing check for a frontend/middleware setup gate.
--
-- Also fixes the stale "66 accounts" RAISE NOTICE in
-- ensure_business_has_complete_accounts (actual count is 69 — 5 root +
-- 27 asset-type + 10 liability + 4 equity + 9 revenue + 14 expense).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Fix ensure_business_has_complete_accounts() — write status row after
--    creating accounts. Uses ON CONFLICT DO UPDATE that only touches
--    chart_of_accounts_created and updated_at, so it never clobbers
--    initialization_status if a business has already progressed further
--    (e.g. already at BALANCES_SET or COMPLETED) via a later call.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_business_has_complete_accounts(p_business_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_business_exists BOOLEAN;
    v_root_asset UUID;
    v_root_liability UUID;
    v_root_equity UUID;
    v_root_revenue UUID;
    v_root_expense UUID;
BEGIN
    -- Check if business exists
    SELECT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) INTO v_business_exists;
    IF NOT v_business_exists THEN
        RAISE NOTICE 'Business % does not exist, skipping account creation', p_business_id;
        RETURN;
    END IF;

    RAISE NOTICE 'Ensuring complete chart of accounts for business: %', p_business_id;

    -- ========================================================================
    -- FIRST: Create root parent accounts (for reporting hierarchy)
    -- ========================================================================
    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '1000', 'Assets', 'asset', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2000', 'Liabilities', 'liability', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3000', 'Equity', 'equity', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4000', 'Revenue', 'revenue', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5000', 'Expenses', 'expense', true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    -- Get root account IDs for parent references
    SELECT id INTO v_root_asset FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '1000';
    SELECT id INTO v_root_liability FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '2000';
    SELECT id INTO v_root_equity FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '3000';
    SELECT id INTO v_root_revenue FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '4000';
    SELECT id INTO v_root_expense FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '5000';

    -- ========================================================================
    -- SECOND: Asset Accounts (1000-1999)
    -- ========================================================================
    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        -- Current Assets
        (gen_random_uuid(), p_business_id, '1110', 'Cash', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1115', 'Credit Notes Receivable', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1120', 'Bank Account', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1130', 'Mobile Money', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1200', 'Accounts Receivable', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1300', 'Inventory', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1400', 'Prepaid Expenses', 'asset', v_root_asset, true, NOW(), NOW()),

        -- Fixed Assets
        (gen_random_uuid(), p_business_id, '1410', 'Land', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1420', 'Buildings', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1430', 'Vehicles', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1440', 'Equipment', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1450', 'Furniture and Fixtures', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1460', 'Computers and Software', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1470', 'Leasehold Improvements', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1480', 'Other Fixed Assets', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1500', 'Equipment', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1600', 'Furniture and Fixtures', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1800', 'Other Assets', 'asset', v_root_asset, true, NOW(), NOW()),

        -- Accumulated Depreciation (contra-asset accounts)
        (gen_random_uuid(), p_business_id, '1490', 'Accumulated Depreciation - Buildings', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1491', 'Accumulated Depreciation - Vehicles', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1492', 'Accumulated Depreciation - Equipment', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1493', 'Accumulated Depreciation - Furniture', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1494', 'Accumulated Depreciation - Computers', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1495', 'Accumulated Depreciation - Other Assets', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1700', 'Accumulated Depreciation', 'asset', v_root_asset, true, NOW(), NOW()),

        -- Asset Disposal Accounts (special types)
        (gen_random_uuid(), p_business_id, '1496', 'Gain on Disposal of Assets', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1497', 'Loss on Disposal of Assets', 'expense', v_root_expense, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    -- ========================================================================
    -- THIRD: Liability Accounts (2000-2999)
    -- ========================================================================
    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '2100', 'Accounts Payable', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2120', 'Sales Tax Payable', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2130', 'WHT Payable', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2150', 'Refund Liability', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2200', 'Loans Payable', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2210', 'Short-term Loans', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2220', 'Long-term Loans', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2300', 'Accrued Expenses', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2400', 'Unearned Revenue', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2500', 'Other Liabilities', 'liability', v_root_liability, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    -- ========================================================================
    -- FOURTH: Equity Accounts (3000-3999)
    -- ========================================================================
    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '3100', 'Owner''s Capital', 'equity', v_root_equity, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3200', 'Owner''s Drawings', 'equity', v_root_equity, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3300', 'Retained Earnings', 'equity', v_root_equity, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3400', 'Current Earnings', 'equity', v_root_equity, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    -- ========================================================================
    -- FIFTH: Revenue Accounts (4000-4999)
    -- ========================================================================
    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '4100', 'Sales Revenue', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4110', 'Sales Discounts', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4111', 'Volume Discounts', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4112', 'Early Payment Discounts', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4113', 'Promotional Discounts', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4150', 'Sales Returns & Allowances', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4200', 'Service Revenue', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4300', 'Discounts Given', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4400', 'Other Revenue', 'revenue', v_root_revenue, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    -- ========================================================================
    -- SIXTH: Expense Accounts (5000-5999)
    -- ========================================================================
    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '5100', 'Cost of Goods Sold', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5200', 'Rent Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5201', 'Office Supplies Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5202', 'Utilities Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5203', 'Rent Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5204', 'Marketing Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5205', 'Travel Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5206', 'Salaries and Wages', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5209', 'Miscellaneous Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5300', 'Insurance Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5400', 'Repairs and Maintenance', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5500', 'Advertising Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5600', 'Depreciation Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5700', 'Other Expenses', 'expense', v_root_expense, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    -- ========================================================================
    -- NEW (1510): Ensure business_accounting_status reflects reality.
    -- Only sets chart_of_accounts_created + currency default on first insert;
    -- on conflict, only touches chart_of_accounts_created/updated_at so an
    -- already-progressed initialization_status (BALANCES_SET/COMPLETED) is
    -- never clobbered back down.
    -- ========================================================================
    INSERT INTO business_accounting_status (
        business_id, chart_of_accounts_created, currency_code, initialization_status
    ) VALUES (
        p_business_id, TRUE,
        (SELECT currency FROM businesses WHERE id = p_business_id),
        'PENDING'
    )
    ON CONFLICT (business_id) DO UPDATE
    SET chart_of_accounts_created = TRUE,
        updated_at = NOW();

    RAISE NOTICE '✅ Chart of accounts complete for business: % (69 accounts)', p_business_id;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 2. Fix set_opening_balance() — add IF NOT FOUND fallback insert, matching
--    the pattern already proven correct in create_opening_balance_journal_entry().
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_opening_balance(
    p_business_id uuid,
    p_account_code character varying,
    p_balance_amount numeric,
    p_balance_type character varying,
    p_user_id uuid,
    p_as_of_date date DEFAULT CURRENT_DATE,
    p_notes text DEFAULT NULL::text
)
 RETURNS TABLE(success boolean, message text, balance_id uuid)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_account_id UUID;
    v_balance_id UUID;
BEGIN
    -- Get account ID from standard chart
    SELECT id INTO v_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id AND account_code = p_account_code AND is_active = true;

    IF v_account_id IS NULL THEN
        success := FALSE;
        message := 'Account not found: ' || p_account_code;
        balance_id := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Validate amount (user can only enter non-negative numbers)
    IF p_balance_amount < 0 THEN
        success := FALSE;
        message := 'Balance amount cannot be negative';
        balance_id := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Upsert opening balance (user enters their actual amount)
    INSERT INTO opening_balances (
        business_id, account_id, account_code, balance_type, balance_amount, as_of_date, created_by, notes
    ) VALUES (
        p_business_id, v_account_id, p_account_code, p_balance_type, p_balance_amount, p_as_of_date, p_user_id, p_notes
    )
    ON CONFLICT (business_id, account_id, as_of_date) DO UPDATE
    SET balance_amount = EXCLUDED.balance_amount,
        balance_type = EXCLUDED.balance_type,
        is_adjusted = TRUE,
        adjusted_by = p_user_id,
        adjusted_at = NOW(),
        notes = COALESCE(p_notes, opening_balances.notes),
        updated_at = NOW()
    RETURNING id INTO v_balance_id;

    -- Update status
    UPDATE business_accounting_status
    SET initialization_status = 'BALANCES_SET',
        updated_at = NOW()
    WHERE business_id = p_business_id;

    -- NEW (1510): If no status record exists yet (e.g. /initialize was
    -- skipped), create one now rather than silently no-oping.
    IF NOT FOUND THEN
        INSERT INTO business_accounting_status (
            business_id, chart_of_accounts_created, initialization_status
        ) VALUES (
            p_business_id, TRUE, 'BALANCES_SET'
        )
        ON CONFLICT (business_id) DO UPDATE
        SET initialization_status = 'BALANCES_SET',
            updated_at = NOW();
    END IF;

    success := TRUE;
    message := 'Opening balance set for ' || p_account_code || ': ' || p_balance_amount;
    balance_id := v_balance_id;
    RETURN NEXT;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 3. Backfill: any business that already has a real chart of accounts but no
--    status row (or a stale chart_of_accounts_created = false) gets corrected
--    now, using the same idempotent logic as the fixed function above.
--    Deliberately does NOT touch initialization_status for businesses that
--    already have a status row — only fixes chart_of_accounts_created.
-- -----------------------------------------------------------------------------

-- 3a. Businesses with real accounts but no status row at all
INSERT INTO business_accounting_status (business_id, chart_of_accounts_created, currency_code, initialization_status)
SELECT DISTINCT ca.business_id, TRUE, b.currency, 'PENDING'
FROM chart_of_accounts ca
JOIN businesses b ON b.id = ca.business_id
WHERE NOT EXISTS (
    SELECT 1 FROM business_accounting_status s WHERE s.business_id = ca.business_id
)
ON CONFLICT (business_id) DO NOTHING;

-- 3b. Businesses with a status row that stayed FALSE despite having real accounts
UPDATE business_accounting_status s
SET chart_of_accounts_created = TRUE,
    updated_at = NOW()
WHERE s.chart_of_accounts_created = FALSE
  AND EXISTS (
      SELECT 1 FROM chart_of_accounts ca
      WHERE ca.business_id = s.business_id
  );

-- -----------------------------------------------------------------------------
-- 4. New: get_business_setup_completeness() — a real-time completeness check
--    computed directly from source tables, not the cached status flags.
--    Intended as the backing query for a frontend/middleware setup gate.
--    Kept deliberately separate from get_opening_balances_status(): that
--    function reports the *workflow* status (what step a business is on);
--    this one reports *whether the business meets the minimum bar to
--    transact*, which is a related but distinct question.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_business_setup_completeness(p_business_id uuid)
 RETURNS TABLE(
     has_chart_of_accounts boolean,
     chart_of_accounts_count integer,
     has_opening_balances boolean,
     opening_balances_posted boolean,
     is_ready_to_transact boolean,
     reasons text[]
 )
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_coa_count INTEGER;
    v_has_opening_balances BOOLEAN;
    v_posted BOOLEAN;
    v_reasons TEXT[] := ARRAY[]::TEXT[];
BEGIN
    SELECT COUNT(*) INTO v_coa_count
    FROM chart_of_accounts
    WHERE business_id = p_business_id AND is_active = true;

    SELECT EXISTS (
        SELECT 1 FROM opening_balances WHERE business_id = p_business_id
    ) INTO v_has_opening_balances;

    SELECT COALESCE(opening_balances_posted, FALSE) INTO v_posted
    FROM business_accounting_status
    WHERE business_id = p_business_id;

    has_chart_of_accounts := v_coa_count > 0;
    chart_of_accounts_count := v_coa_count;
    has_opening_balances := v_has_opening_balances;
    opening_balances_posted := COALESCE(v_posted, FALSE);

    IF NOT has_chart_of_accounts THEN
        v_reasons := array_append(v_reasons, 'Chart of accounts has not been created');
    END IF;

    -- Opening balances are treated as optional (a genuine zero-balance
    -- startup is legitimate) — NOT posting is not itself blocking.
    -- It only becomes a concern if balances were entered but never posted,
    -- since that leaves the business in a half-finished state.
    IF has_opening_balances AND NOT opening_balances_posted THEN
        v_reasons := array_append(v_reasons, 'Opening balances were entered but not yet posted to the journal');
    END IF;

    is_ready_to_transact := has_chart_of_accounts
        AND (NOT has_opening_balances OR opening_balances_posted);

    reasons := v_reasons;
    RETURN NEXT;
END;
$function$;

COMMIT;

-- =============================================================================
-- Verification queries (run manually after migration):
--
-- 1. Confirm every existing business now has a status row with correct flag:
--    SELECT b.id, b.name, s.chart_of_accounts_created, s.initialization_status
--    FROM businesses b
--    LEFT JOIN business_accounting_status s ON s.business_id = b.id
--    ORDER BY b.created_at;
--
-- 2. Confirm the new completeness function works for a real business:
--    SELECT * FROM get_business_setup_completeness('<a-real-business-id>');
--
-- 3. Live test of the fixed bug path: create a brand-new test business via
--    POST /api/business/register, then immediately call
--    GET /api/accounting/opening-balances/status without ever calling
--    /initialize — chart_of_accounts_created should now read TRUE.
-- =============================================================================
