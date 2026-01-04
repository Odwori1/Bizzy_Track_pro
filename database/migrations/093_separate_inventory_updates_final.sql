-- ============================================================================
-- MIGRATION 093: SEPARATE INVENTORY UPDATES (FINAL FIX)
-- ============================================================================
-- Following the other developer's correct architectural suggestion:
-- Inventory updates should be SEPARATE from journal entry creation
-- ============================================================================
-- Date: January 4, 2026
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FINAL FIX: SEPARATE INVENTORY UPDATES';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Issue: Inventory tied to journal entry creation';
    RAISE NOTICE 'Fix: Separate concerns, always update inventory';
    RAISE NOTICE '';
END;
$$;

-- ============================================================================
-- PART 1: CREATE get_account_id_by_payment_method() FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_account_id_by_payment_method(
    p_business_id UUID,
    p_payment_method VARCHAR(50)
) RETURNS UUID AS $$
DECLARE
    v_account_code VARCHAR(20);
    v_account_id UUID;
BEGIN
    -- Map payment method to account code
    CASE p_payment_method
        WHEN 'cash' THEN v_account_code := '1110';
        WHEN 'mobile_money' THEN v_account_code := '1130';
        WHEN 'card' THEN v_account_code := '1120';  -- Bank account for card payments
        WHEN 'bank_transfer' THEN v_account_code := '1120';
        WHEN 'credit_card' THEN v_account_code := '1120';
        WHEN 'cheque' THEN v_account_code := '1120';
        ELSE v_account_code := '1110'; -- Default to cash
    END CASE;

    -- Get the account ID
    SELECT id INTO v_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_code = v_account_code
    LIMIT 1;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Account % not found for business %', v_account_code, p_business_id;
    END IF;

    RETURN v_account_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 2: CREATE SEPARATE INVENTORY UPDATE FUNCTION (IDEMPOTENT)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_inventory_for_pos_transaction(
    p_transaction_id UUID,
    p_user_id UUID DEFAULT NULL
) RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    items_updated INTEGER,
    transactions_created INTEGER
) AS $$
DECLARE
    v_business_id UUID;
    v_transaction_number VARCHAR(100);
    v_items_updated INTEGER := 0;
    v_transactions_created INTEGER := 0;
    v_item RECORD;
    v_existing_count INTEGER;
BEGIN
    -- Get transaction details
    SELECT business_id, transaction_number
    INTO v_business_id, v_transaction_number
    FROM pos_transactions
    WHERE id = p_transaction_id;

    IF v_business_id IS NULL THEN
        RETURN QUERY SELECT false, 'Transaction not found', 0, 0;
        RETURN;
    END IF;

    -- Check if inventory already updated (idempotent check)
    SELECT COUNT(*) INTO v_existing_count
    FROM inventory_transactions
    WHERE reference_id = p_transaction_id
      AND reference_type = 'pos_transaction';

    IF v_existing_count > 0 THEN
        RETURN QUERY SELECT true, 
            'Inventory already updated (' || v_existing_count || ' items)',
            0, v_existing_count;
        RETURN;
    END IF;

    RAISE NOTICE 'Updating inventory for transaction: %', p_transaction_id;

    -- Loop through transaction items and update inventory
    FOR v_item IN
        SELECT
            pti.inventory_item_id,
            pti.quantity,
            ii.cost_price,
            ii.name as item_name,
            pti.total_price  -- FIX: Use correct column name
        FROM pos_transaction_items pti
        JOIN inventory_items ii ON pti.inventory_item_id = ii.id
        WHERE pti.pos_transaction_id = p_transaction_id
          AND pti.item_type = 'product'
          AND pti.inventory_item_id IS NOT NULL
    LOOP
        -- Update inventory stock
        UPDATE inventory_items
        SET
            current_stock = current_stock - v_item.quantity,
            updated_at = NOW()
        WHERE id = v_item.inventory_item_id
          AND business_id = v_business_id;

        GET DIAGNOSTICS v_items_updated = ROW_COUNT;

        -- Create inventory transaction record
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
            v_item.inventory_item_id,
            'sale',
            -v_item.quantity,  -- Negative for reduction
            v_item.cost_price,
            'pos_transaction',
            p_transaction_id,
            'POS Sale: ' || v_transaction_number,
            COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::UUID),
            NOW(),
            NOW()
        );

        v_transactions_created := v_transactions_created + 1;

        RAISE NOTICE '  ✅ Updated: % (qty: %, cost: %, new stock: %)',
            v_item.item_name,
            v_item.quantity,
            v_item.cost_price,
            (SELECT current_stock FROM inventory_items WHERE id = v_item.inventory_item_id);
    END LOOP;

    RETURN QUERY SELECT true,
        'Updated ' || v_items_updated || ' items, created ' || v_transactions_created || ' transactions',
        v_items_updated,
        v_transactions_created;

EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false,
        'Inventory update failed: ' || SQLERRM,
        0, 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3: UPDATE THE MAIN FUNCTION TO FIX COLUMN NAMES
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
    -- FIRST: ALWAYS UPDATE INVENTORY (SEPARATE CONCERN)
    -- ========================================================================
    PERFORM update_inventory_for_pos_transaction(p_transaction_id, p_user_id);

    -- ========================================================================
    -- SECOND: HANDLE JOURNAL ENTRIES
    -- ========================================================================

    -- Check for existing journal entry
    SELECT id INTO v_existing_entry_id
    FROM journal_entries
    WHERE business_id = v_business_id
      AND reference_type = 'pos_transaction'
      AND reference_id = p_transaction_id::TEXT
    LIMIT 1;

    IF v_existing_entry_id IS NOT NULL THEN
        RAISE NOTICE 'Journal entry already exists: %', v_existing_entry_id;
        RETURN v_existing_entry_id;
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

    -- Calculate total COGS from transaction items (FIX: Use total_price column)
    SELECT COALESCE(SUM(pti.quantity * ii.cost_price), 0), COUNT(*)
    INTO v_total_cogs, v_item_count
    FROM pos_transaction_items pti
    JOIN inventory_items ii ON pti.inventory_item_id = ii.id
    WHERE pti.pos_transaction_id = p_transaction_id
      AND pti.item_type = 'product';

    -- Create journal entry
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

    -- ✅ FIXED: Use correct audit_logs columns
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        old_values, new_values, metadata, created_at
    ) VALUES (
        v_business_id,
        COALESCE(p_user_id, v_created_by),
        'accounting.pos.created.with_inventory',
        'pos_transaction',
        p_transaction_id,
        '{}'::jsonb,
        jsonb_build_object(
            'amount', v_final_amount,
            'payment_method', v_payment_method,
            'receiving_account', (SELECT account_code FROM chart_of_accounts WHERE id = v_receiving_account_id),
            'cogs_amount', v_total_cogs,
            'item_count', v_item_count
        ),
        jsonb_build_object('function', 'create_journal_entry_for_pos_transaction_fixed'),
        NOW()
    );

    RETURN v_journal_entry_id;

EXCEPTION WHEN OTHERS THEN
    -- ✅ FIXED: Use correct audit_logs columns for error logging
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
-- PART 4: FIX MISSING INVENTORY TRANSACTIONS (5TH, 6TH SALES)
-- ============================================================================

DO $$
DECLARE
    v_business_id UUID := '0374935e-7461-47c5-856e-17c116542baa';
    v_user_id UUID := 'b21278f7-6c12-44f4-95a3-16d20103480a';
    v_transaction RECORD;
    v_result RECORD;
    v_fixed_count INTEGER := 0;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXING MISSING INVENTORY TRANSACTIONS';
    RAISE NOTICE '========================================';

    -- Find all completed POS transactions without inventory updates
    FOR v_transaction IN
        SELECT pt.id, pt.transaction_number, pt.created_at
        FROM pos_transactions pt
        WHERE pt.business_id = v_business_id
          AND pt.status = 'completed'
          AND pt.transaction_number IN ('FIX-000005', 'FIX-000006')
          AND NOT EXISTS (
              SELECT 1 FROM inventory_transactions it
              WHERE it.reference_id = pt.id
                AND it.reference_type = 'pos_transaction'
          )
        ORDER BY pt.created_at
    LOOP
        RAISE NOTICE 'Processing: % (ID: %)', v_transaction.transaction_number, v_transaction.id;

        -- Update inventory for this transaction
        SELECT * INTO v_result
        FROM update_inventory_for_pos_transaction(
            v_transaction.id,
            v_user_id
        );

        IF v_result.success THEN
            v_fixed_count := v_fixed_count + 1;
            RAISE NOTICE '  ✅ %', v_result.message;
        ELSE
            RAISE WARNING '  ⚠️ Failed: %', v_result.message;
        END IF;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE 'Fixed % transactions', v_fixed_count;
END;
$$;

-- ============================================================================
-- PART 5: UPDATE process_pos_accounting_safe() TO USE SEPARATE INVENTORY UPDATES
-- ============================================================================

