-- First, backup the original function
CREATE OR REPLACE FUNCTION create_journal_entry_for_pos_transaction_ORIGINAL()
RETURNS UUID AS $$
-- Copy the entire original function here
$$ LANGUAGE plpgsql;

-- Now create a DEBUG version
CREATE OR REPLACE FUNCTION create_journal_entry_for_pos_transaction_debug(
    p_pos_transaction_id UUID,
    p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_business_id UUID;
    v_final_amount DECIMAL(15,2);
    v_transaction_number VARCHAR(100);
    v_cash_account_id UUID;
    v_sales_account_id UUID;
    v_cogs_account_id UUID;
    v_inventory_account_id UUID;
    v_journal_entry_id UUID;
    v_entry_number VARCHAR(50);
    v_total_cogs DECIMAL(15,2) := 0;
    v_total_debits DECIMAL(15,2);
    v_total_credits DECIMAL(15,2);
BEGIN
    -- Get transaction details
    SELECT
        business_id,
        final_amount,
        transaction_number
    INTO
        v_business_id,
        v_final_amount,
        v_transaction_number
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

    -- 🚀 DEBUG LOGGING
    RAISE NOTICE '=== DEBUG START ===';
    RAISE NOTICE 'Transaction: %', p_pos_transaction_id;
    RAISE NOTICE 'Business: %', v_business_id;
    RAISE NOTICE 'Final Amount: %', v_final_amount;
    RAISE NOTICE 'Calculated COGS: %', v_total_cogs;
    RAISE NOTICE '=== DEBUG END ===';

    -- Generate unique entry number
    v_entry_number := 'JE-' || COALESCE(v_transaction_number,
        TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
        EXTRACT(EPOCH FROM NOW())::TEXT);

    -- Get account IDs - ALWAYS GET ALL ACCOUNTS, NOT CONDITIONALLY!
    -- Cash account (1110)
    SELECT id INTO v_cash_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '1110'
      AND is_active = true
    LIMIT 1;

    -- Sales Revenue account (4100)
    SELECT id INTO v_sales_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '4100'
      AND is_active = true
    LIMIT 1;

    -- COGS account (5100) - ALWAYS GET IT!
    SELECT id INTO v_cogs_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '5100'
      AND is_active = true
    LIMIT 1;

    -- Inventory account (1300) - ALWAYS GET IT!
    SELECT id INTO v_inventory_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '1300'
      AND is_active = true
    LIMIT 1;

    -- 🚀 DEBUG LOGGING
    RAISE NOTICE '=== ACCOUNT IDs ===';
    RAISE NOTICE 'Cash Account ID: %', v_cash_account_id;
    RAISE NOTICE 'Sales Account ID: %', v_sales_account_id;
    RAISE NOTICE 'COGS Account ID: %', v_cogs_account_id;
    RAISE NOTICE 'Inventory Account ID: %', v_inventory_account_id;

    -- Validate required accounts
    IF v_cash_account_id IS NULL THEN
        RAISE EXCEPTION 'Cash account (1110) not found for business: %', v_business_id;
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
            CASE WHEN v_total_cogs > 0 THEN ' (with COGS)' ELSE '' END,
        v_total_debits,  -- Total of all debits/credits
        'posted',
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- 1. Revenue: Debit Cash
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
        v_cash_account_id,
        'debit',
        v_final_amount,
        'Cash received from POS sale'
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

    -- 🚀 DEBUG LOGGING BEFORE COGS CHECK
    RAISE NOTICE '=== BEFORE COGS CHECK ===';
    RAISE NOTICE 'v_total_cogs > 0: %', (v_total_cogs > 0);
    RAISE NOTICE 'v_cogs_account_id IS NOT NULL: %', (v_cogs_account_id IS NOT NULL);
    RAISE NOTICE 'v_inventory_account_id IS NOT NULL: %', (v_inventory_account_id IS NOT NULL);
    RAISE NOTICE 'Full condition: %', 
        (v_total_cogs > 0 AND v_cogs_account_id IS NOT NULL AND v_inventory_account_id IS NOT NULL);

    -- 3. COGS: Debit COGS (if applicable AND accounts exist)
    -- FIXED: Check if accounts exist AND COGS > 0
    IF v_total_cogs > 0 AND v_cogs_account_id IS NOT NULL AND v_inventory_account_id IS NOT NULL THEN
        RAISE NOTICE '=== CREATING COGS ENTRIES ===';
        
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
        
        RAISE NOTICE '=== COGS ENTRIES CREATED ===';
    ELSIF v_total_cogs > 0 THEN
        -- Log warning if COGS calculated but accounts missing
        RAISE WARNING '=== COGS WARNING ===';
        RAISE WARNING 'COGS calculated (%) but accounts missing. COGS: %, Inventory: %',
            v_total_cogs,
            v_cogs_account_id,
            v_inventory_account_id;
    END IF;

    RETURN v_journal_entry_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '=== ERROR IN FUNCTION ===';
        RAISE WARNING 'Error in create_journal_entry_for_pos_transaction: %', SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;
