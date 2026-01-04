-- File: ~/Bizzy_Track_pro/database/migrations/073_fix_pos_accounting_and_bank.sql
-- ============================================================================
-- COMPLETE WEEK 1 FIX: POS Accounting + Bank Accounts + Dynamic Wallets
-- ============================================================================

-- ============================================================================
-- STEP 1: FIND AND FIX THE CORE JOURNAL ENTRY FUNCTION
-- ============================================================================
-- First, let's find the actual function
DO $$
DECLARE
    v_function_oid OID;
BEGIN
    SELECT oid INTO v_function_oid
    FROM pg_proc 
    WHERE proname = 'create_journal_entry_for_pos_transaction';
    
    IF v_function_oid IS NOT NULL THEN
        RAISE NOTICE 'Function exists: create_journal_entry_for_pos_transaction';
        
        -- Get its source
        RAISE NOTICE 'Source:';
        SELECT prosrc FROM pg_proc WHERE oid = v_function_oid;
    ELSE
        RAISE NOTICE 'Function not found, checking for similar...';
        
        -- List all functions with "journal" in name
        FOR v_function_oid IN 
            SELECT oid FROM pg_proc 
            WHERE proname LIKE '%journal%' 
               OR proname LIKE '%accounting%'
            ORDER BY proname
        LOOP
            RAISE NOTICE 'Found: %', (SELECT proname FROM pg_proc WHERE oid = v_function_oid);
        END LOOP;
    END IF;
END;
$$;

