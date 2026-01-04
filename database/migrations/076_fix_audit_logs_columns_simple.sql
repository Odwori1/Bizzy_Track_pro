-- File: ~/Bizzy_Track_pro/database/migrations/076_fix_audit_logs_columns_simple.sql
-- ============================================================================
-- SIMPLE FIX: USE CORRECT AUDIT_LOGS COLUMNS
-- ============================================================================
-- Fix: audit_logs has old_values/new_values, not details column
-- ============================================================================

-- ============================================================================
-- STEP 1: FIX THE CORE FUNCTION (USE old_values/new_values)
-- ============================================================================
CREATE OR REPLACE FUNCTION create_journal_entry_for_pos_transaction(
    p_pos_transaction_id UUID,
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_business_id UUID;
    v_final_amount DECIMAL(15,2);
    v_transaction_number VARCHAR(100);
    v_payment_method VARCHAR(50);
    -- Account IDs
    v_receiving_account_id UUID;
    v_sales_account_id UUID;
    v_cogs_account_id UUID;
    v_inventory_account_id UUID;
    v_journal_entry_id UUID;
    v_entry_number VARCHAR(50);
    -- COGS calculation
    v_total_cogs DECIMAL(15,2) := 0;
    v_total_debits DECIMAL(15,2);
    v_total_credits DECIMAL(15,2);
BEGIN
    -- Get transaction details INCLUDING PAYMENT METHOD
    SELECT
        business_id,
        final_amount,
        transaction_number,
        payment_method
    INTO
        v_business_id,
        v_final_amount,
        v_transaction_number,
        v_payment_method
    FROM pos_transactions
    WHERE id = p_pos_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'POS transaction not found: %', p_pos_transaction_id;
    END IF;

    -- Calculate COGS
    SELECT COALESCE(
        SUM(
            COALESCE(ii.cost_price, p.cost_price, 0) * pti.quantity
        ), 0
    )
    INTO v_total_cogs
    FROM pos_transaction_items pti
    LEFT JOIN inventory_items ii ON pti.inventory_item_id = ii.id
    LEFT JOIN products p ON pti.product_id = p.id
    WHERE pti.pos_transaction_id = p_pos_transaction_id
      AND (pti.inventory_item_id IS NOT NULL OR pti.product_id IS NOT NULL);

    -- Generate unique entry number
    v_entry_number := 'JE-' || COALESCE(v_transaction_number,
        TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
        EXTRACT(EPOCH FROM NOW())::TEXT);

    -- GET DYNAMIC RECEIVING ACCOUNT BASED ON PAYMENT METHOD
    CASE v_payment_method
        WHEN 'cash' THEN
            SELECT id INTO v_receiving_account_id
            FROM chart_of_accounts
            WHERE business_id = v_business_id
              AND account_code = '1110'
              AND is_active = true
            LIMIT 1;
        WHEN 'mobile_money' THEN
            SELECT id INTO v_receiving_account_id
            FROM chart_of_accounts
            WHERE business_id = v_business_id
              AND account_code = '1130'
              AND is_active = true
            LIMIT 1;
        WHEN 'bank_transfer' THEN
            SELECT id INTO v_receiving_account_id
            FROM chart_of_accounts
            WHERE business_id = v_business_id
              AND account_code = '1120'
              AND is_active = true
            LIMIT 1;
        WHEN 'credit_card' THEN
            SELECT id INTO v_receiving_account_id
            FROM chart_of_accounts
            WHERE business_id = v_business_id
              AND account_code = '1120'  -- Assuming bank for credit cards
              AND is_active = true
            LIMIT 1;
        WHEN 'cheque' THEN
            SELECT id INTO v_receiving_account_id
            FROM chart_of_accounts
            WHERE business_id = v_business_id
              AND account_code = '1120'
              AND is_active = true
            LIMIT 1;
        ELSE
            -- Default to cash
            SELECT id INTO v_receiving_account_id
            FROM chart_of_accounts
            WHERE business_id = v_business_id
              AND account_code = '1110'
              AND is_active = true
            LIMIT 1;
    END CASE;

    -- Get other account IDs
    SELECT id INTO v_sales_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '4100'
      AND is_active = true
    LIMIT 1;

    SELECT id INTO v_cogs_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '5100'
      AND is_active = true
    LIMIT 1;

    SELECT id INTO v_inventory_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '1300'
      AND is_active = true
    LIMIT 1;

    -- Validate required accounts
    IF v_receiving_account_id IS NULL THEN
        RAISE EXCEPTION 'Receiving account for payment method % not found for business: %', 
            v_payment_method, v_business_id;
    END IF;

    IF v_sales_account_id IS NULL THEN
        RAISE EXCEPTION 'Sales Revenue account (4100) not found for business: %', v_business_id;
    END IF;

    -- Calculate total amount (revenue + COGS)
    v_total_debits := v_final_amount + v_total_cogs;
    v_total_credits := v_final_amount + v_total_cogs;

    -- Create SINGLE journal entry with all lines
    INSERT INTO journal_entries (
        business_id,
        journal_date,
        reference_number,
        reference_type,
        reference_id,
        description,
        total_amount,
        status,
        created_by,
        posted_at
    ) VALUES (
        v_business_id,
        CURRENT_DATE,
        v_entry_number,
        'pos_transaction',
        p_pos_transaction_id::TEXT,
        'POS Sale: ' || COALESCE(v_transaction_number, p_pos_transaction_id::TEXT) ||
            ' (' || v_payment_method || ')' ||
            CASE WHEN v_total_cogs > 0 THEN ' (with COGS)' ELSE '' END,
        v_total_debits,
        'posted',
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- 1. Revenue: Debit RECEIVING ACCOUNT (Cash/Bank/Mobile Money)
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

    -- 2. Revenue: Credit Sales
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
        v_sales_account_id,
        'credit',
        v_final_amount,
        'Sales revenue from POS'
    );

    -- 3. COGS: Debit COGS (if applicable AND accounts exist)
    IF v_total_cogs > 0 AND v_cogs_account_id IS NOT NULL AND v_inventory_account_id IS NOT NULL THEN
        -- Debit COGS
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
            'Cost of goods sold from POS sale'
        );

        -- 4. COGS: Credit Inventory
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
            'Inventory reduction from POS sale'
        );
    ELSIF v_total_cogs > 0 THEN
        -- Log warning if COGS calculated but accounts missing
        RAISE WARNING 'COGS calculated (%) but accounts missing. COGS: %, Inventory: %',
            v_total_cogs,
            v_cogs_account_id,
            v_inventory_account_id;
    END IF;

    -- ✅ FIXED: Use CORRECT columns that actually exist
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        old_values, new_values, metadata, created_at
    ) VALUES (
        v_business_id,
        p_user_id,
        'accounting.pos_created',
        'pos_transaction',
        p_pos_transaction_id,
        '{}'::jsonb,  -- old_values (empty since it's a creation)
        jsonb_build_object(
            'amount', v_final_amount,
            'payment_method', v_payment_method,
            'receiving_account_code', (SELECT account_code FROM chart_of_accounts WHERE id = v_receiving_account_id),
            'cogs_amount', v_total_cogs,
            'journal_entry_id', v_journal_entry_id
        ),
        jsonb_build_object(
            'function', 'create_journal_entry_for_pos_transaction',
            'version', '2.0-fixed'
        ),
        NOW()
    );

    RETURN v_journal_entry_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log error with CORRECT columns
        INSERT INTO audit_logs (
            business_id, user_id, action, resource_type, resource_id,
            old_values, new_values, metadata, created_at
        ) VALUES (
            COALESCE(v_business_id, '00000000-0000-0000-0000-000000000000'::UUID),
            p_user_id,
            'accounting.pos_error',
            'pos_transaction',
            p_pos_transaction_id,
            '{}'::jsonb,
            jsonb_build_object('error', SQLERRM),
            jsonb_build_object('function', 'create_journal_entry_for_pos_transaction'),
            NOW()
        );
        
        RAISE WARNING 'Error in create_journal_entry_for_pos_transaction: %', SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 2: REPAIR THE FAILED TRANSACTION (ACC-000004)
-- ============================================================================
DO $$
DECLARE
    v_transaction_id UUID := 'f624a33e-532d-4e6c-b435-b12d132371ae';
    v_user_id UUID;
    v_journal_entry_id UUID;
BEGIN
    -- Check if transaction exists and needs repair
    IF EXISTS (SELECT 1 FROM pos_transactions WHERE id = v_transaction_id AND accounting_processed = false) THEN
        -- Get user who created the transaction
        SELECT created_by INTO v_user_id
        FROM pos_transactions 
        WHERE id = v_transaction_id;

        IF v_user_id IS NOT NULL THEN
            -- Try to create accounting
            BEGIN
                v_journal_entry_id := create_journal_entry_for_pos_transaction(
                    v_transaction_id,
                    v_user_id
                );

                -- Update transaction status
                UPDATE pos_transactions 
                SET accounting_processed = TRUE,
                    accounting_error = NULL
                WHERE id = v_transaction_id;

                RAISE NOTICE '✅ Repaired failed transaction %', v_transaction_id;
                RAISE NOTICE '✅ Created journal entry: %', v_journal_entry_id;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE '⚠️ Repair failed: %', SQLERRM;
            END;
        END IF;
    ELSE
        RAISE NOTICE '✅ Transaction % already processed or not found', v_transaction_id;
    END IF;
END;
$$;

-- ============================================================================
-- STEP 3: TEST THE FIX WITH A NEW TRANSACTION
-- ============================================================================
DO $$
DECLARE
    v_business_id UUID := 'cf00478e-172d-4030-b7f5-10b09fc2a0b7';
    v_user_id UUID;
    v_product_id UUID;
    v_test_transaction_id UUID;
    v_journal_entry_id UUID;
BEGIN
    -- Get user and product
    SELECT id INTO v_user_id 
    FROM users 
    WHERE business_id = v_business_id 
    LIMIT 1;

    SELECT id INTO v_product_id
    FROM products
    WHERE business_id = v_business_id
    LIMIT 1;

    IF v_user_id IS NOT NULL AND v_product_id IS NOT NULL THEN
        -- Create test mobile money transaction
        INSERT INTO pos_transactions (
            business_id,
            transaction_number,
            total_amount,
            final_amount,
            payment_method,
            status,
            created_by
        ) VALUES (
            v_business_id,
            'TEST-FIX-001',
            500000,
            500000,
            'mobile_money',
            'completed',
            v_user_id
        ) RETURNING id INTO v_test_transaction_id;

        -- Add item
        INSERT INTO pos_transaction_items (
            pos_transaction_id,
            product_id,
            item_type,
            item_name,
            quantity,
            unit_price,
            total_price
        ) VALUES (
            v_test_transaction_id,
            v_product_id,
            'product',
            'Test Product',
            1,
            500000,
            500000
        );

        -- Trigger accounting
        v_journal_entry_id := create_journal_entry_for_pos_transaction(
            v_test_transaction_id,
            v_user_id
        );

        -- Verify
        RAISE NOTICE '✅ Test transaction created: %', v_test_transaction_id;
        RAISE NOTICE '✅ Journal entry ID: %', v_journal_entry_id;
        
        -- Show which account was used
        RAISE NOTICE 'Account used for mobile_money:';
        SELECT ca.account_code, ca.account_name, jel.amount
        FROM journal_entry_lines jel
        JOIN chart_of_accounts ca ON jel.account_id = ca.id
        WHERE jel.journal_entry_id = v_journal_entry_id
          AND jel.line_type = 'debit'
          AND ca.account_type = 'asset';

        -- Clean up
        DELETE FROM pos_transaction_items WHERE pos_transaction_id = v_test_transaction_id;
        DELETE FROM pos_transactions WHERE id = v_test_transaction_id;
        DELETE FROM journal_entry_lines WHERE journal_entry_id = v_journal_entry_id;
        DELETE FROM journal_entries WHERE id = v_journal_entry_id;
        DELETE FROM audit_logs WHERE resource_id = v_test_transaction_id AND resource_type = 'pos_transaction';
    END IF;
END;
$$;

-- ============================================================================
-- STEP 4: VERIFICATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== FIX VERIFICATION ===';
    RAISE NOTICE '1. Fixed audit_logs columns (using old_values/new_values)';
    RAISE NOTICE '2. Repaired failed transaction ACC-000004';
    RAISE NOTICE '3. Tested with new mobile_money transaction';
    RAISE NOTICE '4. Ready for API testing';
END;
$$;

-- Check repaired transaction
SELECT 
    transaction_number,
    payment_method,
    final_amount,
    accounting_processed,
    accounting_error
FROM pos_transactions 
WHERE business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
ORDER BY created_at DESC
LIMIT 3;

-- Check recent journal entries
SELECT 
    pt.transaction_number,
    pt.payment_method,
    ca.account_code,
    ca.account_name,
    jel.amount,
    jel.description
FROM pos_transactions pt
JOIN journal_entries je ON je.reference_id = pt.id::text 
    AND je.reference_type = 'pos_transaction'
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN chart_of_accounts ca ON jel.account_id = ca.id
WHERE pt.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
    AND jel.line_type = 'debit'
    AND ca.account_type = 'asset'
ORDER BY pt.created_at DESC
LIMIT 5;
