-- File: ~/Bizzy_Track_pro/database/migrations/079_fix_card_accounting_dynamic.sql
-- ============================================================================
-- DYNAMIC FIX: CORRECT CARD PAYMENT ACCOUNTING FOR ALL BUSINESSES
-- ============================================================================
-- Problem: Card transactions going to Cash (1110) instead of Bank (1120)
-- Cause: CASE statement in create_journal_entry_for_pos_transaction function
-- Solution: Update function to correctly map 'card' to account 1120
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE TEMPORARY VIEW TO SEE THE PROBLEM
-- ============================================================================
CREATE OR REPLACE VIEW card_transaction_accounting_issues AS
SELECT 
    pt.business_id,
    pt.id as transaction_id,
    pt.transaction_number,
    pt.payment_method,
    pt.final_amount,
    je.id as journal_entry_id,
    ca.account_code,
    ca.account_name,
    jel.amount,
    jel.description,
    CASE 
        WHEN pt.payment_method = 'card' AND ca.account_code = '1110' THEN '❌ WRONG - Should be 1120'
        WHEN pt.payment_method = 'card' AND ca.account_code = '1120' THEN '✅ CORRECT'
        ELSE 'N/A'
    END as status
FROM pos_transactions pt
JOIN journal_entries je ON je.reference_id = pt.id::text
    AND je.reference_type = 'pos_transaction'
    AND je.voided_at IS NULL
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    AND jel.line_type = 'debit'
JOIN chart_of_accounts ca ON jel.account_id = ca.id
    AND ca.account_type = 'asset'
WHERE pt.payment_method = 'card';

-- ============================================================================
-- STEP 2: FIX THE FUNCTION - CARD SHOULD MAP TO 1120
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
BEGIN
    -- Get transaction details
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

    -- ========================================================================
    -- CRITICAL FIX: CORRECT PAYMENT METHOD MAPPING
    -- MUST MATCH database check constraint: ['cash', 'card', 'mobile_money', 'credit', 'multiple']
    -- ========================================================================
    CASE v_payment_method
        WHEN 'cash' THEN
            -- Map to 1110 Cash
            SELECT id INTO v_receiving_account_id
            FROM chart_of_accounts
            WHERE business_id = v_business_id
              AND account_code = '1110'
              AND is_active = true
            LIMIT 1;
            
        WHEN 'mobile_money' THEN
            -- Map to 1130 Mobile Money
            SELECT id INTO v_receiving_account_id
            FROM chart_of_accounts
            WHERE business_id = v_business_id
              AND account_code = '1130'
              AND is_active = true
            LIMIT 1;
            
        WHEN 'card' THEN
            -- ⚠️ CRITICAL FIX: Map to 1120 Bank Account (was going to Cash)
            SELECT id INTO v_receiving_account_id
            FROM chart_of_accounts
            WHERE business_id = v_business_id
              AND account_code = '1120'
              AND is_active = true
            LIMIT 1;
            
        WHEN 'credit' THEN
            -- Map to 1200 Accounts Receivable
            SELECT id INTO v_receiving_account_id
            FROM chart_of_accounts
            WHERE business_id = v_business_id
              AND account_code = '1200'
              AND is_active = true
            LIMIT 1;
            
        WHEN 'multiple' THEN
            -- Map to 1110 Cash (default for multiple payments)
            SELECT id INTO v_receiving_account_id
            FROM chart_of_accounts
            WHERE business_id = v_business_id
              AND account_code = '1110'
              AND is_active = true
            LIMIT 1;
            
        ELSE
            -- Default to cash for safety (should never happen due to check constraint)
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

    -- Create journal entry
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
            ' (' || v_payment_method || ')',
        v_final_amount + v_total_cogs,
        'posted',
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- 1. Debit receiving account (based on payment method)
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

    -- 2. Credit sales
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

    -- 3. COGS entries if applicable
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

        -- Credit inventory
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
    END IF;

    -- Audit log
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        old_values, new_values, metadata, created_at
    ) VALUES (
        v_business_id,
        p_user_id,
        'accounting.pos_created',
        'pos_transaction',
        p_pos_transaction_id,
        '{}'::jsonb,
        jsonb_build_object(
            'amount', v_final_amount,
            'payment_method', v_payment_method,
            'receiving_account_code', (SELECT account_code FROM chart_of_accounts WHERE id = v_receiving_account_id),
            'cogs_amount', v_total_cogs,
            'journal_entry_id', v_journal_entry_id
        ),
        jsonb_build_object(
            'function', 'create_journal_entry_for_pos_transaction',
            'version', '4.0-card-fix-dynamic'
        ),
        NOW()
    );

    RETURN v_journal_entry_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log error
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

        RAISE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 3: REPAIR EXISTING CARD TRANSACTIONS FOR ALL BUSINESSES
-- ============================================================================
CREATE OR REPLACE FUNCTION repair_card_transactions_accounting()
RETURNS INTEGER AS $$
DECLARE
    v_transaction RECORD;
    v_user_id UUID;
    v_new_journal_entry_id UUID;
    v_repaired_count INTEGER := 0;
