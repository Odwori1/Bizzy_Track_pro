-- ============================================================================
-- MIGRATION 090: FIX INVENTORY REDUCTION (PROPER FIX)
-- ============================================================================
-- Issue: process_pos_accounting_safe_fixed() returns early if journal entry exists
-- Solution: Remove early return, always call inventory update function
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'PROPER INVENTORY FIX';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Fixing: Early return in process_pos_accounting_safe_fixed()';
    RAISE NOTICE '';
END;
$$;

-- ============================================================================
-- PART 1: MODIFY THE SAFE PROCESSING FUNCTION
-- ============================================================================
-- Remove the early return that skips inventory updates

CREATE OR REPLACE FUNCTION process_pos_accounting_safe_fixed(
    p_transaction_id UUID,
    p_user_id UUID
) RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    journal_entry_id UUID,
    lines_created INTEGER
) AS $$
DECLARE
    v_business_id UUID;
    v_status TEXT;
    v_already_processed BOOLEAN;
    v_journal_entry_id UUID;
    v_line_count INTEGER;
    v_existing_journal_id UUID;
    v_payment_method VARCHAR(50);
BEGIN
    -- Check if transaction exists and is completed
    SELECT business_id, status, accounting_processed, payment_method
    INTO v_business_id, v_status, v_already_processed, v_payment_method
    FROM pos_transactions
    WHERE id = p_transaction_id;

    IF v_business_id IS NULL THEN
        RETURN QUERY SELECT false, 'Transaction not found', NULL::UUID, 0;
        RETURN;
    END IF;

    IF v_status != 'completed' THEN
        RETURN QUERY SELECT false, 'Transaction not completed', NULL::UUID, 0;
        RETURN;
    END IF;

    -- Check if journal entry already exists
    SELECT id INTO v_existing_journal_id
    FROM journal_entries
    WHERE business_id = v_business_id
      AND reference_type = 'pos_transaction'
      AND reference_id = p_transaction_id::TEXT;

    -- ========================================================================
    -- CRITICAL FIX: ALWAYS CALL THE FUNCTION THAT UPDATES INVENTORY
    -- Remove the early return that skips inventory updates!
    -- ========================================================================

    -- Call the accounting function (which includes inventory updates)
    BEGIN
        v_journal_entry_id := create_journal_entry_for_pos_transaction_fixed(
            p_transaction_id,
            p_user_id
        );

        IF v_journal_entry_id IS NULL THEN
            RAISE EXCEPTION 'Journal entry creation returned NULL';
        END IF;

        -- Count lines created
        SELECT COUNT(*) INTO v_line_count
        FROM journal_entry_lines jel
        WHERE jel.journal_entry_id = v_journal_entry_id;

        -- If journal entry already existed, we might get a duplicate
        -- But the function has ON CONFLICT/duplicate handling
        IF v_existing_journal_id IS NOT NULL THEN
            RAISE NOTICE 'Recreated journal entry for transaction % (existing: %, new: %)',
                p_transaction_id, v_existing_journal_id, v_journal_entry_id;
        END IF;

        -- Mark as processed
        UPDATE pos_transactions
        SET accounting_processed = TRUE,
            accounting_error = NULL
        WHERE id = p_transaction_id;

        RETURN QUERY SELECT true,
            'Accounting processed successfully with inventory update (' || v_payment_method || ')',
            v_journal_entry_id,
            v_line_count;

    EXCEPTION WHEN OTHERS THEN
        -- Log error
        UPDATE pos_transactions
        SET accounting_error = SQLERRM
        WHERE id = p_transaction_id;

        -- Return failure
        RETURN QUERY SELECT false,
            'Accounting failed: ' || SQLERRM,
            NULL::UUID,
            0;
    END;

    RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 2: ENSURE THE MAIN FUNCTION IS IDEMPOTENT
-- ============================================================================
-- Modify create_journal_entry_for_pos_transaction_fixed to handle duplicates

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
    v_existing_entry_id UUID;
