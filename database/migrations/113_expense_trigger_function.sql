-- Update the trigger function to use valid transaction types
CREATE OR REPLACE FUNCTION sync_wallet_balance_from_journal()
RETURNS TRIGGER AS $$
DECLARE
    v_wallet_id UUID;
    v_wallet_balance_change DECIMAL(15,2);
    v_gl_account_id UUID;
    v_business_id UUID;
    v_account_type VARCHAR(50);
    v_old_balance DECIMAL(15,2);
    v_new_balance DECIMAL(15,2);
    v_description TEXT;
    v_transaction_type VARCHAR(50);
BEGIN
    -- Get the GL account details
    SELECT ca.id, ca.business_id, ca.account_type
    INTO v_gl_account_id, v_business_id, v_account_type
    FROM chart_of_accounts ca
    WHERE ca.id = NEW.account_id;

    -- Only process asset accounts (cash, bank, mobile money wallets)
    IF v_gl_account_id IS NOT NULL AND v_account_type = 'asset' THEN

        -- Find the wallet mapped to this GL account
        SELECT w.id, w.current_balance
        INTO v_wallet_id, v_old_balance
        FROM money_wallets w
        WHERE w.business_id = v_business_id
          AND w.gl_account_id = v_gl_account_id
          AND w.is_active = true
        LIMIT 1;

        IF v_wallet_id IS NOT NULL THEN
            -- Calculate balance change:
            -- DEBIT to asset = increase wallet (sales, deposits)
            -- CREDIT to asset = decrease wallet (expenses, withdrawals)
            v_wallet_balance_change := CASE
                WHEN NEW.line_type = 'debit' THEN NEW.amount
                WHEN NEW.line_type = 'credit' THEN -NEW.amount
                ELSE 0
            END;

            -- Update wallet balance
            UPDATE money_wallets
            SET current_balance = current_balance + v_wallet_balance_change,
                updated_at = NOW()
            WHERE id = v_wallet_id
            RETURNING current_balance INTO v_new_balance;

            -- Get description from journal entry
            SELECT COALESCE(je.description, 'Journal entry adjustment')
            INTO v_description
            FROM journal_entries je
            WHERE je.id = NEW.journal_entry_id;

            -- Determine transaction type based on line_type
            -- Use values that pass the check constraint
            v_transaction_type := CASE
                WHEN NEW.line_type = 'debit' THEN 'in'  -- Cash inflow
                WHEN NEW.line_type = 'credit' THEN 'out' -- Cash outflow
                ELSE 'adjustment'
            END;

            -- Create wallet transaction for audit trail
            INSERT INTO wallet_transactions (
                business_id,
                wallet_id,
                journal_entry_line_id,
                transaction_type,
                amount,
                balance_before,
                balance_after,
                description,
                created_at
            ) VALUES (
                v_business_id,
                v_wallet_id,
                NEW.id,
                v_transaction_type,
                ABS(NEW.amount),
                v_old_balance,
                v_new_balance,
                v_description,
                NOW()
            );

            RAISE NOTICE 'Wallet % %: % → % (Δ %)',
                v_wallet_id,
                CASE WHEN NEW.line_type = 'debit' THEN 'increased' ELSE 'decreased' END,
                v_old_balance,
                v_new_balance,
                v_wallet_balance_change;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
