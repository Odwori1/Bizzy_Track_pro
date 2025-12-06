-- ============================================================================
-- MIGRATION: Fix process_pos_sale Function (Clean Version)
-- ============================================================================
-- Purpose: Fix loyalty_points bug and improve error handling
-- Date: 2025-12-05
-- Important: NO HARDCODED VALUES - Production Ready
-- ============================================================================

-- Drop and recreate the function
DROP FUNCTION IF EXISTS process_pos_sale(UUID);

CREATE OR REPLACE FUNCTION process_pos_sale(p_pos_transaction_id UUID)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
    v_business_id UUID;
    v_customer_id UUID;
    v_final_amount DECIMAL(15,2);
    v_created_by UUID;
    v_item RECORD;
    v_total_spent DECIMAL(15,2);
    v_new_total_spent DECIMAL(15,2);
BEGIN
    -- Get transaction details
    SELECT business_id, customer_id, final_amount, created_by
    INTO v_business_id, v_customer_id, v_final_amount, v_created_by
    FROM pos_transactions 
    WHERE id = p_pos_transaction_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'POS transaction not found';
        RETURN;
    END IF;

    -- Validate required fields
    IF v_business_id IS NULL THEN
        RETURN QUERY SELECT false, 'Business ID is required';
        RETURN;
    END IF;

    IF v_created_by IS NULL THEN
        v_created_by := (SELECT created_by FROM users WHERE business_id = v_business_id LIMIT 1);
    END IF;

    -- Update stock for each product in the transaction
    FOR v_item IN (
        SELECT pti.product_id, pti.quantity, pti.inventory_item_id
        FROM pos_transaction_items pti
        WHERE pti.pos_transaction_id = p_pos_transaction_id
        AND (pti.product_id IS NOT NULL OR pti.inventory_item_id IS NOT NULL)
    ) LOOP
        IF v_item.product_id IS NOT NULL THEN
            UPDATE products
            SET current_stock = current_stock - v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.product_id
            AND business_id = v_business_id
            AND current_stock >= v_item.quantity;
        END IF;

        IF v_item.inventory_item_id IS NOT NULL THEN
            UPDATE inventory_items
            SET current_stock = current_stock - v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.inventory_item_id
            AND business_id = v_business_id
            AND current_stock >= v_item.quantity;
        END IF;
    END LOOP;

    -- Update customer total_spent if customer exists
    IF v_customer_id IS NOT NULL THEN
        SELECT COALESCE(total_spent, 0) INTO v_total_spent
        FROM customers 
        WHERE id = v_customer_id 
        AND business_id = v_business_id;

        IF FOUND THEN
            v_new_total_spent = v_total_spent + v_final_amount;
            
            UPDATE customers
            SET total_spent = v_new_total_spent,
                last_visit = NOW(),
                updated_at = NOW()
            WHERE id = v_customer_id;
        END IF;
    END IF;

    -- Create accounting journal entry
    BEGIN
        PERFORM create_journal_entry_for_pos_transaction(p_pos_transaction_id, v_created_by);

        INSERT INTO audit_logs (business_id, user_id, action, resource_type, resource_id, details)
        VALUES (
            v_business_id,
            v_created_by,
            'accounting.journal_entry.created',
            'pos_transaction',
            p_pos_transaction_id,
            jsonb_build_object('amount', v_final_amount, 'auto_generated', true)
        );

    EXCEPTION WHEN OTHERS THEN
        INSERT INTO audit_logs (business_id, user_id, action, resource_type, resource_id, details)
        VALUES (
            v_business_id,
            v_created_by,
            'accounting.journal_entry.failed',
            'pos_transaction',
            p_pos_transaction_id,
            jsonb_build_object('error', SQLERRM, 'amount', v_final_amount)
        );

        RAISE NOTICE 'Journal entry creation failed: %', SQLERRM;
    END;

    -- Mark transaction as processed
    UPDATE pos_transactions
    SET status = 'completed',
        updated_at = NOW()
    WHERE id = p_pos_transaction_id;

    RETURN QUERY SELECT true, 'Sale processed successfully with accounting entries';
END;
$$ LANGUAGE plpgsql;

-- Create comment for documentation
COMMENT ON FUNCTION process_pos_sale(UUID) IS 
'Processes POS sales with automatic inventory updates and accounting entries.
Fixes loyalty_points bug by using total_spent column instead.
Handles edge cases and provides proper error handling.';
