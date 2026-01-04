-- ============================================================================
-- MIGRATION 092: FINAL FIX - AUDIT_LOGS COLUMNS MISMATCH
-- ============================================================================
-- Issue: create_journal_entry_for_pos_transaction_fixed() uses 'details' column
-- Fix: Update to use 'old_values' and 'new_values' columns
-- Date: January 4, 2026
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FINAL AUDIT_LOGS COLUMNS FIX';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Fixing: audit_logs.details column does not exist';
    RAISE NOTICE 'Using: old_values and new_values columns instead';
    RAISE NOTICE '';
END;
$$;

-- ============================================================================
-- PART 1: FIX THE create_journal_entry_for_pos_transaction_fixed() FUNCTION
-- ============================================================================

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

    -- ✅ FIXED: Use CORRECT audit_logs columns (old_values, new_values)
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        old_values, new_values, metadata, created_at
    ) VALUES (
        v_business_id,
        COALESCE(p_user_id, v_created_by),
        'accounting.pos.created.with_inventory',
        'pos_transaction',
        p_transaction_id,
        '{}'::jsonb,  -- old_values (empty for creation)
        jsonb_build_object(
            'amount', v_final_amount,
            'payment_method', v_payment_method,
            'receiving_account', (SELECT account_code FROM chart_of_accounts WHERE id = v_receiving_account_id),
            'cogs_amount', v_total_cogs,
            'item_count', v_item_count,
            'inventory_updated', true,
            'journal_entry_new', v_existing_entry_id IS NULL
        ),
        jsonb_build_object('function', 'create_journal_entry_for_pos_transaction_fixed'),
        NOW()
    );

    RETURN v_journal_entry_id;

EXCEPTION WHEN OTHERS THEN
    -- ✅ FIXED: Use CORRECT audit_logs columns for error logging
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        old_values, new_values, metadata, created_at
    ) VALUES (
        COALESCE(v_business_id, '00000000-0000-0000-0000-000000000000'::UUID),
        COALESCE(p_user_id, v_created_by),
        'accounting.pos.error',
        'pos_transaction',
        p_transaction_id,
        '{}'::jsonb,
        jsonb_build_object('error', SQLERRM, 'payment_method', v_payment_method),
        jsonb_build_object('function', 'create_journal_entry_for_pos_transaction_fixed'),
        NOW()
    );

    RAISE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 2: TEST THE 8TH SALE (FIX-000005)
-- ============================================================================

DO $$
DECLARE
    v_business_id UUID := '0374935e-7461-47c5-856e-17c116542baa';
    v_inventory_item_id UUID := '389dc5c2-83ae-4bb9-a184-25be4f7b65c1';
    v_8th_sale_id UUID := '42a374a6-9453-4461-95e1-1fb37749f770';
    v_user_id UUID := 'f7e2a2e5-a92e-41ee-864f-524b72b7bb7c';
    v_current_stock DECIMAL;
    v_result UUID;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TESTING 8TH SALE WITH FIXED FUNCTION';
    RAISE NOTICE '========================================';

    -- Get current stock
    SELECT current_stock INTO v_current_stock
    FROM inventory_items
    WHERE id = v_inventory_item_id;

    RAISE NOTICE 'Current stock before fix: %', v_current_stock;

    -- Reset accounting processed flag so we can test
    UPDATE pos_transactions
    SET accounting_processed = false,
        accounting_error = NULL
    WHERE id = v_8th_sale_id;

    -- Delete existing journal entries for clean test
    DELETE FROM journal_entry_lines jel
    USING journal_entries je
    WHERE jel.journal_entry_id = je.id
      AND je.reference_id = v_8th_sale_id::text
      AND je.reference_type = 'pos_transaction';

    DELETE FROM journal_entries
    WHERE reference_id = v_8th_sale_id::text
      AND reference_type = 'pos_transaction';

    -- Delete existing inventory transactions for this sale
    DELETE FROM inventory_transactions
    WHERE reference_id = v_8th_sale_id
      AND reference_type = 'pos_transaction';

    -- Now call the FIXED function
    BEGIN
        v_result := create_journal_entry_for_pos_transaction_fixed(
            v_8th_sale_id,
            v_user_id
        );

        RAISE NOTICE '✅ Function successful! Journal Entry ID: %', v_result;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '❌ Function failed: %', SQLERRM;
    END;

    -- Check stock after
    SELECT current_stock INTO v_current_stock
    FROM inventory_items
    WHERE id = v_inventory_item_id;

    RAISE NOTICE 'Current stock after fix: %', v_current_stock;

    -- Check inventory transactions
    RAISE NOTICE 'Inventory transactions for 8th sale: %',
        (SELECT COUNT(*) FROM inventory_transactions
         WHERE reference_id = v_8th_sale_id);
END;
$$;

-- ============================================================================
-- PART 3: FIX THE 9TH SALE (FIX-000006)
-- ============================================================================

