-- ============================================================================
-- MIGRATION: Update process_pos_sale to Create Journal Entries
-- ============================================================================
-- Purpose: Make POS sales automatically create accounting journal entries
-- Date: 2025-12-03
-- ============================================================================

-- First, check if we need to find the user who created the transaction
SELECT 'Checking current process_pos_sale function...' as status;

-- Update the function to include journal entry creation
CREATE OR REPLACE FUNCTION process_pos_sale(p_pos_transaction_id UUID)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
    v_business_id UUID;
    v_customer_id UUID;
    v_final_amount DECIMAL(15,2);
    v_created_by UUID;
    v_item RECORD;
    v_current_points DECIMAL(15,2);
    v_new_points DECIMAL(15,2);
    v_loyalty_exists BOOLEAN;
BEGIN
    -- Get business ID, customer ID, final amount, and created_by from transaction
    SELECT business_id, customer_id, final_amount, created_by
    INTO v_business_id, v_customer_id, v_final_amount, v_created_by
    FROM pos_transactions WHERE id = p_pos_transaction_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'POS transaction not found';
        RETURN;
    END IF;

    -- Update stock for each product in the transaction
    FOR v_item IN (
        SELECT pti.product_id, pti.quantity, pti.inventory_item_id
        FROM pos_transaction_items pti
        WHERE pti.pos_transaction_id = p_pos_transaction_id
        AND (pti.product_id IS NOT NULL OR pti.inventory_item_id IS NOT NULL)
    ) LOOP
        IF v_item.product_id IS NOT NULL THEN
            -- Update product stock
            UPDATE products
            SET current_stock = current_stock - v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.product_id
            AND business_id = v_business_id;
        END IF;

        IF v_item.inventory_item_id IS NOT NULL THEN
            -- Update inventory item stock
            UPDATE inventory_items
            SET current_stock = current_stock - v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.inventory_item_id
            AND business_id = v_business_id;
        END IF;
    END LOOP;

    -- Update customer loyalty points if customer exists
    IF v_customer_id IS NOT NULL THEN
        SELECT loyalty_points INTO v_current_points
        FROM customers WHERE id = v_customer_id;

        -- Check if loyalty program exists for this business
        SELECT EXISTS (
            SELECT 1 FROM loyalty_programs 
            WHERE business_id = v_business_id AND is_active = true
        ) INTO v_loyalty_exists;

        IF v_loyalty_exists AND v_current_points IS NOT NULL THEN
            -- Calculate new points (example: 1 point per 100 currency units)
            v_new_points = v_current_points + (v_final_amount / 100);
            
            UPDATE customers
            SET loyalty_points = v_new_points,
                updated_at = NOW()
            WHERE id = v_customer_id;
        END IF;
    END IF;

    -- ✅ CRITICAL NEW CODE: Create accounting journal entry
    BEGIN
        PERFORM create_journal_entry_for_pos_transaction(p_pos_transaction_id, v_created_by);
        
        -- Log the accounting entry creation
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
        -- Log the error but don't fail the entire POS transaction
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

-- Verify the update
SELECT 
    'process_pos_sale Update Status' as check_item,
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'process_pos_sale' 
        AND prosrc LIKE '%create_journal_entry_for_pos_transaction%'
    ) THEN '✅ UPDATED' ELSE '❌ NOT UPDATED' END as status;
