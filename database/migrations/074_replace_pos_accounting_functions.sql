-- File: ~/Bizzy_Track_pro/database/migrations/074_replace_pos_accounting_functions.sql
-- ============================================================================
-- REPLACE POS ACCOUNTING FUNCTIONS (Migration 074)
-- ============================================================================
-- Replace ALL functions to use dynamic payment method accounting
-- ============================================================================

-- ============================================================================
-- STEP 1: DROP AND RECREATE THE CORE FUNCTION WITH PAYMENT METHOD SUPPORT
-- ============================================================================
DROP FUNCTION IF EXISTS create_journal_entry_for_pos_transaction(UUID, UUID);

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

    -- Audit log
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        details, metadata
    ) VALUES (
        v_business_id,
        p_user_id,
        'accounting.pos_created',
        'pos_transaction',
        p_pos_transaction_id,
        jsonb_build_object(
            'amount', v_final_amount,
            'payment_method', v_payment_method,
            'receiving_account_code', (SELECT account_code FROM chart_of_accounts WHERE id = v_receiving_account_id),
            'cogs_amount', v_total_cogs,
            'journal_entry_id', v_journal_entry_id
        ),
        jsonb_build_object('function', 'create_journal_entry_for_pos_transaction')
    );

    RETURN v_journal_entry_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error in create_journal_entry_for_pos_transaction: %', SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 2: REPAIR EXISTING JOURNAL ENTRIES (FIX WRONG ACCOUNTS)
-- ============================================================================
DO $$
DECLARE
    v_transaction_record RECORD;
    v_correct_account_id UUID;
    v_wrong_account_id UUID;
    v_journal_entry_id UUID;
    v_line_id UUID;
BEGIN
    -- Find transactions with mobile_money payment but accounted to cash
    FOR v_transaction_record IN 
        SELECT 
            pt.id as transaction_id,
            pt.payment_method,
            pt.final_amount,
            je.id as journal_entry_id,
            ca.id as current_account_id,
            ca.account_code as current_account_code
        FROM pos_transactions pt
        JOIN journal_entries je ON je.reference_id = pt.id::text 
            AND je.reference_type = 'pos_transaction'
        JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        JOIN chart_of_accounts ca ON jel.account_id = ca.id
        WHERE pt.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
            AND jel.line_type = 'debit'
            AND pt.payment_method = 'mobile_money'
            AND ca.account_code = '1110'  -- Wrong: should be 1130
    LOOP
        -- Get correct account ID (1130 Mobile Money)
        SELECT id INTO v_correct_account_id
        FROM chart_of_accounts
        WHERE business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
          AND account_code = '1130'
        LIMIT 1;

        IF v_correct_account_id IS NOT NULL THEN
            -- Update the journal entry line
            UPDATE journal_entry_lines
            SET account_id = v_correct_account_id,
                description = 'Received from POS sale via mobile_money (corrected)',
                updated_at = CURRENT_TIMESTAMP
            WHERE journal_entry_id = v_transaction_record.journal_entry_id
              AND account_id = v_transaction_record.current_account_id
              AND line_type = 'debit';

            RAISE NOTICE 'Corrected transaction %: Changed account % → %', 
                v_transaction_record.transaction_id,
                v_transaction_record.current_account_code,
                '1130';
        END IF;
    END LOOP;
END;
$$;

-- ============================================================================
-- STEP 3: UPDATE WALLET BALANCES AFTER CORRECTION
-- ============================================================================
CREATE OR REPLACE FUNCTION update_all_wallet_balances()
RETURNS VOID AS $$
DECLARE
    v_business_record RECORD;
    v_wallet_record RECORD;
    v_account_balance DECIMAL;