BEGIN
    -- Get transaction details
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

    -- ========================================================================
    -- CHECK FOR EXISTING JOURNAL ENTRY
    -- ========================================================================
    SELECT id INTO v_existing_entry_id
    FROM journal_entries
    WHERE business_id = v_business_id
      AND reference_type = 'pos_transaction'
      AND reference_id = p_transaction_id::TEXT
    LIMIT 1;

    IF v_existing_entry_id IS NOT NULL THEN
        RAISE NOTICE 'Journal entry already exists for transaction %: %',
            p_transaction_id, v_existing_entry_id;
        
        -- STILL UPDATE INVENTORY EVEN IF JOURNAL ENTRY EXISTS
        -- This is the key fix!
    END IF;

    -- Get DYNAMIC receiving account based on payment method
    v_receiving_account_id := get_account_id_by_payment_method(v_business_id, v_payment_method);

    -- Get other account IDs
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

    -- Validate all accounts exist
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

    -- Calculate total COGS from transaction items
    SELECT COALESCE(SUM(pti.total_cost), 0), COUNT(*)
    INTO v_total_cogs, v_item_count
    FROM pos_transaction_items pti
    WHERE pti.pos_transaction_id = p_transaction_id;

    -- ========================================================================
    -- CRITICAL: ALWAYS UPDATE INVENTORY (EVEN IF JOURNAL ENTRY EXISTS)
    -- ========================================================================
    
    -- Check if inventory already updated for this transaction
    IF NOT EXISTS (
        SELECT 1 FROM inventory_transactions
        WHERE reference_id = p_transaction_id
          AND reference_type = 'pos_transaction'
    ) THEN
        -- FIX 1: UPDATE INVENTORY STOCK
        UPDATE inventory_items ii
        SET 
            current_stock = current_stock - pti.quantity,
            updated_at = NOW()
        FROM pos_transaction_items pti
        WHERE pti.pos_transaction_id = p_transaction_id
          AND pti.inventory_item_id = ii.id
          AND pti.item_type = 'product';

        -- FIX 2: CREATE INVENTORY TRANSACTION RECORDS
        INSERT INTO inventory_transactions (
            id,
            business_id,
            inventory_item_id,
            transaction_type,
            quantity,
            unit_cost,
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
            'sale',
            -pti.quantity,
            ii.cost_price,
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
    ELSE
        RAISE NOTICE 'Inventory already updated for transaction %', p_transaction_id;
    END IF;

    -- ========================================================================
    -- HANDLE JOURNAL ENTRY (CREATE OR UPDATE)
    -- ========================================================================
    
    IF v_existing_entry_id IS NULL THEN
        -- Create new journal entry
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
    ELSE
        -- Use existing journal entry
        v_journal_entry_id := v_existing_entry_id;
        RAISE NOTICE 'Using existing journal entry: %', v_journal_entry_id;
        
        -- Check if lines already exist
        IF NOT EXISTS (
            SELECT 1 FROM journal_entry_lines
            WHERE journal_entry_id = v_journal_entry_id
        ) THEN
            -- Create missing lines
            -- LINE 1: Debit receiving account
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

            -- LINE 2: Credit sales revenue
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

            -- Only create COGS entries if there's actual COGS
            IF v_total_cogs > 0 THEN
                -- LINE 3: Debit COGS
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

                -- LINE 4: Credit inventory
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
        END IF;
    END IF;

    -- Link inventory transactions to journal entries
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

    -- Log success
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
            'inventory_updated', true,
            'journal_entry_new', v_existing_entry_id IS NULL
        ),
        jsonb_build_object('function', 'create_journal_entry_for_pos_transaction_fixed')
    );

    RETURN v_journal_entry_id;

EXCEPTION WHEN OTHERS THEN
    -- Log error
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
-- PART 3: FIX THE 7TH SALE (THE MISSING ONE)
-- ============================================================================

DO $$
DECLARE
    v_business_id UUID := '0374935e-7461-47c5-856e-17c116542baa';
    v_inventory_item_id UUID := '389dc5c2-83ae-4bb9-a184-25be4f7b65c1';
    v_new_sale_id UUID := 'e21cdb44-67e0-415c-b5b9-98240df36be0';  -- The 7th sale
    v_user_id UUID := 'f7e2a2e5-a92e-41ee-864f-524b72b7bb7c';
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXING THE 7TH SALE (MISSING INVENTORY)';
    RAISE NOTICE '========================================';

    -- Check current stock (should be 4, needs to be 3)
    RAISE NOTICE 'Current stock: %',
        (SELECT current_stock FROM inventory_items WHERE id = v_inventory_item_id);

    -- Manually update inventory for the 7th sale
    UPDATE inventory_items
    SET current_stock = current_stock - 1,
        updated_at = NOW()
    WHERE id = v_inventory_item_id;

    -- Create inventory transaction for the 7th sale
    INSERT INTO inventory_transactions (
        id,
        business_id,
        inventory_item_id,
        transaction_type,
        quantity,
        unit_cost,
        reference_type,
        reference_id,
        notes,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_business_id,
        v_inventory_item_id,
        'sale',
        -1,
        (SELECT cost_price FROM inventory_items WHERE id = v_inventory_item_id),
        'pos_transaction',
        v_new_sale_id,
        'Manual fix: 7th sale (FIX-000004)',
        v_user_id,
        NOW(),
        NOW()
    );

    RAISE NOTICE '✅ Fixed 7th sale inventory';
    RAISE NOTICE 'New stock: %',
        (SELECT current_stock FROM inventory_items WHERE id = v_inventory_item_id);
END;
$$;

-- ============================================================================
-- PART 4: VERIFICATION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION';
    RAISE NOTICE '========================================';
END;
$$;

-- Final verification
SELECT 
    'Test Smartphone' as product,
    current_stock,
    'Expected: 3.00 (10 initial - 7 sold)' as expected
FROM inventory_items 
WHERE id = '389dc5c2-83ae-4bb9-a184-25be4f7b65c1';

SELECT 
    'Total sales' as metric,
    COUNT(*) as count,
    SUM(ABS(quantity)) as total_units
FROM inventory_transactions 
WHERE inventory_item_id = '389dc5c2-83ae-4bb9-a184-25be4f7b65c1'
  AND transaction_type = 'sale';

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIX COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Removed early return in process_pos_accounting_safe_fixed()';
    RAISE NOTICE '✅ Made inventory updates idempotent';
    RAISE NOTICE '✅ Fixed the 7th sale (manual update)';
    RAISE NOTICE '✅ Stock should now show 3.00 (10 - 7)';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 NEXT: Test a new sale to verify fix works!';
END;
$$;
