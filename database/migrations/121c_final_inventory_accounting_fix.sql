-- ============================================================================
-- MIGRATION 121c: FINAL INVENTORY ACCOUNTING FUNCTION FIX
-- ============================================================================
-- Purpose: Create the internal use accounting function without syntax errors
-- Date: 2026-01-08
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FINAL INVENTORY ACCOUNTING FUNCTION FIX';
    RAISE NOTICE '========================================';
END;
$$;

-- ============================================================================
-- PART 1: DROP EXISTING FUNCTION IF IT EXISTS
-- ============================================================================

DROP FUNCTION IF EXISTS create_internal_use_accounting(
    UUID, UUID, DECIMAL, DECIMAL, TEXT, UUID
);

-- ============================================================================
-- PART 2: CREATE THE FUNCTION CORRECTLY
-- ============================================================================

CREATE OR REPLACE FUNCTION create_internal_use_accounting(
    p_business_id UUID,
    p_inventory_item_id UUID,
    p_quantity DECIMAL(12,4),
    p_unit_cost DECIMAL(12,4),
    p_notes TEXT,
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_item_name TEXT;
    v_category_type TEXT;
    v_expense_account_id UUID;
    v_inventory_account_id UUID;
    v_total_cost DECIMAL(15,4);
    v_journal_entry_id UUID;
    v_transaction_id UUID;
BEGIN
    -- Get item details and category
    SELECT 
        ii.name,
        ic.category_type,
        ic.expense_account_id
    INTO 
        v_item_name,
        v_category_type,
        v_expense_account_id
    FROM inventory_items ii
    LEFT JOIN inventory_categories ic ON ii.category_id = ic.id
    WHERE ii.id = p_inventory_item_id 
      AND ii.business_id = p_business_id;
    
    IF v_item_name IS NULL THEN
        RAISE EXCEPTION 'Inventory item not found: %', p_inventory_item_id;
    END IF;
    
    -- Get inventory asset account (1300)
    SELECT id INTO v_inventory_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id AND account_code = '1300';
    
    IF v_inventory_account_id IS NULL THEN
        RAISE EXCEPTION 'Inventory account (1300) not found for business: %', p_business_id;
    END IF;
    
    -- If category doesn't have expense account, get default based on type
    IF v_expense_account_id IS NULL THEN
        IF v_category_type = 'sale' THEN
            SELECT id INTO v_expense_account_id
            FROM chart_of_accounts
            WHERE business_id = p_business_id AND account_code = '5209';
        ELSE
            SELECT id INTO v_expense_account_id
            FROM chart_of_accounts
            WHERE business_id = p_business_id AND account_code = '5201';
        END IF;
        
        IF v_expense_account_id IS NULL THEN
            -- Ultimate fallback: any expense account
            SELECT id INTO v_expense_account_id
            FROM chart_of_accounts
            WHERE business_id = p_business_id AND account_type = 'expense'
            LIMIT 1;
            
            IF v_expense_account_id IS NULL THEN
                RAISE EXCEPTION 'No expense account found for business: %', p_business_id;
            END IF;
        END IF;
    END IF;
    
    v_total_cost := p_quantity * p_unit_cost;
    
    -- Create journal entry
    INSERT INTO journal_entries (
        business_id, journal_date, reference_number, reference_type,
        reference_id, description, total_amount, created_by, posted_at
    ) VALUES (
        p_business_id, NOW(), 'INT-' || EXTRACT(EPOCH FROM NOW())::BIGINT,
        'inventory_internal_use', p_inventory_item_id,
        'Internal use: ' || p_quantity::TEXT || ' of ' || v_item_name || ' - ' || COALESCE(p_notes, ''),
        v_total_cost, p_user_id, NOW()
    ) RETURNING id INTO v_journal_entry_id;
    
    -- Debit: Expense Account
    INSERT INTO journal_entry_lines (
        business_id, journal_entry_id, account_id, line_type, amount, description
    ) VALUES (
        p_business_id, v_journal_entry_id, v_expense_account_id, 'debit',
        v_total_cost, 'Expense: ' || v_item_name || ' used internally'
    );
    
    -- Credit: Inventory Asset Account
    INSERT INTO journal_entry_lines (
        business_id, journal_entry_id, account_id, line_type, amount, description
    ) VALUES (
        p_business_id, v_journal_entry_id, v_inventory_account_id, 'credit',
        v_total_cost, 'Inventory reduction: ' || v_item_name || ' used internally'
    );
    
    -- Create inventory transaction
    INSERT INTO inventory_transactions (
        business_id, inventory_item_id, transaction_type,
        quantity, unit_cost, reference_type, reference_id,
        journal_entry_id, notes, created_by
    ) VALUES (
        p_business_id, p_inventory_item_id, 'write_off',
        -p_quantity, p_unit_cost, 'internal_use', p_inventory_item_id,
        v_journal_entry_id, 'Internal use: ' || COALESCE(p_notes, ''), p_user_id
    ) RETURNING id INTO v_transaction_id;
    
    RETURN v_transaction_id;
    
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Internal use accounting failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3: VERIFY IN DO BLOCK
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Created create_internal_use_accounting function';
    
    -- Test if function exists
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'create_internal_use_accounting'
    ) THEN
        RAISE NOTICE '✅ Function verified in pg_proc';
        
        -- Show function signature
        RAISE NOTICE 'Function signature:';
        RAISE NOTICE '  create_internal_use_accounting(business_id, inventory_item_id, quantity, unit_cost, notes, user_id)';
    ELSE
        RAISE NOTICE '❌ Function not found in pg_proc';
    END IF;
END;
$$;

-- ============================================================================
-- PART 4: TEST THE FUNCTION (Optional - can be commented out)
-- ============================================================================
/*
DO $$
DECLARE
    v_test_item_id UUID;
    v_test_result UUID;
BEGIN
    -- Get a test inventory item
    SELECT id INTO v_test_item_id
    FROM inventory_items 
    WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
    LIMIT 1;
    
    IF v_test_item_id IS NOT NULL THEN
        -- Test the function
        BEGIN
            SELECT create_internal_use_accounting(
                'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
                v_test_item_id,
                1.0,
                10000.00,
                'Test function',
                'd5f407e3-ac71-4b91-b03e-ec50f908c3d1'
            ) INTO v_test_result;
            
            RAISE NOTICE '✅ Function test successful: %', v_test_result;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '❌ Function test failed: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE '⚠️ No inventory items found for testing';
    END IF;
END;
$$;
*/

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Function created successfully';
    RAISE NOTICE '✅ Ready for inventoryService.js integration';
    RAISE NOTICE '';
    RAISE NOTICE 'Next: Update inventoryService.js recordMovement function';
    RAISE NOTICE 'to call create_internal_use_accounting() for internal_use';
END;
$$;