BEGIN
    -- Find all card transactions with wrong accounting
    FOR v_transaction IN (
        SELECT DISTINCT
            pt.business_id,
            pt.id as transaction_id,
            pt.created_by,
            pt.transaction_number
        FROM pos_transactions pt
        JOIN journal_entries je ON je.reference_id = pt.id::text
            AND je.reference_type = 'pos_transaction'
        JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        JOIN chart_of_accounts ca ON jel.account_id = ca.id
        WHERE pt.payment_method = 'card'
          AND jel.line_type = 'debit'
          AND ca.account_code = '1110'  -- Currently mapped to Cash (wrong)
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries je2
            JOIN journal_entry_lines jel2 ON jel2.journal_entry_id = je2.id
            JOIN chart_of_accounts ca2 ON jel2.account_id = ca2.id
            WHERE je2.reference_id = pt.id::text
              AND je2.reference_type = 'pos_transaction'
              AND jel2.line_type = 'debit'
              AND ca2.account_code = '1120'  -- Should be mapped to Bank
          )
    ) LOOP
        BEGIN
            -- Mark old journal entry as voided if voided_at column exists
            UPDATE journal_entries
            SET voided_at = NOW(),
                void_reason = 'Repaired: Card transaction should map to Bank (1120) not Cash (1110)'
            WHERE reference_id = v_transaction.transaction_id::text
              AND reference_type = 'pos_transaction'
              AND voided_at IS NULL;

            -- Create new correct accounting entry
            v_new_journal_entry_id := create_journal_entry_for_pos_transaction(
                v_transaction.transaction_id,
                v_transaction.created_by
            );

            -- Update transaction status
            UPDATE pos_transactions
            SET accounting_processed = TRUE,
                accounting_error = NULL,
                updated_at = NOW()
            WHERE id = v_transaction.transaction_id;

            v_repaired_count := v_repaired_count + 1;
            RAISE NOTICE 'Repaired card transaction: % (business: %)', 
                v_transaction.transaction_number, v_transaction.business_id;

        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Failed to repair transaction %: %', 
                v_transaction.transaction_id, SQLERRM;
        END;
    END LOOP;

    RETURN v_repaired_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 4: EXECUTE REPAIR FOR ALL BUSINESSES
-- ============================================================================
DO $$
DECLARE
    v_repaired_count INTEGER;
BEGIN
    v_repaired_count := repair_card_transactions_accounting();
    RAISE NOTICE 'Repaired % card transaction(s) across all businesses', v_repaired_count;
END;
$$;

-- ============================================================================
-- STEP 5: VERIFICATION QUERY (DYNAMIC - NO HARDCODED BUSINESS ID)
-- ============================================================================
SELECT 
    'Current State' as check_type,
    pt.business_id,
    COUNT(*) as total_transactions,
    COUNT(*) FILTER (WHERE pt.payment_method = 'card') as card_transactions,
    COUNT(*) FILTER (WHERE pt.payment_method = 'card' AND ca.account_code = '1120') as card_to_bank_correct,
    COUNT(*) FILTER (WHERE pt.payment_method = 'card' AND ca.account_code = '1110') as card_to_cash_wrong
FROM pos_transactions pt
LEFT JOIN journal_entries je ON je.reference_id = pt.id::text
    AND je.reference_type = 'pos_transaction'
    AND je.voided_at IS NULL
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    AND jel.line_type = 'debit'
LEFT JOIN chart_of_accounts ca ON jel.account_id = ca.id
    AND ca.account_type = 'asset'
WHERE pt.payment_method = 'card'
GROUP BY pt.business_id
ORDER BY pt.business_id;

-- ============================================================================
-- STEP 6: CLEANUP - DROP TEMPORARY VIEW
-- ============================================================================
DROP VIEW IF EXISTS card_transaction_accounting_issues;

-- ============================================================================
-- STEP 7: FINAL VERIFICATION MESSAGE
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== CARD PAYMENT ACCOUNTING FIX COMPLETE ===';
    RAISE NOTICE '1. ✅ Updated create_journal_entry_for_pos_transaction function';
    RAISE NOTICE '2. ✅ Card payments now correctly map to 1120 (Bank Account)';
    RAISE NOTICE '3. ✅ Applied fix dynamically to ALL businesses';
    RAISE NOTICE '4. ✅ Repaired existing card transactions if needed';
    RAISE NOTICE '5. ✅ Ready for new card transactions';
    RAISE NOTICE '';
    RAISE NOTICE 'Payment method mapping now correct:';
    RAISE NOTICE '  - cash → 1110 Cash';
    RAISE NOTICE '  - mobile_money → 1130 Mobile Money';
    RAISE NOTICE '  - card → 1120 Bank Account ✅ FIXED';
    RAISE NOTICE '  - credit → 1200 Accounts Receivable';
    RAISE NOTICE '  - multiple → 1110 Cash (default)';
END;
$$;
