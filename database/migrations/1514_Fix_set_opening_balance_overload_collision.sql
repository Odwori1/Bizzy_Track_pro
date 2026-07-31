-- ============================================================================
-- MIGRATION: Fix set_opening_balance() overload collision
-- ============================================================================
-- Root cause: migration 1513 added a new trailing parameter
-- (p_is_system_derived) to set_opening_balance() via CREATE OR REPLACE.
-- Postgres only replaces a function when the argument signature matches
-- exactly -- adding a parameter, even with a DEFAULT, creates a second
-- overload rather than replacing the original. Result: the old 7-argument
-- version is still live alongside the new 8-argument one. Any call that
-- supplies exactly 7 arguments is now ambiguous (as proven live -- see
-- chat history, query 4 of the 1513 verification run), and any call context
-- where Postgres *can* resolve the ambiguity risks silently choosing the
-- OLD, unguarded version -- which would mean the derived-balance protection
-- from 1513 is not actually enforced for existing callers.
--
-- Fix: explicitly drop the old 7-argument signature. The 8-argument
-- version from 1513 (with the derived-account guard) becomes the only
-- set_opening_balance() in scope, so every caller resolves to it,
-- including existing code that supplies only the original 7 arguments
-- (the 8th parameter has a DEFAULT FALSE, so old call sites work unchanged
-- and remain fully guarded).
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS set_opening_balance(
    uuid, varchar, numeric, varchar, uuid, date, text
);

-- Confirm only one signature remains after this migration:
--   SELECT proname, pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'set_opening_balance';
-- Expected: exactly one row, 8 arguments, ending in p_is_system_derived boolean.

COMMIT;
