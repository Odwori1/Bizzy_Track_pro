-- ============================================================================
-- MIGRATION 089: FIX INVENTORY REDUCTION ON SALES (MINIMAL FIX)
-- ============================================================================
-- Issue: Inventory stock not reducing when products are sold
-- Fix: Add inventory updates to existing function
-- Approach: Minimal changes, maintain all existing callers
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MINIMAL INVENTORY REDUCTION FIX';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Fixing: Inventory stock not updating on sales';
    RAISE NOTICE 'File: create_journal_entry_for_pos_transaction_fixed()';
    RAISE NOTICE 'Migration: 073_fix_pos_accounting_and_bank.sql';
    RAISE NOTICE '';
END;
$$;

-- ============================================================================
-- PART 1: UPDATE THE EXISTING FUNCTION
-- ============================================================================
-- We're updating the function that's already being called by the system
-- No new functions, no breaking changes

CREATE OR REPLACE FUNCTION create_journal_entry_for_pos_transaction_fixed(
    p_transaction_id UUID,
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_business_id UUID;
    v_final_amount DECIMAL(15,2);
    v_created_by UUID;
    v_transaction_number VARCHAR(100);
    v_payment_method VARCHAR(50);
    v_receiving_account_id UUID;
    v_revenue_account_id UUID;
    v_cogs_account_id UUID;
    v_inventory_account_id UUID;
    v_journal_entry_id UUID;
    v_total_cogs DECIMAL(15,2) := 0;
    v_item_count INTEGER := 0;
BEGIN
    -- Get transaction details (EXISTING CODE)
    SELECT
        business_id,
        final_amount,
        created_by,
        transaction_number,
        payment_method
    INTO
        v_business_id,
        v_final_amount,
        v_created_by,
        v_transaction_number,
        v_payment_method
    FROM pos_transactions
    WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'POS transaction not found: %', p_transaction_id;
    END IF;

    -- Get DYNAMIC receiving account based on payment method (EXISTING CODE)
    v_receiving_account_id := get_account_id_by_payment_method(v_business_id, v_payment_method);

    -- Get other account IDs (EXISTING CODE)
    SELECT id INTO v_revenue_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '4100'
    LIMIT 1;

    SELECT id INTO v_cogs_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '5100'
    LIMIT 1;

    SELECT id INTO v_inventory_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '1300'
    LIMIT 1;

    -- Validate all accounts exist (EXISTING CODE)
    IF v_receiving_account_id IS NULL THEN
        RAISE EXCEPTION 'Receiving account for payment method % not found', v_payment_method;
    END IF;
    IF v_revenue_account_id IS NULL THEN
        RAISE EXCEPTION 'Sales Revenue account (4100) not found';
    END IF;
    IF v_cogs_account_id IS NULL THEN
        RAISE EXCEPTION 'COGS account (5100) not found';
    END IF;
    IF v_inventory_account_id IS NULL THEN
        RAISE EXCEPTION 'Inventory account (1300) not found';
    END IF;

    -- Calculate total COGS from transaction items (EXISTING CODE)
    SELECT COALESCE(SUM(pti.total_cost), 0), COUNT(*)
    INTO v_total_cogs, v_item_count
    FROM pos_transaction_items pti
    WHERE pti.pos_transaction_id = p_transaction_id;

    -- ========================================================================
    -- FIX 1: UPDATE INVENTORY STOCK (NEW CODE)
    -- ========================================================================
    UPDATE inventory_items ii
    SET 
        current_stock = current_stock - pti.quantity,
        updated_at = NOW()
    FROM pos_transaction_items pti
    WHERE pti.pos_transaction_id = p_transaction_id
      AND pti.inventory_item_id = ii.id
      AND pti.item_type = 'product';

    -- ========================================================================
    -- FIX 2: CREATE INVENTORY TRANSACTION RECORDS (NEW CODE)
    -- ========================================================================
    INSERT INTO inventory_transactions (
        id,
        business_id,
        inventory_item_id,
        transaction_type,
        quantity,
        unit_cost,
        total_cost,
        reference_type,
        reference_id,
        notes,
        created_by,
        created_at,
        updated_at
    )
    SELECT 
        gen_random_uuid(),
        v_business_id,
        pti.inventory_item_id,
        'sale_out',
        -pti.quantity,
        ii.cost_price,
        -(pti.quantity * ii.cost_price),
        'pos_transaction',
        p_transaction_id,
        'POS Sale: ' || v_transaction_number,
        COALESCE(p_user_id, v_created_by),
        NOW(),
        NOW()
    FROM pos_transaction_items pti
    JOIN inventory_items ii ON pti.inventory_item_id = ii.id
    WHERE pti.pos_transaction_id = p_transaction_id
      AND pti.item_type = 'product'
      AND pti.inventory_item_id IS NOT NULL;

    -- ========================================================================
    -- CREATE JOURNAL ENTRY (EXISTING CODE - UNCHANGED)
    -- ========================================================================
    INSERT INTO journal_entries (
        business_id,
        journal_date,
        reference_number,
        reference_type,
        reference_id,
        description,
        total_amount,
        created_by,
        posted_at
    ) VALUES (
        v_business_id,
        CURRENT_DATE,
        'JE-' || COALESCE(v_transaction_number, EXTRACT(EPOCH FROM NOW())::TEXT),
        'pos_transaction',
        p_transaction_id::TEXT,
        'POS Sale: ' || COALESCE(v_transaction_number, '') ||
        ' (' || v_payment_method || ', ' || v_item_count || ' items)',
        v_final_amount,
        COALESCE(p_user_id, v_created_by),
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- LINE 1: Debit receiving account (EXISTING CODE)
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        v_business_id,
        v_journal_entry_id,
        v_receiving_account_id,
        'debit',
        v_final_amount,
        'Received from POS sale via ' || v_payment_method
    );

    -- LINE 2: Credit sales revenue (EXISTING CODE)
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        v_business_id,
        v_journal_entry_id,
        v_revenue_account_id,
        'credit',
        v_final_amount,
        'Sales revenue from POS'
    );

    -- Only create COGS entries if there's actual COGS (EXISTING CODE)
    IF v_total_cogs > 0 THEN
        -- LINE 3: Debit COGS (EXISTING CODE)
        INSERT INTO journal_entry_lines (
            business_id,
            journal_entry_id,
            account_id,
            line_type,
            amount,
            description
        ) VALUES (
            v_business_id,
            v_journal_entry_id,
            v_cogs_account_id,
            'debit',
            v_total_cogs,
            'Cost of goods sold (' || v_item_count || ' items)'
        );

        -- LINE 4: Credit inventory (EXISTING CODE)
        INSERT INTO journal_entry_lines (
            business_id,
            journal_entry_id,
            account_id,
            line_type,
            amount,
            description
        ) VALUES (
            v_business_id,
            v_journal_entry_id,
            v_inventory_account_id,
            'credit',
            v_total_cogs,
            'Inventory reduction from sale'
        );
    END IF;

    -- ========================================================================
    -- FIX 3: LINK INVENTORY TRANSACTIONS TO JOURNAL ENTRIES (NEW CODE)
    -- ========================================================================
    IF v_total_cogs > 0 THEN
        UPDATE inventory_transactions it
        SET 
            journal_entry_id = v_journal_entry_id,
            cogs_entry_id = (
                SELECT jel.id 
                FROM journal_entry_lines jel
                WHERE jel.journal_entry_id = v_journal_entry_id
                  AND jel.account_id = v_cogs_account_id
                  AND jel.line_type = 'debit'
                LIMIT 1
            ),
            updated_at = NOW()
        WHERE it.reference_id = p_transaction_id
          AND it.reference_type = 'pos_transaction'
          AND it.journal_entry_id IS NULL;
    END IF;

    -- Log success (EXISTING CODE - updated with inventory info)
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        details, metadata
    ) VALUES (
        v_business_id,
        COALESCE(p_user_id, v_created_by),
        'accounting.pos.created.with_inventory',
        'pos_transaction',
        p_transaction_id,
        jsonb_build_object(
            'amount', v_final_amount,
            'payment_method', v_payment_method,
            'receiving_account', (SELECT account_code FROM chart_of_accounts WHERE id = v_receiving_account_id),
            'cogs_amount', v_total_cogs,
            'item_count', v_item_count,
            'inventory_updated', true
        ),
        jsonb_build_object('function', 'create_journal_entry_for_pos_transaction_fixed')
    );

    RETURN v_journal_entry_id;

