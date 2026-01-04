-- Migration: 070_fix_inventory_balance.sql
-- Fix inventory account negative balance by adding opening balance

DO $$
DECLARE
    v_business_id UUID := '20783240-3d55-4af1-a779-fe6044ee4963';
    v_inventory_account_id UUID;
    v_fix_amount NUMERIC := 9100.00;
    v_user_id UUID := '122fa064-f702-4655-b1c9-cec9d8c839e0';
    v_journal_entry_id UUID;
    v_cash_account_id UUID;
BEGIN
    -- Get inventory account ID
    SELECT id INTO v_inventory_account_id
    FROM chart_of_accounts 
    WHERE business_id = v_business_id
        AND account_code = '1300'
        AND is_active = true;
    
    -- Get cash account ID
    SELECT id INTO v_cash_account_id
    FROM chart_of_accounts 
    WHERE business_id = v_business_id
        AND account_code = '1110'
        AND is_active = true;
    
    RAISE NOTICE 'Fixing inventory balance: Business: %, Inventory Account: %, Fix Amount: %', 
        v_business_id, v_inventory_account_id, v_fix_amount;
    
    -- Create adjustment journal entry
    INSERT INTO journal_entries (
        id,
        business_id,
        journal_date,
        reference_number,
        reference_type,
        reference_id,
        description,
        total_amount,
        status,
        created_by,
        posted_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_business_id,
        CURRENT_DATE - 1, -- Yesterday (before sales)
        'JE-INV-FIX-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        'inventory_adjustment',
        v_inventory_account_id::TEXT,
        'Inventory opening balance adjustment - Fix negative balance from test data',
        v_fix_amount,
        'posted',
        v_user_id,
        NOW(),
        NOW(),
        NOW()
    ) RETURNING id INTO v_journal_entry_id;
    
    -- 1. Debit Inventory (increase asset)
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description,
        created_at
    ) VALUES (
        v_business_id,
        v_journal_entry_id,
        v_inventory_account_id,
        'debit',
        v_fix_amount,
        'Inventory opening balance - Initial stock',
        NOW()
    );
    
    -- 2. Credit Owner's Capital (source of inventory)
    -- Find equity account
    DECLARE
        v_equity_account_id UUID;
    BEGIN
        SELECT id INTO v_equity_account_id
        FROM chart_of_accounts 
        WHERE business_id = v_business_id
            AND account_code = '3100'
            AND is_active = true
        LIMIT 1;
        
        IF v_equity_account_id IS NOT NULL THEN
            INSERT INTO journal_entry_lines (
                business_id,
                journal_entry_id,
                account_id,
                line_type,
                amount,
                description,
                created_at
            ) VALUES (
                v_business_id,
                v_journal_entry_id,
                v_equity_account_id,
                'credit',
                v_fix_amount,
                'Owner investment in inventory',
                NOW()
            );
        ELSE
            -- Fallback to cash if equity not found (simpler)
            INSERT INTO journal_entry_lines (
                business_id,
                journal_entry_id,
                account_id,
                line_type,
                amount,
                description,
                created_at
            ) VALUES (
                v_business_id,
                v_journal_entry_id,
                v_cash_account_id,
                'credit',
                v_fix_amount,
                'Cash used to purchase inventory',
                NOW()
            );
        END IF;
    END;
    
    -- Update inventory account opening balance
    UPDATE chart_of_accounts 
    SET opening_balance = v_fix_amount,
        current_balance = opening_balance,
        updated_at = NOW()
    WHERE id = v_inventory_account_id;
    
    RAISE NOTICE '✅ Inventory balance fixed. Created journal entry: %', v_journal_entry_id;
    
END $$;

-- Verify the fix
SELECT 
    ca.account_code,
    ca.account_name,
    ca.account_type,
    ROUND(ca.opening_balance, 2) as opening_balance,
    ROUND(ca.current_balance, 2) as current_balance,
    ROUND(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END), 2) as calculated_balance
FROM chart_of_accounts ca
LEFT JOIN journal_entry_lines jel ON ca.id = jel.account_id
LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.voided_at IS NULL
WHERE ca.business_id = '20783240-3d55-4af1-a779-fe6044ee4963'
    AND ca.account_code IN ('1110', '1300', '4100', '5100', '3100')
GROUP BY ca.id, ca.account_code, ca.account_name, ca.account_type, ca.opening_balance, ca.current_balance
ORDER BY ca.account_code;