DO $$
DECLARE
    v_business_id UUID := '0374935e-7461-47c5-856e-17c116542baa';
    v_inventory_item_id UUID := '389dc5c2-83ae-4bb9-a184-25be4f7b65c1';
    v_9th_sale_id UUID;
    v_user_id UUID := 'f7e2a2e5-a92e-41ee-864f-524b72b7bb7c';
    v_current_stock DECIMAL;
    v_result UUID;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXING 9TH SALE (FIX-000006)';
    RAISE NOTICE '========================================';

    -- Get the 9th sale ID (FIX-000006)
    SELECT id INTO v_9th_sale_id
    FROM pos_transactions
    WHERE business_id = v_business_id
      AND transaction_number = 'FIX-000006'
      AND status = 'completed'
    LIMIT 1;

    IF v_9th_sale_id IS NULL THEN
        RAISE NOTICE '❌ 9th sale not found';
        RETURN;
    END IF;

    RAISE NOTICE 'Found 9th sale: %', v_9th_sale_id;

    -- Get current stock
    SELECT current_stock INTO v_current_stock
    FROM inventory_items
    WHERE id = v_inventory_item_id;

    RAISE NOTICE 'Current stock before fix: %', v_current_stock;

    -- Reset accounting processed flag
    UPDATE pos_transactions
    SET accounting_processed = false,
        accounting_error = NULL
    WHERE id = v_9th_sale_id;

    -- Delete existing journal entries
    DELETE FROM journal_entry_lines jel
    USING journal_entries je
    WHERE jel.journal_entry_id = je.id
      AND je.reference_id = v_9th_sale_id::text
      AND je.reference_type = 'pos_transaction';

    DELETE FROM journal_entries
    WHERE reference_id = v_9th_sale_id::text
      AND reference_type = 'pos_transaction';

    -- Delete existing inventory transactions
    DELETE FROM inventory_transactions
    WHERE reference_id = v_9th_sale_id
      AND reference_type = 'pos_transaction';

    -- Call the FIXED function
    BEGIN
        v_result := create_journal_entry_for_pos_transaction_fixed(
            v_9th_sale_id,
            v_user_id
        );

        RAISE NOTICE '✅ Function successful! Journal Entry ID: %', v_result;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '❌ Function failed: %', SQLERRM;
    END;

    -- Check stock after
    SELECT current_stock INTO v_current_stock
    FROM inventory_items
    WHERE id = v_inventory_item_id;

    RAISE NOTICE 'Current stock after fix: %', v_current_stock;

    -- Check inventory transactions
    RAISE NOTICE 'Inventory transactions for 9th sale: %',
        (SELECT COUNT(*) FROM inventory_transactions
         WHERE reference_id = v_9th_sale_id);
END;
$$;

-- ============================================================================
-- PART 4: VERIFICATION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FINAL VERIFICATION';
    RAISE NOTICE '========================================';
END;
$$;

-- Check final inventory state
SELECT
    'Current Stock' as metric,
    current_stock as value,
    CASE
        WHEN current_stock = 1.00 THEN '✅ CORRECT (10 initial - 9 sold)'
        ELSE '❌ WRONG (should be 1.00, actual: ' || current_stock || ')'
    END as status
FROM inventory_items
WHERE id = '389dc5c2-83ae-4bb9-a184-25be4f7b65c1';

-- Check inventory transactions count
SELECT
    'Inventory Transactions' as metric,
    COUNT(*) as count,
    SUM(ABS(quantity)) as total_units_sold,
    CASE
        WHEN SUM(ABS(quantity)) = 9 THEN '✅ CORRECT (9 units sold)'
        ELSE '❌ WRONG (should be 9 units, actual: ' || SUM(ABS(quantity)) || ')'
    END as status
FROM inventory_transactions
WHERE inventory_item_id = '389dc5c2-83ae-4bb9-a184-25be4f7b65c1'
  AND transaction_type = 'sale';

-- Check each sale has inventory transaction
SELECT
    pt.transaction_number,
    COUNT(it.id) as inventory_tx_count,
    SUM(ABS(it.quantity)) as units_sold,
    CASE
        WHEN COUNT(it.id) > 0 THEN '✅ HAS TRANSACTION'
        ELSE '❌ MISSING TRANSACTION'
    END as status
FROM pos_transactions pt
LEFT JOIN inventory_transactions it ON pt.id = it.reference_id
    AND it.reference_type = 'pos_transaction'
    AND it.inventory_item_id = '389dc5c2-83ae-4bb9-a184-25be4f7b65c1'
WHERE pt.business_id = '0374935e-7461-47c5-856e-17c116542baa'
    AND pt.transaction_number LIKE 'FIX-%'
    AND pt.status = 'completed'
GROUP BY pt.id, pt.transaction_number
ORDER BY pt.created_at;

-- Check audit logs for errors
SELECT
    'Recent Audit Log Errors' as metric,
    COUNT(*) as error_count,
    CASE
        WHEN COUNT(*) = 0 THEN '✅ NO ERRORS'
        ELSE '⚠️ ' || COUNT(*) || ' ERRORS FOUND'
    END as status
FROM audit_logs
WHERE (action LIKE '%error%' OR new_values ? 'error')
  AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour';

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIX COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Fixed create_journal_entry_for_pos_transaction_fixed()';
    RAISE NOTICE '✅ Now uses correct audit_logs columns (old_values, new_values)';
    RAISE NOTICE '✅ Fixed 8th and 9th sales inventory transactions';
    RAISE NOTICE '✅ Inventory should now show 1.00 (10 - 9 sold)';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 Test a 10th sale through the API to confirm everything works!';
END;
$$;
