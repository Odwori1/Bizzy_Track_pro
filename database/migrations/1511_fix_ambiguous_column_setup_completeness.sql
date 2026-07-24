-- =============================================================================
-- Migration 1511: Fix ambiguous column reference in
-- get_business_setup_completeness() (introduced in 1510)
-- =============================================================================
-- Found via live testing as bizzytrack_user (not superuser) immediately after
-- 1510 — exactly the discipline established in prior sessions: confirm every
-- fix under real RLS enforcement, not just as postgres.
--
-- Error hit:
--   ERROR: column reference "opening_balances_posted" is ambiguous
--   Postgres could not tell whether "opening_balances_posted" meant the
--   function's own OUT parameter of that name, or the column of the same
--   name on business_accounting_status. Fixed by aliasing the table and
--   qualifying the column reference explicitly.
-- =============================================================================

BEGIN;

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

    -- FIX (1511): table aliased and column explicitly qualified to remove
    -- the ambiguity against this function's own opening_balances_posted
    -- OUT parameter.
    SELECT COALESCE(bas.opening_balances_posted, FALSE) INTO v_posted
    FROM business_accounting_status bas
    WHERE bas.business_id = p_business_id;

    has_chart_of_accounts := v_coa_count > 0;
    chart_of_accounts_count := v_coa_count;
    has_opening_balances := v_has_opening_balances;
    opening_balances_posted := COALESCE(v_posted, FALSE);

    IF NOT has_chart_of_accounts THEN
        v_reasons := array_append(v_reasons, 'Chart of accounts has not been created');
    END IF;

    -- Opening balances are optional (a genuine zero-balance startup is
    -- legitimate) — not posting is only flagged if balances were entered
    -- but never posted, which is a half-finished state worth surfacing.
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
-- Verification (run as bizzytrack_user, with tenant context set, matching
-- how the app actually calls this — this is the case that was broken):
--
--   SET app.current_business_id = 'b32bddb0-72ce-4efc-9830-f54eeb81ee9c';
--   SELECT * FROM get_business_setup_completeness('b32bddb0-72ce-4efc-9830-f54eeb81ee9c');
--
-- Expected: no error, one row returned. Given Cutover Test Biz already showed
-- initialization_status = 'COMPLETED' with opening_balances_posted = t in the
-- earlier query, expect is_ready_to_transact = true and reasons = '{}'.
-- =============================================================================
