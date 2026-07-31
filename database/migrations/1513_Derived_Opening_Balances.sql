-- ============================================================================
-- MIGRATION: Derived Opening Balances
-- ============================================================================
-- Purpose: prevent the opening-balance step from accepting a manually-typed
-- figure for any GL account whose true value is derivable from a source
-- table the app already maintains. Starts with 1300 (Inventory) and the
-- resolved fixed-asset accounts (1410-1480). Deliberately excludes:
--   - 1490-1495 (Accumulated Depreciation): assets.accumulated_depreciation
--     has multiple independent writers (postHistoricalDepreciation,
--     overrideDepreciation, and unseen DB functions) with no reconciliation
--     between them yet. Deriving from an unreliable number just relocates
--     the problem. Fix that first, register these after.
--   - 1200 (Accounts Receivable), 2100 (Accounts Payable): no confirmed
--     source table traced this session. Do not register without the same
--     trace-then-fix verification given to 1300 and 1410-1480.
--
-- Confirmed via live pg_get_functiondef() reads, not assumed:
--   - 1300 sourced from inventory_items (current_stock * cost_price)
--   - 1410/1420/1430/1440/1450/1460/1480 category mapping taken verbatim
--     from create_asset_purchase_journal_v2()'s own CASE statement
--   - assets.current_book_value already nets existing_accumulated_depreciation
--     at creation time (assetService.js createFixedAsset), so it is the
--     correct opening-balance figure, not purchase_cost.
--
-- Known follow-ups, NOT included here (see chat history for detail):
--   1. Deactivate dead duplicate account codes 1500/1600/1700/1800
--      (same-shape drift as the 1512 chart-of-accounts naming migration,
--      just never reconciled at the code level within a business's chart).
--   2. Resolve multi-writer problem on assets.accumulated_depreciation /
--      current_book_value before registering 1490-1495.
--   3. recordInternalUseAccounting() transaction-boundary bug (unrelated
--      to this migration, still pending from earlier in this session).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Registry: which account codes are derived, and from where
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS derived_opening_balance_accounts (
    account_code  VARCHAR(20) PRIMARY KEY,
    description   TEXT NOT NULL,
    source_note   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO derived_opening_balance_accounts (account_code, description, source_note) VALUES
    ('1300', 'Inventory',
        'SUM(inventory_items.current_stock * inventory_items.cost_price) WHERE is_active = true'),
    ('1410', 'Land',
        'SUM(assets.current_book_value) WHERE category = ''land'' AND is_active = true'),
    ('1420', 'Buildings',
        'SUM(assets.current_book_value) WHERE category = ''building'' AND is_active = true'),
    ('1430', 'Vehicles',
        'SUM(assets.current_book_value) WHERE category = ''vehicle'' AND is_active = true'),
    ('1440', 'Equipment',
        'SUM(assets.current_book_value) WHERE category = ''equipment'' AND is_active = true'),
    ('1450', 'Furniture and Fixtures',
        'SUM(assets.current_book_value) WHERE category = ''furniture'' AND is_active = true'),
    ('1460', 'Computers and Software',
        'SUM(assets.current_book_value) WHERE category IN (''computer'',''electronics'',''software'') AND is_active = true'),
    ('1480', 'Other Fixed Assets',
        'SUM(assets.current_book_value) WHERE category NOT IN (''land'',''building'',''vehicle'',''equipment'',''furniture'',''computer'',''electronics'',''software'') AND is_active = true')
ON CONFLICT (account_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Computes the live, true value for a derived account.
--    Add a new WHEN branch (+ registry row above) only after the source
--    table/column has been confirmed live, the same way 1300 and the
--    asset accounts were confirmed this session.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_derived_opening_balance(
    p_business_id UUID,
    p_account_code VARCHAR
) RETURNS NUMERIC(15,2)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_amount NUMERIC(15,2);
BEGIN
    CASE p_account_code
        WHEN '1300' THEN
            SELECT COALESCE(SUM(current_stock * cost_price), 0) INTO v_amount
            FROM inventory_items
            WHERE business_id = p_business_id AND is_active = true;

        WHEN '1410' THEN
            SELECT COALESCE(SUM(current_book_value), 0) INTO v_amount
            FROM assets
            WHERE business_id = p_business_id AND is_active = true AND category = 'land';

        WHEN '1420' THEN
            SELECT COALESCE(SUM(current_book_value), 0) INTO v_amount
            FROM assets
            WHERE business_id = p_business_id AND is_active = true AND category = 'building';

        WHEN '1430' THEN
            SELECT COALESCE(SUM(current_book_value), 0) INTO v_amount
            FROM assets
            WHERE business_id = p_business_id AND is_active = true AND category = 'vehicle';

        WHEN '1440' THEN
            SELECT COALESCE(SUM(current_book_value), 0) INTO v_amount
            FROM assets
            WHERE business_id = p_business_id AND is_active = true AND category = 'equipment';

        WHEN '1450' THEN
            SELECT COALESCE(SUM(current_book_value), 0) INTO v_amount
            FROM assets
            WHERE business_id = p_business_id AND is_active = true AND category = 'furniture';

        WHEN '1460' THEN
            SELECT COALESCE(SUM(current_book_value), 0) INTO v_amount
            FROM assets
            WHERE business_id = p_business_id AND is_active = true
              AND category IN ('computer', 'electronics', 'software');

        WHEN '1480' THEN
            SELECT COALESCE(SUM(current_book_value), 0) INTO v_amount
            FROM assets
            WHERE business_id = p_business_id AND is_active = true
              AND category NOT IN
                  ('land','building','vehicle','equipment','furniture','computer','electronics','software');

        ELSE
            RAISE EXCEPTION 'No derivation rule registered for account %. '
                'Check derived_opening_balance_accounts and add a CASE branch here.',
                p_account_code;
    END CASE;

    RETURN v_amount;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3. set_opening_balance(): unchanged behavior for manual accounts; rejects
--    direct manual entry for any account in the derived registry unless the
--    call is explicitly flagged as system-derived (used only by the new
--    posting wrapper below). Body below is IDENTICAL to the live function
--    you pasted, with only the new guard block and the new trailing
--    parameter added -- nothing else altered.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_opening_balance(
    p_business_id UUID,
    p_account_code VARCHAR,
    p_balance_amount NUMERIC,
    p_balance_type VARCHAR,
    p_user_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE,
    p_notes TEXT DEFAULT NULL,
    p_is_system_derived BOOLEAN DEFAULT FALSE
) RETURNS TABLE(success BOOLEAN, message TEXT, balance_id UUID)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_account_id UUID;
    v_balance_id UUID;
BEGIN
    -- NEW: reject manual entry for derived accounts
    IF NOT p_is_system_derived AND EXISTS (
        SELECT 1 FROM derived_opening_balance_accounts WHERE account_code = p_account_code
    ) THEN
        success := FALSE;
        message := 'Account ' || p_account_code || ' is a derived balance ('
            || (SELECT description FROM derived_opening_balance_accounts WHERE account_code = p_account_code)
            || ') and cannot be entered manually. '
            || 'Use the derived opening balance endpoint instead.';
        balance_id := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

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

    -- Upsert opening balance
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

    -- If no status record exists yet, create one now rather than silently no-oping.
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

-- ----------------------------------------------------------------------------
-- 4. New wrapper: posts a derived balance by computing it live, then calling
--    set_opening_balance() with the system-derived bypass flag. All derived
--    accounts registered so far (1300, 1410-1480) are asset/debit-normal.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION post_derived_opening_balance(
    p_business_id UUID,
    p_account_code VARCHAR,
    p_user_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(success BOOLEAN, message TEXT, balance_id UUID, computed_amount NUMERIC)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_amount NUMERIC(15,2);
    v_result RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM derived_opening_balance_accounts WHERE account_code = p_account_code) THEN
        RAISE EXCEPTION 'Account % is not registered as derived', p_account_code;
    END IF;

    v_amount := compute_derived_opening_balance(p_business_id, p_account_code);

    SELECT * INTO v_result FROM set_opening_balance(
        p_business_id, p_account_code, v_amount, 'debit', p_user_id, p_as_of_date,
        'System-derived balance, computed at posting time', TRUE
    );

    success := v_result.success;
    message := v_result.message;
    balance_id := v_result.balance_id;
    computed_amount := v_amount;
    RETURN NEXT;
END;
$function$;

COMMIT;

-- ============================================================================
-- Verification queries to run after applying, against a test business:
--
--   SELECT * FROM derived_opening_balance_accounts ORDER BY account_code;
--
--   SELECT * FROM post_derived_opening_balance(
--       '<business_id>'::uuid, '1300', '<user_id>'::uuid
--   );
--
--   -- Confirm manual entry is now blocked:
--   SELECT * FROM set_opening_balance(
--       '<business_id>'::uuid, '1300', 999999, 'debit', '<user_id>'::uuid
--   );
--   -- expect: success = false, message referencing the derived-account rejection
-- ============================================================================
