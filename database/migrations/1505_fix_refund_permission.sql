-- ============================================================================
-- Migration 1505: Fix refund permission naming gap + broken approval-role check
--
-- Two independent, unrelated bugs found during Phase 20 live verification:
--
--   1. refundRoutes.js required permissions 'refund:process' / 'refund:approve'
--      / 'refund:reject' that were never added to the permission catalog.
--      refund:approve/reject duplicate functionality already correctly gated
--      by refund_approval:approve/reject in refundApprovalRoutes.js — those
--      two route-level checks should be repointed in application code (see
--      accompanying refundRoutes.js patch, not part of this SQL migration).
--      refund:process is genuinely new and has no existing equivalent.
--
--   2. user_can_approve_refunds() was silently replaced (via CREATE OR REPLACE
--      in migration 1017) with a version that queries `user_roles`, a table
--      that does not exist anywhere in this schema and has no application
--      code that ever populates it. Every call throws. Restored to check
--      users.role (owner bypass) then refund_approval_settings.approver_roles,
--      the tables actually populated by this application.
--
-- Idempotent: safe to run multiple times.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- STEP 1: Fix the broken approval-authorization function (CREATE OR REPLACE
-- is naturally idempotent)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_approve_refunds(
    p_user_id UUID,
    p_business_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $function$
DECLARE
    v_user_role VARCHAR(50);
    v_allowed_roles TEXT[];
BEGIN
    SELECT role INTO v_user_role
    FROM users
    WHERE id = p_user_id AND business_id = p_business_id;

    IF v_user_role IS NULL THEN
        RETURN FALSE; -- user not found for this business
    END IF;

    IF v_user_role = 'owner' THEN
        RETURN TRUE;
    END IF;

    SELECT approver_roles INTO v_allowed_roles
    FROM refund_approval_settings
    WHERE business_id = p_business_id;

    RETURN v_user_role = ANY(COALESCE(v_allowed_roles, ARRAY['owner','manager']::text[]));
END;
$function$;

-- ----------------------------------------------------------------------------
-- STEP 2: Add the one genuinely new permission to the system template
-- (business_id IS NULL). Guarded with NOT EXISTS since a plain unique
-- constraint on (business_id, name) does not dedupe across multiple NULLs.
-- ----------------------------------------------------------------------------
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
SELECT NULL, 'refund:process', 'refund', 'Execute an approved or auto-approved refund', 'refund', 'process', true
WHERE NOT EXISTS (
    SELECT 1 FROM permissions WHERE business_id IS NULL AND name = 'refund:process'
);

-- ----------------------------------------------------------------------------
-- STEP 3: Backfill refund:process for currently-active businesses only
-- (Cutover Test Biz + accounting10). Deliberately NOT backfilling the
-- other 55 legacy/test businesses per current scope decision.
-- ----------------------------------------------------------------------------
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
SELECT b.id, 'refund:process', 'refund', 'Execute an approved or auto-approved refund', 'refund', 'process', false
FROM businesses b
WHERE b.id IN (
    'b32bddb0-72ce-4efc-9830-f54eeb81ee9c', -- Cutover Test Biz
    'aac7efb9-ce54-4208-8cf8-6f17086be720'  -- accounting 10
)
AND NOT EXISTS (
    SELECT 1 FROM permissions p WHERE p.business_id = b.id AND p.name = 'refund:process'
);

-- ----------------------------------------------------------------------------
-- STEP 4: Grant refund:process to owner + manager roles for those same
-- two businesses. ON CONFLICT DO NOTHING matches the pattern already used
-- in businessService.js's own role_permissions inserts.
-- ----------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.business_id = r.business_id AND p.name = 'refund:process'
WHERE r.business_id IN (
    'b32bddb0-72ce-4efc-9830-f54eeb81ee9c',
    'aac7efb9-ce54-4208-8cf8-6f17086be720'
)
AND r.name IN ('owner', 'manager')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-migration: CREATE OR REPLACE resets privileges to owner-only
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.user_can_approve_refunds(uuid, uuid) TO bizzytrack_user;