EXCEPTION WHEN OTHERS THEN
    -- Log error (EXISTING CODE)
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        details, metadata
    ) VALUES (
        COALESCE(v_business_id, '00000000-0000-0000-0000-000000000000'::UUID),
        COALESCE(p_user_id, v_created_by),
        'accounting.pos.error',
        'pos_transaction',
        p_transaction_id,
        jsonb_build_object('error', SQLERRM, 'payment_method', v_payment_method),
        jsonb_build_object('function', 'create_journal_entry_for_pos_transaction_fixed')
    );

    RAISE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 2: FIX HISTORICAL DATA (The 6 already-sold units)
-- ============================================================================
DO $$
DECLARE
    v_business_id UUID := '0374935e-7461-47c5-856e-17c116542baa';
    v_inventory_item_id UUID := '389dc5c2-83ae-4bb9-a184-25be4f7b65c1';
    v_total_sold DECIMAL;
    v_current_stock DECIMAL;
    v_initial_stock DECIMAL := 10;
    v_correct_stock DECIMAL;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXING HISTORICAL INVENTORY DATA';
    RAISE NOTICE '========================================';

    -- Calculate total units sold
    SELECT COALESCE(SUM(pti.quantity), 0) INTO v_total_sold
    FROM pos_transaction_items pti
    JOIN pos_transactions pt ON pti.pos_transaction_id = pt.id
    WHERE pti.inventory_item_id = v_inventory_item_id
      AND pt.business_id = v_business_id
      AND pt.status = 'completed';

    RAISE NOTICE 'Total units sold historically: %', v_total_sold;

    -- Get current stock
    SELECT current_stock INTO v_current_stock
    FROM inventory_items
    WHERE id = v_inventory_item_id;

    RAISE NOTICE 'Current stock in database: %', v_current_stock;

    -- Calculate correct stock
    v_correct_stock = v_initial_stock - v_total_sold;

    -- Update inventory stock if wrong
    IF v_current_stock != v_correct_stock THEN
        UPDATE inventory_items
        SET current_stock = v_correct_stock,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_inventory_item_id;

        RAISE NOTICE '✅ Updated stock from % to %', v_current_stock, v_correct_stock;
    ELSE
        RAISE NOTICE '✅ Stock already correct: %', v_current_stock;
    END IF;

    -- Create missing inventory transactions
    WITH inserted_transactions AS (
        INSERT INTO inventory_transactions (
            id, business_id, inventory_item_id, transaction_type,
            quantity, unit_cost, total_cost, reference_type,
            reference_id, notes, created_at, updated_at
        )
        SELECT 
            gen_random_uuid(),
            v_business_id,
            v_inventory_item_id,
            'sale_out',
            -pti.quantity,
            (SELECT cost_price FROM inventory_items WHERE id = v_inventory_item_id),
            -(pti.quantity * (SELECT cost_price FROM inventory_items WHERE id = v_inventory_item_id)),
            'pos_transaction',
            pt.id,
            'Historical fix: POS Sale ' || pt.transaction_number,
            pt.created_at,
            CURRENT_TIMESTAMP
        FROM pos_transaction_items pti
        JOIN pos_transactions pt ON pti.pos_transaction_id = pt.id
        WHERE pti.inventory_item_id = v_inventory_item_id
          AND pt.business_id = v_business_id
          AND pt.status = 'completed'
          AND NOT EXISTS (
              SELECT 1 FROM inventory_transactions it
              WHERE it.reference_id = pt.id
                AND it.reference_type = 'pos_transaction'
                AND it.inventory_item_id = v_inventory_item_id
          )
        RETURNING id
    )
    SELECT COUNT(*) INTO v_total_sold
    FROM inserted_transactions;

    RAISE NOTICE 'Created % missing inventory transactions', v_total_sold;
    RAISE NOTICE '✅ Historical data fix complete';
