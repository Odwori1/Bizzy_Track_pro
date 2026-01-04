-- ============================================================================
-- MIGRATION 088: Remove Duplicate Business Account Creation Triggers
-- ============================================================================
-- Purpose: Fix business registration by consolidating account creation logic
-- Issue: Multiple triggers + explicit calls causing race conditions
-- Solution: Remove ALL triggers, use explicit application-level control
-- Date: 2026-01-03
-- Severity: P0 - Production Blocker Fix
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 088: PRODUCTION FIX';
    RAISE NOTICE 'Removing Duplicate Trigger Logic';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
END;
$$;

-- ============================================================================
-- PART 1: REMOVE OLD TRIGGER (Migration 034)
-- ============================================================================
DO $$
BEGIN
    -- Drop old trigger from migration 034
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trigger_create_business_accounts'
    ) THEN
        DROP TRIGGER trigger_create_business_accounts ON businesses;
        RAISE NOTICE '✅ Removed: trigger_create_business_accounts';
    ELSE
        RAISE NOTICE '⚠️  Not found: trigger_create_business_accounts (already removed)';
    END IF;

    -- Drop old function from migration 034
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'create_accounts_for_new_business'
    ) THEN
        DROP FUNCTION create_accounts_for_new_business();
        RAISE NOTICE '✅ Removed: create_accounts_for_new_business()';
    ELSE
        RAISE NOTICE '⚠️  Not found: create_accounts_for_new_business() (already removed)';
    END IF;
END;
$$;

-- ============================================================================
-- PART 2: REMOVE NEW TRIGGER (Migration 083)
-- ============================================================================
DO $$
BEGIN
    -- Drop new trigger from migration 083
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trg_business_created_accounts'
    ) THEN
        DROP TRIGGER trg_business_created_accounts ON businesses;
        RAISE NOTICE '✅ Removed: trg_business_created_accounts';
    ELSE
        RAISE NOTICE '⚠️  Not found: trg_business_created_accounts (already removed)';
    END IF;

    -- Drop function from migration 083
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'on_business_created_create_accounts'
    ) THEN
        DROP FUNCTION on_business_created_create_accounts();
        RAISE NOTICE '✅ Removed: on_business_created_create_accounts()';
    ELSE
        RAISE NOTICE '⚠️  Not found: on_business_created_create_accounts() (already removed)';
    END IF;
END;
$$;

-- ============================================================================
-- PART 3: VERIFY CLEANUP
-- ============================================================================
DO $$
DECLARE
    v_trigger_count INT;
    v_function_count INT;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION';
    RAISE NOTICE '========================================';

    -- Count remaining business-related triggers
    SELECT COUNT(*) INTO v_trigger_count
    FROM information_schema.triggers
    WHERE event_object_table = 'businesses'
      AND trigger_name IN (
          'trigger_create_business_accounts',
          'trg_business_created_accounts'
      );

    -- Count remaining account creation functions
    SELECT COUNT(*) INTO v_function_count
    FROM pg_proc
    WHERE proname IN (
        'create_accounts_for_new_business',
        'on_business_created_create_accounts'
    );

    RAISE NOTICE 'Remaining duplicate triggers: %', v_trigger_count;
    RAISE NOTICE 'Remaining duplicate functions: %', v_function_count;
    RAISE NOTICE '';

    IF v_trigger_count = 0 AND v_function_count = 0 THEN
        RAISE NOTICE '✅ SUCCESS: All duplicate triggers removed';
    ELSE
        RAISE WARNING '⚠️  WARNING: Some duplicates may remain';
        RAISE WARNING '   Triggers: % (expected: 0)', v_trigger_count;
        RAISE WARNING '   Functions: % (expected: 0)', v_function_count;
    END IF;
END;
$$;

-- ============================================================================
-- PART 4: VERIFY CORE FUNCTIONS STILL EXIST
-- ============================================================================
DO $$
DECLARE
    v_has_accounts_fn BOOLEAN;
    v_has_wallets_fn BOOLEAN;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CORE FUNCTIONS CHECK';
    RAISE NOTICE '========================================';

    -- Check if core functions exist (these should remain)
    SELECT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'ensure_business_has_complete_accounts'
    ) INTO v_has_accounts_fn;

    SELECT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'ensure_business_has_default_wallets'
    ) INTO v_has_wallets_fn;

    IF v_has_accounts_fn THEN
        RAISE NOTICE '✅ Core function exists: ensure_business_has_complete_accounts()';
    ELSE
        RAISE EXCEPTION '❌ CRITICAL: ensure_business_has_complete_accounts() is missing!';
    END IF;

    IF v_has_wallets_fn THEN
        RAISE NOTICE '✅ Core function exists: ensure_business_has_default_wallets()';
    ELSE
        RAISE EXCEPTION '❌ CRITICAL: ensure_business_has_default_wallets() is missing!';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '✅ All core functions present and ready';
END;
$$;

-- ============================================================================
-- PART 5: FINAL STATUS REPORT
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 088 COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE '✅ CHANGES APPLIED:';
    RAISE NOTICE '   • Removed: trigger_create_business_accounts (migration 034)';
    RAISE NOTICE '   • Removed: trg_business_created_accounts (migration 083)';
    RAISE NOTICE '   • Removed: Associated trigger functions';
    RAISE NOTICE '';
    RAISE NOTICE '✅ CORE FUNCTIONS RETAINED:';
    RAISE NOTICE '   • ensure_business_has_complete_accounts()';
    RAISE NOTICE '   • ensure_business_has_default_wallets()';
    RAISE NOTICE '';
    RAISE NOTICE '📝 NEXT STEPS:';
    RAISE NOTICE '   1. businessService.js already has explicit function calls';
    RAISE NOTICE '   2. Test business registration';
    RAISE NOTICE '   3. Monitor logs for successful account creation';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 BUSINESS LOGIC NOW IN APPLICATION LAYER';
    RAISE NOTICE '   Account creation controlled by businessService.js (lines 149-153)';
    RAISE NOTICE '';
END;
$$;

-- List remaining triggers on businesses table for visibility
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    '✅ Remaining (non-conflicting)' as status
FROM information_schema.triggers
WHERE event_object_table = 'businesses'
ORDER BY trigger_name;

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION QUERY
-- ============================================================================
-- Run this after migration to verify state:
-- 
-- SELECT 
--     COUNT(*) as trigger_count,
--     string_agg(trigger_name, ', ') as remaining_triggers
-- FROM information_schema.triggers
-- WHERE event_object_table = 'businesses';
-- 
-- Expected: 0 account-creation triggers
-- ============================================================================