-- ============================================================================
-- STEP 2: CREATE DYNAMIC ACCOUNT MAPPING FUNCTION
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
        WHEN 'bank_transfer' THEN v_account_code := '1120';
        WHEN 'credit_card' THEN v_account_code := '1120'; -- Assuming bank account for credit cards
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
-- STEP 3: CREATE OR REPLACE THE POS JOURNAL ENTRY FUNCTION (DYNAMIC)
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
BEGIN
    -- Get transaction details INCLUDING PAYMENT METHOD
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

    -- LINE 1: Debit receiving account (Cash/Bank/Mobile Money)
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

    -- Log success
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        details, metadata
    ) VALUES (
        v_business_id,
        COALESCE(p_user_id, v_created_by),
        'accounting.pos.created.dynamic',
        'pos_transaction',
        p_transaction_id,
        jsonb_build_object(
            'amount', v_final_amount,
            'payment_method', v_payment_method,
            'receiving_account', (SELECT account_code FROM chart_of_accounts WHERE id = v_receiving_account_id),
            'cogs_amount', v_total_cogs,
            'item_count', v_item_count
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
-- STEP 4: UPDATE THE SAFE PROCESSING FUNCTION TO USE THE FIXED VERSION
-- ============================================================================
CREATE OR REPLACE FUNCTION process_pos_accounting_safe_fixed(
    p_transaction_id UUID,
    p_user_id UUID
) RETURNS TABLE(success BOOLEAN, message TEXT, journal_entry_id UUID, lines_created INTEGER) AS $$
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

    -- If journal entry already exists, return it
    IF v_existing_journal_id IS NOT NULL THEN
        -- Count lines
        SELECT COUNT(*) INTO v_line_count
        FROM journal_entry_lines jel
        WHERE jel.journal_entry_id = v_existing_journal_id;

        -- Mark as processed if not already
        UPDATE pos_transactions
        SET accounting_processed = TRUE,
            accounting_error = NULL
        WHERE id = p_transaction_id
          AND accounting_processed = FALSE;

        RETURN QUERY SELECT true, 'Accounting already exists (returning existing entry)',
                     v_existing_journal_id, v_line_count;
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

    -- Call the FIXED accounting function
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

        -- Mark as processed
        UPDATE pos_transactions
        SET accounting_processed = TRUE,
            accounting_error = NULL
        WHERE id = p_transaction_id;

        RETURN QUERY SELECT true, 'Accounting processed successfully with dynamic payment method (' || v_payment_method || ')',
                     v_journal_entry_id, v_line_count;

    EXCEPTION WHEN OTHERS THEN
        -- Log error
        UPDATE pos_transactions
        SET accounting_error = SQLERRM
        WHERE id = p_transaction_id;

        -- Return failure with explicit NULL cast to UUID
        RETURN QUERY SELECT false, 'Accounting failed: ' || SQLERRM,
                     NULL::UUID, 0;
    END;

    RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: UPDATE WALLET BALANCES DYNAMICALLY
-- ============================================================================
CREATE OR REPLACE FUNCTION update_wallet_balances_from_transactions()
RETURNS VOID AS $$
DECLARE
    v_business_record RECORD;
    v_wallet_record RECORD;
    v_wallet_balance DECIMAL;
BEGIN
    FOR v_business_record IN SELECT id FROM businesses
    LOOP
        -- Process each wallet type
        FOR v_wallet_record IN 
            SELECT 
                mw.id as wallet_id,
                mw.wallet_type,
                ca.account_code
            FROM money_wallets mw
            JOIN chart_of_accounts ca ON mw.gl_account_id = ca.id
            WHERE mw.business_id = v_business_record.id
              AND mw.is_active = true
        LOOP
            -- Calculate balance from journal entries for this GL account
            SELECT COALESCE(SUM(
                CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
            ), 0) INTO v_wallet_balance
            FROM journal_entry_lines jel
            JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = v_business_record.id
                AND jel.account_id = (
                    SELECT id FROM chart_of_accounts 
                    WHERE business_id = v_business_record.id 
                      AND account_code = v_wallet_record.account_code
                    LIMIT 1
                )
                AND je.voided_at IS NULL;

            -- Update wallet balance
            UPDATE money_wallets 
            SET current_balance = v_wallet_balance,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = v_wallet_record.wallet_id
              AND ABS(current_balance - v_wallet_balance) > 0.01; -- Only update if changed

            RAISE NOTICE 'Business %, Wallet % (%): % UGX', 
                v_business_record.id, 
                v_wallet_record.wallet_type, 
                v_wallet_record.account_code,
                v_wallet_balance;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run the wallet balance update
SELECT update_wallet_balances_from_transactions();
DROP FUNCTION update_wallet_balances_from_transactions();

-- ============================================================================
-- STEP 6: CREATE BANK ACCOUNTS TABLE (Per Handover Report)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    bank_name VARCHAR(100) NOT NULL,
    account_name VARCHAR(200) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    account_type VARCHAR(50) NOT NULL CHECK (account_type IN ('savings', 'current', 'fixed_deposit', 'loan_account')),
    currency VARCHAR(3) DEFAULT 'UGX',
    opening_balance DECIMAL(15,2) DEFAULT 0,
    current_balance DECIMAL(15,2) DEFAULT 0,
    gl_account_id UUID REFERENCES chart_of_accounts(id),
    wallet_id UUID REFERENCES money_wallets(id),
    branch_name VARCHAR(100),
    swift_code VARCHAR(20),
    iban VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    reconciliation_date DATE,
    last_reconciled_at TIMESTAMP WITH TIME ZONE,
    last_reconciled_by UUID REFERENCES users(id),
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: business + bank + account number
    UNIQUE(business_id, bank_name, account_number),
    
    -- Either gl_account_id or wallet_id should be set for accounting
    CONSTRAINT bank_accounts_accounting_check 
        CHECK (gl_account_id IS NOT NULL OR wallet_id IS NOT NULL)
);

-- Create indexes
CREATE INDEX idx_bank_accounts_business ON bank_accounts(business_id);
CREATE INDEX idx_bank_accounts_active ON bank_accounts(business_id, is_active) WHERE is_active = true;
CREATE INDEX idx_bank_accounts_gl_account ON bank_accounts(gl_account_id);
CREATE INDEX idx_bank_accounts_wallet ON bank_accounts(wallet_id);

-- ============================================================================
-- STEP 7: CREATE DEFAULT BANK ACCOUNT FOR EACH BUSINESS
-- ============================================================================
CREATE OR REPLACE FUNCTION create_default_bank_accounts()
RETURNS VOID AS $$
DECLARE
    v_business_record RECORD;
    v_user_id UUID;
    v_gl_account_id UUID;
    v_wallet_id UUID;
BEGIN
    FOR v_business_record IN SELECT id FROM businesses
    LOOP
        -- Get a user
        SELECT id INTO v_user_id 
        FROM users 
        WHERE business_id = v_business_record.id 
        LIMIT 1;

        -- Get GL account for bank (1120)
        SELECT id INTO v_gl_account_id
        FROM chart_of_accounts 
        WHERE business_id = v_business_record.id 
          AND account_code = '1120'
        LIMIT 1;

        -- Get or create bank wallet
        SELECT id INTO v_wallet_id
        FROM money_wallets 
        WHERE business_id = v_business_record.id 
          AND wallet_type = 'bank_account'
        LIMIT 1;

        IF v_wallet_id IS NULL AND v_gl_account_id IS NOT NULL THEN
            -- Create bank wallet first
            INSERT INTO money_wallets (
                business_id, name, wallet_type, wallet_code,
                current_balance, opening_balance, currency,
                gl_account_id, created_by, description, is_active
            ) VALUES (
                v_business_record.id, 'Primary Bank Account', 'bank_account', 'BANK-001',
                0, 0, 'UGX', v_gl_account_id, v_user_id,
                'Primary business bank account', true
            ) RETURNING id INTO v_wallet_id;
        END IF;

        -- Create bank account record
        IF NOT EXISTS (
            SELECT 1 FROM bank_accounts 
            WHERE business_id = v_business_record.id 
              AND bank_name = 'Standard Bank'
        ) AND v_wallet_id IS NOT NULL THEN
            INSERT INTO bank_accounts (
                business_id, bank_name, account_name, account_number,
                account_type, currency, opening_balance, current_balance,
                gl_account_id, wallet_id, branch_name, is_active, created_by
            ) VALUES (
                v_business_record.id, 'Standard Bank', 'Business Main Account', '00123456789',
                'current', 'UGX', 0, 0, v_gl_account_id, v_wallet_id,
                'Kampala Main Branch', true, v_user_id
            );
        END IF;

        RAISE NOTICE 'Created bank account for business: %', v_business_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT create_default_bank_accounts();
DROP FUNCTION create_default_bank_accounts();

-- ============================================================================
-- STEP 8: VERIFICATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== MIGRATION 073 COMPLETE ===';
    RAISE NOTICE '1. Created dynamic POS accounting with payment method mapping';
    RAISE NOTICE '2. Fixed wallet balances to reflect actual payment methods';
    RAISE NOTICE '3. Created bank_accounts table (per handover report)';
    RAISE NOTICE '4. Created default bank accounts for all businesses';
    
    -- Show test business state
    RAISE NOTICE '';
    RAISE NOTICE 'Test Business (cf00478e-172d-4030-b7f5-10b09fc2a0b7):';
END;
$$;

-- Show wallets with correct balances
SELECT 
    name as wallet_name,
    wallet_type,
    current_balance,
    currency,
    (SELECT account_code FROM chart_of_accounts WHERE id = gl_account_id) as gl_account
FROM money_wallets 
WHERE business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
ORDER BY wallet_type;

-- Show bank accounts
SELECT 
    bank_name,
    account_name,
    account_number,
    current_balance,
    currency
FROM bank_accounts 
WHERE business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7';
