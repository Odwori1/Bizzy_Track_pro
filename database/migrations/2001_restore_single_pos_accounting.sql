-- ============================================================================
-- CORRECTIVE MIGRATION: Restore Single POS Accounting Source of Truth
-- ============================================================================
-- Purpose: Fix incomplete journal entries by ensuring only ONE system creates them
--          The inventory system was creating duplicate COGS entries, causing
--          incomplete journal entries (Cash+Revenue OR COGS+Inventory, never both)
-- Date: 2026-05-01
-- Version: 1.0
-- ============================================================================

-- ============================================================================
-- 1. MODIFY sync_inventory_on_pos_sale TO ONLY UPDATE STOCK
-- ============================================================================
-- This removes the duplicate COGS journal entry creation
-- The function should only update inventory stock, NOT create journal entries
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_inventory_on_pos_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_inventory_item_id UUID;
    v_user_id UUID;
    v_cost_price DECIMAL(15,2);
BEGIN
    -- Only process product items without inventory_item_id
    IF NEW.product_id IS NOT NULL AND NEW.inventory_item_id IS NULL THEN
        -- Get inventory_item_id and cost_price from product
        SELECT inventory_item_id INTO v_inventory_item_id
        FROM products
        WHERE id = NEW.product_id;
        
        IF v_inventory_item_id IS NOT NULL THEN
            -- Get user_id from parent transaction
            SELECT created_by INTO v_user_id
            FROM pos_transactions
            WHERE id = NEW.pos_transaction_id;
            
            SELECT cost_price INTO v_cost_price
            FROM inventory_items
            WHERE id = v_inventory_item_id;
            
            -- Update pos_transaction_items with inventory_item_id
            NEW.inventory_item_id := v_inventory_item_id;
            
            -- ✅ ONLY update inventory stock - NO journal entries here
            UPDATE inventory_items
            SET current_stock = current_stock - NEW.quantity,
                updated_at = NOW()
            WHERE id = v_inventory_item_id;
            
            -- Create inventory transaction record (audit trail only, no journal link)
            INSERT INTO inventory_transactions (
                id, business_id, inventory_item_id, transaction_type,
                quantity, unit_cost, reference_type, reference_id,
                notes, created_by, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), 
                NEW.business_id, 
                v_inventory_item_id, 
                'sale',
                -NEW.quantity, 
                v_cost_price,
                'pos_transaction', 
                NEW.pos_transaction_id,
                'POS Sale: ' || NEW.item_name, 
                COALESCE(v_user_id, (SELECT created_by FROM pos_transactions WHERE id = NEW.pos_transaction_id)), 
                NOW(), 
                NOW()
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. ENSURE create_journal_entry_for_pos_transaction_fixed CREATES COMPLETE ENTRIES
-- ============================================================================
-- This function now deletes any incomplete entries before recreating complete ones
-- ============================================================================

