-- database/migrations/1521_fix_wallet_transaction_classification.sql
--
-- Root cause: sync_wallet_balance_from_journal() classified v_transaction_type
-- purely on line_type (debit -> income, credit -> expense), with reference_type
-- carried through only as audit metadata, never used for classification.
-- This meant OPENING_BALANCE entries (any debit to a wallet-linked asset
-- account) were indistinguishable from real sales revenue in wallet_transactions.
--
-- Confirmed live (2026-08-19, business 90d29f85-...): a $1,000,000 opening-
-- balance debit line was labeled 'income', inflating FinancialReportService's
-- P&L by 509x ($1,017,976 reported vs $2,000 actual) and cash flow by 479x.
--
-- Confirmed via live query that only two reference_types have ever produced
-- an 'income' row on this system: OPENING_BALANCE and pos_transaction.
-- wallet_transfer already correctly produces 'transfer' via reference_type
-- exclusion in the old report queries, but the trigger itself never
-- classified it as anything but income/expense by line_type -- this fix
-- makes the trigger itself responsible for correct classification, so no
-- downstream consumer has to know about reference_type exclusions at all.

CREATE OR REPLACE FUNCTION public.sync_wallet_balance_from_journal()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    v_reference_type VARCHAR(50);
    v_reference_id TEXT;
    v_reference_uuid UUID;
BEGIN
    SELECT ca.id, ca.business_id, ca.account_type
    INTO v_gl_account_id, v_business_id, v_account_type
    FROM chart_of_accounts ca
    WHERE ca.id = NEW.account_id;

    IF v_gl_account_id IS NOT NULL AND v_account_type = 'asset' THEN

        SELECT w.id, w.current_balance
        INTO v_wallet_id, v_old_balance
        FROM money_wallets w
        WHERE w.business_id = v_business_id
          AND w.gl_account_id = v_gl_account_id
          AND w.is_active = true
        LIMIT 1;

        IF v_wallet_id IS NOT NULL THEN
            v_wallet_balance_change := CASE
                WHEN NEW.line_type = 'debit' THEN NEW.amount
                WHEN NEW.line_type = 'credit' THEN -NEW.amount
                ELSE 0
            END;

            UPDATE money_wallets
            SET current_balance = current_balance + v_wallet_balance_change,
                updated_at = NOW()
            WHERE id = v_wallet_id
            RETURNING current_balance INTO v_new_balance;

            SELECT
                COALESCE(je.description, 'Journal entry: ' || je.reference_type || ' ' || je.reference_id),
                je.reference_type,
                je.reference_id
            INTO v_description, v_reference_type, v_reference_id
            FROM journal_entries je
            WHERE je.id = NEW.journal_entry_id;

            -- FIXED (Migration 1521): classify by reference_type first, where
            -- the reference_type identifies a category that is NOT ordinary
            -- sales income/expense, before falling back to the old
            -- line_type-only classification for everything else (POS sales,
            -- expense payments, and any future reference_type not yet
            -- explicitly categorized -- those still fall through to the
            -- generic income/expense buckets, which is correct: an unclassified
            -- new reference_type is far more likely to be ordinary revenue/
            -- expense activity than a special case, and this avoids silently
            -- dropping transactions into an 'unclassified' bucket no report
            -- reads from).
            v_transaction_type := CASE
                WHEN v_reference_type = 'wallet_transfer' THEN 'transfer'
                WHEN v_reference_type = 'OPENING_BALANCE' THEN 'opening_balance'
                WHEN NEW.line_type = 'debit' THEN 'income'
                WHEN NEW.line_type = 'credit' THEN 'expense'
                ELSE 'transfer'
            END;

            IF v_reference_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                v_reference_uuid := v_reference_id::UUID;
            ELSE
                v_reference_uuid := NULL;
            END IF;

            INSERT INTO wallet_transactions (
                business_id, wallet_id, journal_entry_line_id, transaction_type,
                amount, balance_before, balance_after, description,
                reference_type, reference_id, created_at
            ) VALUES (
                v_business_id, v_wallet_id, NEW.id, v_transaction_type,
                ABS(NEW.amount), v_old_balance, v_new_balance, v_description,
                v_reference_type, v_reference_uuid, NOW()
            );

            RAISE NOTICE 'Wallet % % as %: % → % (Δ %), Reference: %/%',
                v_wallet_id,
                CASE WHEN NEW.line_type = 'debit' THEN 'increased' ELSE 'decreased' END,
                v_transaction_type, v_old_balance, v_new_balance,
                v_wallet_balance_change, v_reference_type, v_reference_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