END;
$$;

-- ============================================================================
-- PART 3: VERIFICATION
-- ============================================================================
DO $$
DECLARE
    v_test_business_id UUID := '0374935e-7461-47c5-856e-17c116542baa';
    v_inventory_item_id UUID := '389dc5c2-83ae-4bb9-a184-25be4f7b65c1';
    v_current_stock DECIMAL;
    v_transaction_count INTEGER;
    v_journal_entries INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION';
    RAISE NOTICE '========================================';

    -- Get current stock
    SELECT current_stock INTO v_current_stock
    FROM inventory_items
    WHERE id = v_inventory_item_id;

    -- Count inventory transactions
    SELECT COUNT(*) INTO v_transaction_count
    FROM inventory_transactions
    WHERE inventory_item_id = v_inventory_item_id;

    -- Count journal entries for test business
    SELECT COUNT(*) INTO v_journal_entries
    FROM journal_entries
    WHERE business_id = v_test_business_id
      AND reference_type = 'pos_transaction';

    RAISE NOTICE 'Current stock: %', v_current_stock;
    RAISE NOTICE 'Inventory transactions: %', v_transaction_count;
    RAISE NOTICE 'Journal entries: %', v_journal_entries;
    RAISE NOTICE '';
    RAISE NOTICE '✅ MINIMAL FIX APPLIED';
    RAISE NOTICE '   No breaking changes';
    RAISE NOTICE '   Same function name';
    RAISE NOTICE '   All callers unchanged';
    RAISE NOTICE '';
END;
$$;

COMMIT;

-- ============================================================================
-- POST-MIGRATION TEST
-- ============================================================================
-- After migration, run these checks:
/*
-- Check inventory
SELECT name, current_stock FROM inventory_items 
WHERE id = '389dc5c2-83ae-4bb9-a184-25be4f7b65c1';

-- Should show: 4 (10 initial - 6 sold)

-- Check inventory transactions
SELECT transaction_type, COUNT(*) as count, SUM(ABS(quantity)) as units
FROM inventory_transactions 
WHERE inventory_item_id = '389dc5c2-83ae-4bb9-a184-25be4f7b65c1'
GROUP BY transaction_type;

-- Should show sale_out records
*/