BEGIN
    FOR v_business_record IN SELECT id FROM businesses
    LOOP
        -- Update each wallet based on its GL account balance
        FOR v_wallet_record IN 
            SELECT 
                mw.id as wallet_id,
                mw.wallet_type,
                mw.name as wallet_name,
                ca.account_code,
                ca.id as account_id
            FROM money_wallets mw
            JOIN chart_of_accounts ca ON mw.gl_account_id = ca.id
            WHERE mw.business_id = v_business_record.id
              AND mw.is_active = true
        LOOP
            -- Calculate current balance from journal entries
            SELECT COALESCE(SUM(
                CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
            ), 0) INTO v_account_balance
            FROM journal_entry_lines jel
            JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = v_business_record.id
                AND jel.account_id = v_wallet_record.account_id
                AND je.voided_at IS NULL;

            -- Update wallet balance
            UPDATE money_wallets 
            SET current_balance = v_account_balance,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = v_wallet_record.wallet_id
              AND ABS(current_balance - v_account_balance) > 0.01;

            RAISE NOTICE 'Updated % (%): % UGX', 
                v_wallet_record.wallet_name,
                v_wallet_record.account_code,
                v_account_balance;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT update_all_wallet_balances();
DROP FUNCTION update_all_wallet_balances();

-- ============================================================================
-- STEP 4: VERIFICATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== MIGRATION 074 COMPLETE ===';
    RAISE NOTICE '1. Replaced core POS accounting function with payment method support';
    RAISE NOTICE '2. Corrected existing mobile_money transactions';
    RAISE NOTICE '3. Updated wallet balances';
    
    -- Show test business state
    RAISE NOTICE '';
    RAISE NOTICE 'Test Business (cf00478e-172d-4030-b7f5-10b09fc2a0b7) Verification:';
END;
$$;

-- Show corrected journal entries
SELECT 
    pt.transaction_number,
    pt.payment_method,
    pt.final_amount,
    ca.account_code,
    ca.account_name,
    jel.line_type,
    jel.amount,
    jel.description
FROM pos_transactions pt
JOIN journal_entries je ON je.reference_id = pt.id::text 
    AND je.reference_type = 'pos_transaction'
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN chart_of_accounts ca ON jel.account_id = ca.id
WHERE pt.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
    AND jel.line_type = 'debit'
ORDER BY pt.created_at;

-- Show wallet balances
SELECT 
    name as wallet_name,
    wallet_type,
    current_balance,
    currency,
    (SELECT account_code FROM chart_of_accounts WHERE id = gl_account_id) as gl_account
FROM money_wallets 
WHERE business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
ORDER BY current_balance DESC;

-- Show accounting equation balance
SELECT 
    ROUND(COALESCE(SUM(CASE WHEN ca.account_type = 'asset' THEN 
        CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
    END), 0), 2) as assets,
    ROUND(COALESCE(SUM(CASE WHEN ca.account_type = 'liability' THEN 
        CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
    END), 0), 2) as liabilities,
    ROUND(COALESCE(SUM(CASE WHEN ca.account_type = 'equity' THEN 
        CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
    END), 0), 2) as equity,
    ROUND(COALESCE(SUM(CASE WHEN ca.account_type = 'revenue' THEN 
        CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
    END), 0), 2) as revenue,
    ROUND(COALESCE(SUM(CASE WHEN ca.account_type = 'expense' THEN 
        CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
    END), 0), 2) as expenses,
    ROUND(
        COALESCE(SUM(CASE WHEN ca.account_type = 'asset' THEN 
            CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
        END), 0) -
        (COALESCE(SUM(CASE WHEN ca.account_type = 'liability' THEN 
            CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
        END), 0) +
         COALESCE(SUM(CASE WHEN ca.account_type = 'equity' THEN 
            CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
        END), 0) +
         COALESCE(SUM(CASE WHEN ca.account_type = 'revenue' THEN 
            CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
        END), 0) -
         COALESCE(SUM(CASE WHEN ca.account_type = 'expense' THEN 
            CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
        END), 0)
        ), 2
    ) as equation_difference
FROM journal_entry_lines jel
JOIN journal_entries je ON jel.journal_entry_id = je.id
JOIN chart_of_accounts ca ON jel.account_id = ca.id
WHERE je.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
    AND je.voided_at IS NULL;