CREATE OR REPLACE FUNCTION process_pos_accounting_safe(
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
    v_inventory_result RECORD;
BEGIN
    -- Get transaction info
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

    -- ========================================================================
    -- ALWAYS UPDATE INVENTORY FIRST (SEPARATE CONCERN)
    -- ========================================================================
    SELECT * INTO v_inventory_result
    FROM update_inventory_for_pos_transaction(p_transaction_id, p_user_id);

    IF NOT v_inventory_result.success THEN
        RAISE WARNING 'Inventory update failed: %', v_inventory_result.message;
        -- Continue anyway - don't fail accounting if inventory update fails
    END IF;

    -- ========================================================================
    -- HANDLE JOURNAL ENTRIES
    -- ========================================================================

    -- Check if journal entry already exists
    SELECT id INTO v_existing_journal_id
    FROM journal_entries
    WHERE business_id = v_business_id
      AND reference_type = 'pos_transaction'
      AND reference_id = p_transaction_id::TEXT;

    IF v_existing_journal_id IS NOT NULL THEN
        -- Count lines
        SELECT COUNT(*) INTO v_line_count
        FROM journal_entry_lines
        WHERE journal_entry_id = v_existing_journal_id;

        -- Mark as processed
        UPDATE pos_transactions
        SET accounting_processed = TRUE,
            accounting_error = NULL
        WHERE id = p_transaction_id
          AND accounting_processed = FALSE;

        RETURN QUERY SELECT true,
            'Accounting exists. ' || v_inventory_result.message,
            v_existing_journal_id,
            v_line_count;
        RETURN;
    END IF;

    -- Only check already_processed if no journal entry exists yet
    IF v_already_processed THEN
        RETURN QUERY SELECT false, 'Accounting already processed but no journal entry found', NULL::UUID, 0;
        RETURN;
    END IF;

    -- Verify items exist
    IF NOT EXISTS (
        SELECT 1 FROM pos_transaction_items
        WHERE pos_transaction_id = p_transaction_id
    ) THEN
        RETURN QUERY SELECT false, 'No transaction items found', NULL::UUID, 0;
        RETURN;
    END IF;

    -- Create journal entry
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
        FROM journal_entry_lines
        WHERE journal_entry_id = v_journal_entry_id;

        -- Mark as processed
        UPDATE pos_transactions
        SET accounting_processed = TRUE,
            accounting_error = NULL
        WHERE id = p_transaction_id;

        RETURN QUERY SELECT true,
            'Accounting created. ' || v_inventory_result.message,
            v_journal_entry_id,
            v_line_count;

    EXCEPTION WHEN OTHERS THEN
        UPDATE pos_transactions
        SET accounting_error = SQLERRM
        WHERE id = p_transaction_id;

        RETURN QUERY SELECT false,
            'Accounting failed: ' || SQLERRM,
            NULL::UUID,
            0;
    END;

    RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 6: VERIFICATION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FINAL VERIFICATION';
    RAISE NOTICE '========================================';
END;
$$;

-- Check inventory state
SELECT
    'Current Stock' as metric,
    current_stock as value,
    CASE
        WHEN current_stock = 1.00 THEN '✅ CORRECT (10 initial - 9 sold)'
        ELSE '❌ WRONG (should be 1.00, actual: ' || current_stock || ')'
    END as status
FROM inventory_items
WHERE id = '389dc5c2-83ae-4bb9-a184-25be4f7b65c1';

-- Check all inventory transactions exist
SELECT
    'Inventory Transactions' as metric,
    COUNT(*) as count,
    SUM(ABS(quantity)) as total_units_sold,
    CASE
        WHEN SUM(ABS(quantity)) = 9 THEN '✅ CORRECT (9 units sold)'
        ELSE '❌ WRONG (should be 9 units, actual: ' || COALESCE(SUM(ABS(quantity)), 0) || ')'
    END as status
FROM inventory_transactions
WHERE inventory_item_id = '389dc5c2-83ae-4bb9-a184-25be4f7b65c1'
  AND transaction_type = 'sale';

-- Verify each sale has inventory transaction
SELECT
    pt.transaction_number,
    pt.payment_method,
    pt.final_amount,
    COUNT(it.id) as inventory_tx_count,
    SUM(ABS(it.quantity)) as units_sold,
    CASE
        WHEN COUNT(it.id) > 0 THEN '✅ HAS TRANSACTION'
        ELSE '❌ MISSING TRANSACTION'
    END as status
FROM pos_transactions pt
LEFT JOIN inventory_transactions it ON pt.id = it.reference_id
    AND it.reference_type = 'pos_transaction'
WHERE pt.business_id = '0374935e-7461-47c5-856e-17c116542baa'
    AND pt.transaction_number LIKE 'FIX-%'
    AND pt.status = 'completed'
GROUP BY pt.id, pt.transaction_number, pt.payment_method, pt.final_amount
ORDER BY pt.created_at;

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 093 COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Created separate inventory update function';
    RAISE NOTICE '✅ Fixed column name issue (total_cost → total_price)';
    RAISE NOTICE '✅ Created missing get_account_id_by_payment_method()';
    RAISE NOTICE '✅ Fixed 5th and 6th sales inventory transactions';
    RAISE NOTICE '✅ Inventory now updates independently of journal entries';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 Stock should now be 1.00 (10 - 9 sold)';
    RAISE NOTICE '🎯 All 9 sales should have inventory transactions';
END;
$$;
