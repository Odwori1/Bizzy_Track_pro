-- Migration: Fix refund system blockers for production
-- Date: June 11, 2026
-- Issues fixed:
--   1. user_can_approve_refunds() references non-existent user_roles table
--   2. get_pending_refund_approvals() references non-existent pt.customer_name
--   3. Clean up duplicate inventory transactions from previous bug

-- ============================================================================
-- FIX 1: user_can_approve_refunds function
-- Uses correct schema: users.role_id -> roles (no user_roles table)
-- Also checks role_permissions for explicit refund_approval:approve permission
-- ============================================================================

CREATE OR REPLACE FUNCTION user_can_approve_refunds(
    p_user_id UUID,
    p_business_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_role_name VARCHAR(255);
    v_allowed_roles TEXT[];
    v_is_owner BOOLEAN;
    v_has_explicit_permission BOOLEAN;
BEGIN
    -- Check if user is owner (always can approve)
    SELECT (role = 'owner') INTO v_is_owner
    FROM users
    WHERE id = p_user_id AND business_id = p_business_id;

    IF v_is_owner THEN
        RETURN TRUE;
    END IF;

    -- Get user's role name from roles table via users.role_id
    SELECT r.name INTO v_user_role_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.id = p_user_id AND u.business_id = p_business_id;

    -- Get allowed approver roles from settings
    SELECT approver_roles INTO v_allowed_roles
    FROM refund_approval_settings
    WHERE business_id = p_business_id;

    -- Check if user's role is in allowed list
    IF v_user_role_name = ANY(v_allowed_roles) THEN
        RETURN TRUE;
    END IF;

    -- Fallback: check if user's role has explicit refund_approval:approve permission
    SELECT EXISTS (
        SELECT 1
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        JOIN users u ON rp.role_id = u.role_id
        WHERE u.id = p_user_id
          AND u.business_id = p_business_id
          AND p.name = 'refund_approval:approve'
    ) INTO v_has_explicit_permission;

    RETURN v_has_explicit_permission;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIX 2: get_pending_refund_approvals function
-- Removes pt.customer_name reference (column doesn't exist)
-- Uses customer_id join to users table instead, or returns NULL
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pending_refund_approvals(
    p_user_id UUID,
    p_business_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    approval_id UUID,
    refund_id UUID,
    refund_number VARCHAR(50),
    requested_amount NUMERIC(15,2),
    request_reason TEXT,
    requested_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    requester_name VARCHAR(255),
    original_transaction_number VARCHAR(50),
    original_transaction_type VARCHAR(20),
    approval_status VARCHAR(20),
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        raq.id as approval_id,
        raq.refund_id,
        r.refund_number,
        raq.requested_amount,
        raq.request_reason,
        raq.requested_at,
        raq.expires_at,
        req.full_name as requester_name,
        COALESCE(pt.transaction_number, inv.invoice_number) as original_transaction_number,
        r.original_transaction_type,
        raq.approval_status,
        raq.metadata
    FROM refund_approval_queue raq
    JOIN refunds r ON raq.refund_id = r.id
    LEFT JOIN users req ON raq.requested_by = req.id
    LEFT JOIN pos_transactions pt ON r.original_transaction_id = pt.id
        AND r.original_transaction_type = 'POS'
    LEFT JOIN invoices inv ON r.original_transaction_id = inv.id
        AND r.original_transaction_type = 'INVOICE'
    WHERE raq.business_id = p_business_id
      AND raq.approval_status = 'PENDING'
      AND raq.expires_at > NOW()
      -- If p_user_id is provided, only show approvals the user CAN approve
      AND (p_user_id IS NULL OR user_can_approve_refunds(p_user_id, p_business_id))
    ORDER BY raq.requested_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIX 3: Clean up duplicate inventory transactions from previous refunds
-- Mark duplicates so they don't affect stock calculations
-- ============================================================================

-- Mark service-layer duplicates (the ones created by reverseInventory() before trigger)
UPDATE inventory_transactions
SET notes = COALESCE(notes, '') || ' [DUPLICATE - SERVICE LAYER - IGNORED]'
WHERE id IN (
    SELECT it2.id
    FROM inventory_transactions it1
    JOIN inventory_transactions it2 ON it1.reference_id = it2.reference_id
        AND it1.reference_type = it2.reference_type
        AND it1.inventory_item_id = it2.inventory_item_id
        AND it1.quantity = it2.quantity
        AND it1.created_at < it2.created_at
    WHERE it1.reference_type = 'refund'
      AND it2.notes NOT LIKE '%[DUPLICATE%'
      AND it2.notes LIKE 'Refund reversal for%'  -- service layer pattern
);

-- Also mark trigger duplicates if any exist with different pattern
UPDATE inventory_transactions
SET notes = COALESCE(notes, '') || ' [DUPLICATE - TRIGGER - IGNORED]'
WHERE id IN (
    SELECT it2.id
    FROM inventory_transactions it1
    JOIN inventory_transactions it2 ON it1.reference_id = it2.reference_id
        AND it1.reference_type = it2.reference_type
        AND it1.inventory_item_id = it2.inventory_item_id
        AND it1.quantity = it2.quantity
        AND it1.created_at < it2.created_at
    WHERE it1.reference_type = 'refund'
      AND it2.notes NOT LIKE '%[DUPLICATE%'
      AND it2.notes LIKE 'Inventory reversal from refund:%'  -- trigger pattern
);

-- ============================================================================
-- FIX 4: Recalculate correct stock levels after removing duplicate impacts
-- ============================================================================

-- Create a function to recalculate inventory stock from non-duplicate transactions
CREATE OR REPLACE FUNCTION recalculate_inventory_stock(
    p_inventory_item_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
    v_calculated_stock NUMERIC;
BEGIN
    SELECT COALESCE(SUM(
        CASE 
            WHEN transaction_type IN ('sale', 'adjustment_negative', 'transfer_out') THEN -quantity
            WHEN transaction_type IN ('purchase', 'refund', 'adjustment_positive', 'transfer_in') THEN quantity
            ELSE quantity
        END
    ), 0)
    INTO v_calculated_stock
    FROM inventory_transactions
    WHERE inventory_item_id = p_inventory_item_id
      AND notes NOT LIKE '%[DUPLICATE%'
      AND business_id = (SELECT business_id FROM inventory_items WHERE id = p_inventory_item_id);

    RETURN v_calculated_stock;
END;
$$ LANGUAGE plpgsql;

-- Update all inventory items to have correct stock
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM inventory_items WHERE business_id = '0eb7d105-d6cb-43c1-b497-41a710d37b4b'
    LOOP
        UPDATE inventory_items
        SET current_stock = recalculate_inventory_stock(r.id),
            updated_at = NOW()
        WHERE id = r.id;
    END LOOP;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check user_can_approve_refunds works for owner
-- SELECT user_can_approve_refunds('c4d45460-77d5-48f4-88f1-fc8a7acef350', '0eb7d105-d6cb-43c1-b497-41a710d37b4b');
-- Expected: true

-- Check get_pending_refund_approvals works
-- SELECT * FROM get_pending_refund_approvals(NULL, '0eb7d105-d6cb-43c1-b497-41a710d37b4b', 10, 0);
-- Expected: success, no "customer_name" error

-- Check no duplicate inventory transactions remain
-- SELECT reference_id, COUNT(*) as txn_count
-- FROM inventory_transactions
-- WHERE reference_type = 'refund'
--   AND notes NOT LIKE '%[DUPLICATE%'
-- GROUP BY reference_id
-- HAVING COUNT(*) > 1;
-- Expected: 0 rows

-- Check Wireless Mouse stock is correct
-- SELECT name, current_stock FROM inventory_items WHERE product_id = 'aefc1612-87fc-46f8-99f3-6005ec1b994c';