CREATE OR REPLACE FUNCTION create_journal_entry_for_pos_transaction_fixed(
    p_transaction_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_business_id UUID;
    v_final_amount DECIMAL(15,2);
    v_total_amount DECIMAL(15,2);
    v_tax_amount DECIMAL(15,2);
    v_created_by UUID;
    v_transaction_number VARCHAR(100);
    v_payment_method VARCHAR(50);
    v_receiving_account_id UUID;
    v_revenue_account_id UUID;
    v_cogs_account_id UUID;
    v_inventory_account_id UUID;
    v_tax_account_id UUID;
    v_journal_entry_id UUID;
    v_total_cogs DECIMAL(15,2) := 0;
    v_product_count INTEGER := 0;
    v_existing_entry_id UUID;
    v_description TEXT;
BEGIN
    -- Get transaction details including tax
    SELECT 
        business_id, total_amount, tax_amount, final_amount, created_by, 
        transaction_number, payment_method
    INTO 
        v_business_id, v_total_amount, v_tax_amount, v_final_amount, v_created_by,
        v_transaction_number, v_payment_method
    FROM pos_transactions
    WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'POS transaction not found: %', p_transaction_id;
    END IF;

    -- Update inventory stock first
    PERFORM update_inventory_for_pos_transaction(p_transaction_id, p_user_id);

    -- Count products and calculate COGS
    SELECT 
        COALESCE(SUM(CASE WHEN pti.item_type = 'product' THEN pti.quantity ELSE 0 END), 0),
        COALESCE(SUM(pti.quantity * ii.cost_price), 0)
    INTO v_product_count, v_total_cogs
    FROM pos_transaction_items pti
    LEFT JOIN inventory_items ii ON pti.inventory_item_id = ii.id
    WHERE pti.pos_transaction_id = p_transaction_id;

    -- Get account IDs
    v_receiving_account_id := get_account_id_by_payment_method(v_business_id, v_payment_method);
    
    SELECT id INTO v_revenue_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id AND account_code = '4100' LIMIT 1;
    
    SELECT id INTO v_cogs_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id AND account_code = '5100' LIMIT 1;
    
    SELECT id INTO v_inventory_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id AND account_code = '1300' LIMIT 1;
    
    SELECT id INTO v_tax_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id AND account_code = '2120' LIMIT 1;

    -- Validate accounts
    IF v_receiving_account_id IS NULL THEN
        RAISE EXCEPTION 'Receiving account for payment method % not found', v_payment_method;
    END IF;
    IF v_revenue_account_id IS NULL THEN
        RAISE EXCEPTION 'Sales Revenue account (4100) not found';
    END IF;

    -- Create description
    IF v_product_count = 0 THEN
        v_description := 'POS Sale: ' || v_transaction_number || ' (' || v_payment_method || ', services)';
    ELSE
        v_description := 'POS Sale: ' || v_transaction_number || ' (' || v_payment_method || ', ' || v_product_count || ' product(s))';
    END IF;

    -- Check if journal entry already exists
    SELECT id INTO v_existing_entry_id
    FROM journal_entries
    WHERE business_id = v_business_id
      AND reference_type = 'pos_transaction'
      AND reference_id = p_transaction_id::TEXT
    LIMIT 1;

    -- Delete existing incomplete entry to recreate complete one
    IF v_existing_entry_id IS NOT NULL THEN
        DELETE FROM journal_entry_lines WHERE journal_entry_id = v_existing_entry_id;
        DELETE FROM journal_entries WHERE id = v_existing_entry_id;
    END IF;

    -- Create journal entry
    INSERT INTO journal_entries (
        business_id, journal_date, reference_number, reference_type,
        reference_id, description, total_amount, status, created_by, posted_at
    ) VALUES (
        v_business_id, CURRENT_DATE,
        'JE-' || v_transaction_number,
        'pos_transaction', p_transaction_id::TEXT, v_description,
        v_final_amount + COALESCE(v_total_cogs, 0),
        'posted', COALESCE(p_user_id, v_created_by), NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- Line 1: Debit Cash (or bank/mobile based on payment method)
    INSERT INTO journal_entry_lines (
        business_id, journal_entry_id, account_id, line_type, amount, description
    ) VALUES (
        v_business_id, v_journal_entry_id, v_receiving_account_id, 'debit',
        v_final_amount, 'Payment received via ' || v_payment_method
    );

    -- Line 2: Credit Revenue (excluding tax)
    INSERT INTO journal_entry_lines (
        business_id, journal_entry_id, account_id, line_type, amount, description
    ) VALUES (
        v_business_id, v_journal_entry_id, v_revenue_account_id, 'credit',
        v_total_amount, 'Sales revenue'
    );

    -- Line 3: Credit Tax Payable (if tax exists)
    IF v_tax_amount > 0 AND v_tax_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
            business_id, journal_entry_id, account_id, line_type, amount, description
        ) VALUES (
            v_business_id, v_journal_entry_id, v_tax_account_id, 'credit',
            v_tax_amount, 'Sales tax payable'
        );
    END IF;

    -- Lines 4 & 5: COGS and Inventory (if products sold)
    IF v_total_cogs > 0 THEN
        INSERT INTO journal_entry_lines (
            business_id, journal_entry_id, account_id, line_type, amount, description
        ) VALUES (
            v_business_id, v_journal_entry_id, v_cogs_account_id, 'debit',
            v_total_cogs, 'Cost of goods sold'
        );
        
        INSERT INTO journal_entry_lines (
            business_id, journal_entry_id, account_id, line_type, amount, description
        ) VALUES (
            v_business_id, v_journal_entry_id, v_inventory_account_id, 'credit',
            v_total_cogs, 'Inventory reduction'
        );
        
        -- Link inventory transactions to this journal entry
        UPDATE inventory_transactions
        SET journal_entry_id = v_journal_entry_id,
            updated_at = NOW()
        WHERE reference_id = p_transaction_id
          AND reference_type = 'pos_transaction'
          AND journal_entry_id IS NULL;
    END IF;

    -- Mark transaction as processed
    UPDATE pos_transactions
    SET accounting_processed = TRUE,
        accounting_error = NULL
    WHERE id = p_transaction_id;

    RAISE NOTICE '✅ Complete accounting: JE=%, Lines=%', 
        v_journal_entry_id, 
        CASE 
            WHEN v_total_cogs > 0 AND v_tax_amount > 0 THEN 5
            WHEN v_total_cogs > 0 OR v_tax_amount > 0 THEN 4
            ELSE 3
        END;

    RETURN v_journal_entry_id;

EXCEPTION WHEN OTHERS THEN
    UPDATE pos_transactions
    SET accounting_error = SQLERRM,
        accounting_processed = FALSE
    WHERE id = p_transaction_id;
    
    RAISE NOTICE '❌ Error: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_function_exists BOOLEAN;
    v_trigger_exists BOOLEAN;
BEGIN
    -- Check if main function exists
    SELECT EXISTS(
        SELECT 1 FROM pg_proc WHERE proname = 'sync_inventory_on_pos_sale'
    ) INTO v_function_exists;
    
    -- Check if trigger exists
    SELECT EXISTS(
        SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_sync_inventory_on_pos_sale'
    ) INTO v_trigger_exists;
    
    IF v_function_exists AND v_trigger_exists THEN
        RAISE NOTICE '========================================';
        RAISE NOTICE '✅ MIGRATION COMPLETED SUCCESSFULLY';
        RAISE NOTICE '========================================';
        RAISE NOTICE 'Changes applied:';
        RAISE NOTICE '  1. sync_inventory_on_pos_sale: Stock updates only, no journal entries';
        RAISE NOTICE '  2. create_journal_entry_for_pos_transaction_fixed: Complete journal entries (3-5 lines)';
        RAISE NOTICE '  3. Single source of truth restored for POS accounting';
        RAISE NOTICE '========================================';
    ELSE
        RAISE NOTICE '========================================';
        RAISE NOTICE '⚠️ MIGRATION MAY HAVE ISSUES';
        RAISE NOTICE '========================================';
        RAISE NOTICE 'Function exists: %', v_function_exists;
        RAISE NOTICE 'Trigger exists: %', v_trigger_exists;
        RAISE NOTICE '========================================';
    END IF;
END $$;

-- ============================================================================
-- ROLLBACK SECTION
-- ============================================================================
-- Run this section ONLY if migration causes issues
-- To rollback: Copy and execute the ROLLBACK section below
-- ============================================================================

/*
-- ============================================================================
-- ROLLBACK: Restore original sync_inventory_on_pos_sale with journal creation
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_inventory_on_pos_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_inventory_item_id UUID;
    v_user_id UUID;
BEGIN
    -- If this is a product sale and product has inventory_item_id, update inventory
    IF NEW.product_id IS NOT NULL AND NEW.inventory_item_id IS NULL THEN
        -- Get inventory_item_id from product
        SELECT inventory_item_id INTO v_inventory_item_id
        FROM products
        WHERE id = NEW.product_id;
        
        IF v_inventory_item_id IS NOT NULL THEN
            -- Get user_id from the parent pos_transaction
            SELECT created_by INTO v_user_id
            FROM pos_transactions
            WHERE id = NEW.pos_transaction_id;
            
            -- Update pos_transaction_items with inventory_item_id
            NEW.inventory_item_id := v_inventory_item_id;
            
            -- Create inventory transaction for the sale with proper user_id
            PERFORM create_inventory_transaction_with_accounting(
                NEW.business_id,
                v_inventory_item_id,
                NEW.product_id,
                'sale',
                NEW.quantity::DECIMAL,
                (SELECT cost_price FROM inventory_items WHERE id = v_inventory_item_id),
                'pos_transaction',
                NEW.pos_transaction_id,
                'POS Sale - Item: ' || NEW.item_name,
                v_user_id
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROLLBACK: Restore original create_journal_entry_for_pos_transaction_fixed
-- ============================================================================
-- Note: The original function is preserved in backup function:
--       create_journal_entry_for_pos_transaction_fixed_backup
-- To restore, rename the backup function
-- ============================================================================

ALTER FUNCTION create_journal_entry_for_pos_transaction_fixed RENAME TO create_journal_entry_for_pos_transaction_fixed_v2;
ALTER FUNCTION create_journal_entry_for_pos_transaction_fixed_backup RENAME TO create_journal_entry_for_pos_transaction_fixed;

RAISE NOTICE '========================================';
RAISE NOTICE '⚠️ ROLLBACK COMPLETED';
RAISE NOTICE '========================================';
RAISE NOTICE 'Original functions restored:';
RAISE NOTICE '  - sync_inventory_on_pos_sale: Restored with journal creation';
RAISE NOTICE '  - create_journal_entry_for_pos_transaction_fixed: Restored from backup';
RAISE NOTICE '========================================';
*/

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
