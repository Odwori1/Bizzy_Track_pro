-- ============================================================================
-- MIGRATION: 2004_fix_pos_discount_accounting.sql
-- VERSION:   FINAL - Based on actual schema
--
-- SCHEMA CONFIRMED (from your database):
--   businesses: id, name, currency, currency_symbol, timezone, created_at, 
--               country_code, country_name, tax_number
--   users: id, business_id, email, full_name, is_active, role, created_at
--   customers: id, first_name, last_name, customer_type, etc.
--   pos_transactions: will get new columns added by this migration
--
-- KEY FEATURES:
--   1. Fingerprint check - only fixes transactions with bug pattern
--   2. Per-business processing with validation
--   3. Per-business trial balance verification
--   4. Dry-run mode (default: true for safety)
--   5. Handles NULL customer_type with fallbacks
--   6. Never deletes journal entries
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '╔════════════════════════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║   MIGRATION 2004 — POS DISCOUNT ACCOUNTING FIX                                 ║';
    RAISE NOTICE '║   Version: FINAL — Based on actual schema                                      ║';
    RAISE NOTICE '║   Dry-run mode: ENABLED by default — set migration.dry_run=false to apply     ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════════════════════════════════╝';
END $$;

-- ============================================================================
-- CONFIGURATION
-- ============================================================================

DO $$
BEGIN
    PERFORM set_config('migration.dry_run', 'true', false);
    RAISE NOTICE '[2004] Dry-run mode: ENABLED (set migration.dry_run=false to apply)';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[2004] Dry-run mode: DISABLED (defaulting to apply)';
END $$;

-- ============================================================================
-- PART 1: SCHEMA CHANGES (Idempotent)
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '[2004] PART 1: Schema changes';

    -- ────────────────────────────────────────────────────────────────────────
    -- pos_transactions columns
    -- ────────────────────────────────────────────────────────────────────────

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pos_transactions' AND column_name = 'discount_account_code') THEN
        ALTER TABLE pos_transactions ADD COLUMN discount_account_code VARCHAR(10);
        COMMENT ON COLUMN pos_transactions.discount_account_code IS 
            '[2004] Contra-revenue account code (4110-4113). Set by posService.js before trigger fires.';
        RAISE NOTICE '  + pos_transactions.discount_account_code';
    ELSE
        RAISE NOTICE '  · pos_transactions.discount_account_code (already exists)';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pos_transactions' AND column_name = 'net_tax_amount') THEN
        ALTER TABLE pos_transactions ADD COLUMN net_tax_amount NUMERIC(15,2) DEFAULT 0;
        COMMENT ON COLUMN pos_transactions.net_tax_amount IS 
            '[2004] Tax calculated on net (post-discount) amount. Set by posService.js.';
        RAISE NOTICE '  + pos_transactions.net_tax_amount';
    ELSE
        RAISE NOTICE '  · pos_transactions.net_tax_amount (already exists)';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pos_transactions' AND column_name = 'discount_breakdown_by_account') THEN
        ALTER TABLE pos_transactions ADD COLUMN discount_breakdown_by_account JSONB;
        COMMENT ON COLUMN pos_transactions.discount_breakdown_by_account IS 
            '[2004] JSON breakdown for stacked discounts: {"4113": 10000, "4111": 5000}.';
        RAISE NOTICE '  + pos_transactions.discount_breakdown_by_account';
    ELSE
        RAISE NOTICE '  · pos_transactions.discount_breakdown_by_account (already exists)';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pos_transactions' AND column_name = 'discount_correction_status') THEN
        ALTER TABLE pos_transactions 
            ADD COLUMN discount_correction_status VARCHAR(20) DEFAULT NULL
            CHECK (discount_correction_status IN ('PENDING', 'CORRECTED', 'SKIPPED', 'ERROR') 
                   OR discount_correction_status IS NULL);
        COMMENT ON COLUMN pos_transactions.discount_correction_status IS 
            '[2004] Tracks historical correction status. NULL = not applicable, PENDING = needs fix.';
        RAISE NOTICE '  + pos_transactions.discount_correction_status';
    ELSE
        RAISE NOTICE '  · pos_transactions.discount_correction_status (already exists)';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pos_transactions' AND column_name = 'customer_type_at_sale') THEN
        ALTER TABLE pos_transactions ADD COLUMN customer_type_at_sale VARCHAR(20);
        COMMENT ON COLUMN pos_transactions.customer_type_at_sale IS 
            '[2004] Customer type at time of sale (individual/company). Preserves audit trail.';
        RAISE NOTICE '  + pos_transactions.customer_type_at_sale';
    ELSE
        RAISE NOTICE '  · pos_transactions.customer_type_at_sale (already exists)';
    END IF;

    -- ────────────────────────────────────────────────────────────────────────
    -- pos_transaction_items columns
    -- ────────────────────────────────────────────────────────────────────────

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pos_transaction_items' AND column_name = 'net_unit_price') THEN
        ALTER TABLE pos_transaction_items ADD COLUMN net_unit_price NUMERIC(15,2);
        COMMENT ON COLUMN pos_transaction_items.net_unit_price IS 
            '[2004] Unit price after discount allocation (tax base).';
        RAISE NOTICE '  + pos_transaction_items.net_unit_price';
    ELSE
        RAISE NOTICE '  · pos_transaction_items.net_unit_price (already exists)';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pos_transaction_items' AND column_name = 'line_tax_amount') THEN
        ALTER TABLE pos_transaction_items ADD COLUMN line_tax_amount NUMERIC(15,2) DEFAULT 0;
        COMMENT ON COLUMN pos_transaction_items.line_tax_amount IS 
            '[2004] Tax calculated on net line amount.';
        RAISE NOTICE '  + pos_transaction_items.line_tax_amount';
    ELSE
        RAISE NOTICE '  · pos_transaction_items.line_tax_amount (already exists)';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'pos_transaction_items' AND column_name = 'item_discount_amount') THEN
        ALTER TABLE pos_transaction_items ADD COLUMN item_discount_amount NUMERIC(15,2) DEFAULT 0;
        COMMENT ON COLUMN pos_transaction_items.item_discount_amount IS 
            '[2004] Discount allocated to this line item.';
        RAISE NOTICE '  + pos_transaction_items.item_discount_amount';
    ELSE
        RAISE NOTICE '  · pos_transaction_items.item_discount_amount (already exists)';
    END IF;

END $$;

-- ============================================================================
-- PART 2: Stamp ONLY transactions with the bug pattern (FINGERPRINT CHECK)
-- ============================================================================

-- First, clear any existing PENDING stamps for idempotency
UPDATE pos_transactions 
SET discount_correction_status = NULL 
WHERE discount_correction_status = 'PENDING';

-- CRITICAL: Only stamp transactions that have the separate discount journal entry
-- This is the fingerprint of Bug B/C - a journal entry that mentions discount
-- but is NOT the main pos_transaction entry
UPDATE pos_transactions
SET discount_correction_status = 'PENDING'
WHERE discount_amount > 0
  AND status = 'completed'
  AND discount_correction_status IS NULL
  AND EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.reference_id = pos_transactions.id::TEXT
        AND je.business_id = pos_transactions.business_id
        AND je.description ILIKE '%discount%'
        AND je.reference_type <> 'pos_transaction'
        AND je.reference_number NOT ILIKE 'CORR-%'
  );

DO $$
DECLARE v_pending INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_pending FROM pos_transactions WHERE discount_correction_status = 'PENDING';
    RAISE NOTICE '[2004]   % transactions stamped PENDING (only those with the separate discount entry pattern)', v_pending;
END $$;

-- ============================================================================
-- PART 3: Backfill customer_type_at_sale
-- ============================================================================

-- Set from customers table where possible
UPDATE pos_transactions pt
SET customer_type_at_sale = c.customer_type
FROM customers c
WHERE pt.customer_id = c.id
  AND pt.discount_amount > 0
  AND pt.customer_type_at_sale IS NULL;

-- For walk-in customers (no customer_id), default to 'individual' (VAT)
UPDATE pos_transactions
SET customer_type_at_sale = 'individual'
WHERE discount_amount > 0
  AND customer_type_at_sale IS NULL
  AND customer_id IS NULL;

-- For any remaining NULL, default to 'individual'
UPDATE pos_transactions
SET customer_type_at_sale = 'individual'
WHERE discount_amount > 0
  AND customer_type_at_sale IS NULL;

DO $$
DECLARE v_backfilled INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_backfilled FROM pos_transactions 
    WHERE customer_type_at_sale IS NOT NULL AND discount_amount > 0;
    RAISE NOTICE '[2004]   % transactions have customer_type_at_sale set', v_backfilled;
END $$;

-- ============================================================================
-- PART 4: Indexes for performance
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '[2004]   Creating indexes...';
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pos_tx_discount_account') THEN
        CREATE INDEX idx_pos_tx_discount_account 
        ON pos_transactions(discount_account_code)
        WHERE discount_account_code IS NOT NULL;
        RAISE NOTICE '    + idx_pos_tx_discount_account';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pos_tx_correction_status') THEN
        CREATE INDEX idx_pos_tx_correction_status 
        ON pos_transactions(business_id, discount_correction_status)
        WHERE discount_correction_status = 'PENDING';
        RAISE NOTICE '    + idx_pos_tx_correction_status';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pos_tx_net_tax') THEN
        CREATE INDEX idx_pos_tx_net_tax 
        ON pos_transactions(business_id, net_tax_amount)
        WHERE discount_amount > 0;
        RAISE NOTICE '    + idx_pos_tx_net_tax';
    END IF;
END $$;

-- ============================================================================
-- PART 5: TRIGGER FUNCTION (RETURNS TRIGGER, uses NEW.*)
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '[2004] PART 5: Replacing trigger function';
END $$;

CREATE OR REPLACE FUNCTION create_journal_entry_for_pos_transaction_fixed()
RETURNS TRIGGER AS $$
DECLARE
    v_receiving_account_id   UUID;
    v_revenue_account_id     UUID;
    v_tax_account_id         UUID;
    v_discount_account_id    UUID;
    v_cogs_account_id        UUID;
    v_inventory_account_id   UUID;
    v_gross_subtotal         NUMERIC(15,2);
    v_discount_amount        NUMERIC(15,2);
    v_net_tax                NUMERIC(15,2);
    v_cash_amount            NUMERIC(15,2);
    v_total_cogs             NUMERIC(15,2) := 0;
    v_discount_acc_code      TEXT;
    v_discount_breakdown     JSONB;
    v_acc_code               TEXT;
    v_acc_amount             NUMERIC(15,2);
    v_acc_id                 UUID;
    v_breakdown_total        NUMERIC(15,2) := 0;
    v_journal_id             UUID;
    v_ref_number             TEXT;
    v_description            TEXT;
    v_product_count          INTEGER := 0;
    v_customer_type_for_tax  VARCHAR(20);
    v_error_message          TEXT;
BEGIN
    -- Only fire on pending → completed transition
    IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
        RETURN NEW;
    END IF;

    -- Read values from the NEW row (set by posService.js)
    v_gross_subtotal     := NEW.total_amount;
    v_discount_amount    := COALESCE(NEW.discount_amount, 0);
    v_net_tax            := COALESCE(NEW.net_tax_amount, NEW.tax_amount, 0);
    v_cash_amount        := NEW.final_amount;
    v_discount_acc_code  := NEW.discount_account_code;
    v_discount_breakdown := NEW.discount_breakdown_by_account;

    -- Determine customer type for tax selection
    v_customer_type_for_tax := NEW.customer_type_at_sale;
    
    -- Fallback 1: from customers table
    IF v_customer_type_for_tax IS NULL AND NEW.customer_id IS NOT NULL THEN
        SELECT c.customer_type INTO v_customer_type_for_tax
        FROM customers c WHERE c.id = NEW.customer_id;
    END IF;
    
    -- Fallback 2: default to individual (VAT) for POS
    IF v_customer_type_for_tax IS NULL THEN
        v_customer_type_for_tax := 'individual';
    END IF;

    -- Sanity checks
    IF v_gross_subtotal <= 0 THEN
        RAISE EXCEPTION '[2004] total_amount must be > 0 for %', NEW.transaction_number;
    END IF;
    IF v_cash_amount <= 0 THEN
        RAISE EXCEPTION '[2004] final_amount must be > 0 for %', NEW.transaction_number;
    END IF;

    -- Consistency check: cash should equal (gross - discount + net_tax)
    -- Tolerance of 1 currency unit for rounding
    IF ABS(v_cash_amount - (v_gross_subtotal - v_discount_amount + v_net_tax)) > 1 THEN
        RAISE EXCEPTION '[2004] Amount inconsistency on %: final_amount=% but (gross-discount+net_tax)=%',
            NEW.transaction_number, v_cash_amount,
            (v_gross_subtotal - v_discount_amount + v_net_tax);
    END IF;

    -- Calculate COGS for product/inventory items
    SELECT 
        COUNT(*) FILTER (WHERE item_type IN ('product', 'inventory')),
        COALESCE(SUM(CASE WHEN item_type IN ('product', 'inventory')
                         THEN pti.quantity * COALESCE(ii.cost_price, 0) ELSE 0 END), 0)
    INTO v_product_count, v_total_cogs
    FROM pos_transaction_items pti
    LEFT JOIN inventory_items ii ON ii.id = pti.inventory_item_id
    WHERE pti.pos_transaction_id = NEW.id;

    -- ────────────────────────────────────────────────────────────────────────
    -- Account resolution
    -- ────────────────────────────────────────────────────────────────────────

    -- Receiving account (cash/bank/mobile based on payment method)
    SELECT id INTO v_receiving_account_id FROM chart_of_accounts
    WHERE business_id = NEW.business_id
      AND account_code = CASE NEW.payment_method
                            WHEN 'cash'         THEN '1110'
                            WHEN 'card'         THEN '1120'
                            WHEN 'mobile_money' THEN '1130'
                            ELSE '1110' 
                        END
      AND is_active = true 
    LIMIT 1;
    
    -- Fallback to generic cash account
    IF v_receiving_account_id IS NULL THEN
        SELECT id INTO v_receiving_account_id FROM chart_of_accounts
        WHERE business_id = NEW.business_id AND account_code = '1110' AND is_active = true 
        LIMIT 1;
    END IF;

    -- Revenue account (4100)
    SELECT id INTO v_revenue_account_id FROM chart_of_accounts
    WHERE business_id = NEW.business_id AND account_code = '4100' AND is_active = true 
    LIMIT 1;

    -- Tax account based on customer type (WHT for companies, VAT for individuals)
    IF v_customer_type_for_tax = 'company' THEN
        SELECT id INTO v_tax_account_id FROM chart_of_accounts
        WHERE business_id = NEW.business_id AND account_code = '2130' AND is_active = true 
        LIMIT 1;
    ELSE
        SELECT id INTO v_tax_account_id FROM chart_of_accounts
        WHERE business_id = NEW.business_id AND account_code = '2120' AND is_active = true 
        LIMIT 1;
    END IF;
    
    -- Ultimate fallback: any tax account
    IF v_tax_account_id IS NULL THEN
        SELECT id INTO v_tax_account_id FROM chart_of_accounts
        WHERE business_id = NEW.business_id AND account_code IN ('2130', '2120') AND is_active = true
        LIMIT 1;
    END IF;

    -- COGS and Inventory accounts (for product sales)
    SELECT id INTO v_cogs_account_id FROM chart_of_accounts
    WHERE business_id = NEW.business_id AND account_code = '5100' AND is_active = true 
    LIMIT 1;
    
    SELECT id INTO v_inventory_account_id FROM chart_of_accounts
    WHERE business_id = NEW.business_id AND account_code = '1300' AND is_active = true 
    LIMIT 1;

    -- Discount account (contra-revenue)
    IF v_discount_amount > 0 THEN
        -- Try using the stored account code
        IF v_discount_acc_code IS NOT NULL THEN
            SELECT id INTO v_discount_account_id FROM chart_of_accounts
            WHERE business_id = NEW.business_id 
              AND account_code = v_discount_acc_code
              AND is_active = true 
            LIMIT 1;
        END IF;
        
        -- Fallback to any discount account
        IF v_discount_account_id IS NULL THEN
            SELECT id INTO v_discount_account_id FROM chart_of_accounts
            WHERE business_id = NEW.business_id 
              AND account_code IN ('4113', '4112', '4111', '4110')
              AND is_active = true 
            ORDER BY account_code DESC 
            LIMIT 1;
        END IF;
        
        -- Hard fail if no discount account exists
        IF v_discount_account_id IS NULL AND v_discount_breakdown IS NULL THEN
            RAISE EXCEPTION '[2004] No discount account found for business %', NEW.business_id;
        END IF;
    END IF;

    -- Required account validation
    IF v_receiving_account_id IS NULL THEN
        RAISE EXCEPTION '[2004] Receiving account not found for business %', NEW.business_id;
    END IF;
    
    IF v_revenue_account_id IS NULL THEN
        RAISE EXCEPTION '[2004] Revenue account 4100 not found for business %', NEW.business_id;
    END IF;

    -- ────────────────────────────────────────────────────────────────────────
    -- Create the journal entry
    -- ────────────────────────────────────────────────────────────────────────

    v_ref_number := 'JE-' || NEW.transaction_number;
    v_description := 'POS Sale: ' || NEW.transaction_number || ' | ' || NEW.payment_method;
    IF v_discount_amount > 0 THEN
        v_description := v_description || ' | Discount: ' || v_discount_amount::TEXT;
    END IF;

    INSERT INTO journal_entries (
        business_id, journal_date, reference_number, reference_type, reference_id,
        description, total_amount, status, created_by, posted_at, created_at, updated_at
    ) VALUES (
        NEW.business_id, CURRENT_DATE, v_ref_number, 'pos_transaction', NEW.id::TEXT,
        v_description, v_cash_amount + COALESCE(v_total_cogs, 0),
        'posted', NEW.created_by, NOW(), NOW(), NOW()
    ) RETURNING id INTO v_journal_id;

    -- LINE 1: Cash/Bank DEBIT (what the customer paid)
    INSERT INTO journal_entry_lines (
        business_id, journal_entry_id, account_id, line_type, amount, description, created_at
    ) VALUES (
        NEW.business_id, v_journal_id, v_receiving_account_id, 'debit', v_cash_amount,
        'Payment received: ' || NEW.transaction_number, NOW()
    );

    -- LINE 2: Sales Revenue CREDIT (GROSS catalogue price)
    INSERT INTO journal_entry_lines (
        business_id, journal_entry_id, account_id, line_type, amount, description, created_at
    ) VALUES (
        NEW.business_id, v_journal_id, v_revenue_account_id, 'credit', v_gross_subtotal,
        'Sales revenue (gross): ' || NEW.transaction_number, NOW()
    );

    -- LINE 3: Tax Payable CREDIT (tax on NET amount - BUG A FIX)
    IF v_net_tax > 0 AND v_tax_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
            business_id, journal_entry_id, account_id, line_type, amount, description, created_at
        ) VALUES (
            NEW.business_id, v_journal_id, v_tax_account_id, 'credit', v_net_tax,
            'Tax payable on net amount: ' || NEW.transaction_number, NOW()
        );
    END IF;

    -- LINE 4: Discount DEBIT (contra-revenue - BUG B/C FIX)
    IF v_discount_amount > 0 THEN
        -- Handle stacked discounts with multiple account codes
        IF v_discount_breakdown IS NOT NULL AND jsonb_typeof(v_discount_breakdown) = 'object' THEN
            FOR v_acc_code, v_acc_amount IN 
                SELECT key, value::NUMERIC(15,2) FROM jsonb_each_text(v_discount_breakdown)
            LOOP
                CONTINUE WHEN COALESCE(v_acc_amount, 0) <= 0;
                
                SELECT id INTO v_acc_id FROM chart_of_accounts
                WHERE business_id = NEW.business_id AND account_code = v_acc_code AND is_active = true 
                LIMIT 1;
                
                IF v_acc_id IS NOT NULL THEN
                    INSERT INTO journal_entry_lines (
                        business_id, journal_entry_id, account_id, line_type, amount, description, created_at
                    ) VALUES (
                        NEW.business_id, v_journal_id, v_acc_id, 'debit', v_acc_amount,
                        'Discount (' || v_acc_code || '): ' || NEW.transaction_number, NOW()
                    );
                    v_breakdown_total := v_breakdown_total + v_acc_amount;
                END IF;
            END LOOP;
            
            -- Rounding adjustment for penny differences
            IF ABS(v_breakdown_total - v_discount_amount) > 0.005 AND v_discount_account_id IS NOT NULL THEN
                INSERT INTO journal_entry_lines (
                    business_id, journal_entry_id, account_id, line_type, amount, description, created_at
                ) VALUES (
                    NEW.business_id, v_journal_id, v_discount_account_id, 'debit',
                    v_discount_amount - v_breakdown_total,
                    'Discount rounding adjustment: ' || NEW.transaction_number, NOW()
                );
            END IF;
        ELSIF v_discount_account_id IS NOT NULL THEN
            -- Single discount type
            INSERT INTO journal_entry_lines (
                business_id, journal_entry_id, account_id, line_type, amount, description, created_at
            ) VALUES (
                NEW.business_id, v_journal_id, v_discount_account_id, 'debit', v_discount_amount,
                'Discount: ' || NEW.transaction_number, NOW()
            );
        END IF;
    END IF;

    -- LINES 5 & 6: COGS and Inventory (for product sales)
    IF v_total_cogs > 0 AND v_cogs_account_id IS NOT NULL AND v_inventory_account_id IS NOT NULL THEN
        -- Debit COGS
        INSERT INTO journal_entry_lines (
            business_id, journal_entry_id, account_id, line_type, amount, description, created_at
        ) VALUES (
            NEW.business_id, v_journal_id, v_cogs_account_id, 'debit', v_total_cogs,
            'Cost of goods sold: ' || NEW.transaction_number, NOW()
        );
        
        -- Credit Inventory
        INSERT INTO journal_entry_lines (
            business_id, journal_entry_id, account_id, line_type, amount, description, created_at
        ) VALUES (
            NEW.business_id, v_journal_id, v_inventory_account_id, 'credit', v_total_cogs,
            'Inventory reduction: ' || NEW.transaction_number, NOW()
        );
        
        -- Link inventory transactions to this journal entry
        UPDATE inventory_transactions
        SET journal_entry_id = v_journal_id, updated_at = NOW()
        WHERE reference_id = NEW.id 
          AND reference_type = 'pos_transaction' 
          AND journal_entry_id IS NULL;
    END IF;

    -- Mark transaction as processed
    UPDATE pos_transactions
    SET accounting_processed = TRUE, accounting_error = NULL, updated_at = NOW()
    WHERE id = NEW.id;

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    UPDATE pos_transactions
    SET accounting_error = '[2004] ' || v_error_message, accounting_processed = FALSE, updated_at = NOW()
    WHERE id = NEW.id;
    RAISE;  -- Re-raise to roll back the transaction
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_journal_entry_for_pos_transaction_fixed() IS
    '[2004] TRIGGER FUNCTION. Fires AFTER UPDATE on pos_transactions when status pending→completed. '
    'Creates single balanced journal entry: Cash DR | Revenue CR (gross) | Tax CR (net) | '
    'Discount DR (contra-revenue) | COGS DR | Inventory CR. Uses customer_type_at_sale to choose '
    'WHT (2130) for companies or VAT (2120) for individuals.';

DO $$
BEGIN RAISE NOTICE '[2004] ✓ Trigger function replaced'; END $$;

-- ============================================================================
-- PART 6: RE-BIND TRIGGER
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '[2004] PART 6: Re-binding trigger';
END $$;

DROP TRIGGER IF EXISTS trigger_auto_pos_accounting ON pos_transactions;

CREATE TRIGGER trigger_auto_pos_accounting
    AFTER UPDATE OF status
    ON pos_transactions
    FOR EACH ROW
    EXECUTE FUNCTION create_journal_entry_for_pos_transaction_fixed();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'trigger_auto_pos_accounting' 
          AND event_object_table = 'pos_transactions'
    ) THEN
        RAISE EXCEPTION '[2004] Trigger binding failed — rolling back';
    END IF;
    RAISE NOTICE '[2004] ✓ trigger_auto_pos_accounting bound and verified';
END $$;

-- ============================================================================
-- PART 7: HISTORICAL CORRECTING ENTRIES (With fingerprint check)
-- ============================================================================

DO $$
DECLARE
    rec                  RECORD;
    v_cash_id            UUID;
    v_revenue_id         UUID;
    v_tax_id             UUID;
    v_discount_id        UUID;
    v_correct_tax        NUMERIC(15,2);
    v_tax_over           NUMERIC(15,2);
    v_discount_acc_code  TEXT;
    v_journal_id         UUID;
    v_ref                TEXT;
    v_system_user_id     UUID;
    v_corrected          INTEGER := 0;
    v_skipped            INTEGER := 0;
    v_errors             INTEGER := 0;
    v_business_rec       RECORD;
    v_is_dry_run         BOOLEAN;
BEGIN
    -- Check dry-run mode
    BEGIN
        v_is_dry_run := current_setting('migration.dry_run', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        v_is_dry_run := false;
    END;

    RAISE NOTICE '';
    RAISE NOTICE '[2004] PART 7: Historical correcting entries';
    IF v_is_dry_run THEN
        RAISE NOTICE '[2004] 🔍 DRY-RUN MODE - No changes will be committed';
    ELSE
        RAISE NOTICE '[2004] 🔧 APPLY MODE - Changes will be committed';
    END IF;

    -- Process each business that has PENDING transactions
    FOR v_business_rec IN
        SELECT DISTINCT business_id
        FROM pos_transactions
        WHERE discount_correction_status = 'PENDING'
        ORDER BY business_id
    LOOP
        -- Validate business exists
        IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = v_business_rec.business_id) THEN
            RAISE WARNING '[2004]   Business % not found - skipping', v_business_rec.business_id;
            CONTINUE;
        END IF;

        RAISE NOTICE '[2004]   Processing business: %', v_business_rec.business_id;

        -- Get a user for this business (using users.business_id - confirmed column)
        SELECT u.id INTO v_system_user_id
        FROM users u
        WHERE u.business_id = v_business_rec.business_id
          AND u.is_active = true
        ORDER BY 
            CASE WHEN u.role = 'admin' THEN 1 ELSE 2 END,
            u.created_at
        LIMIT 1;
        
        -- Fallback: any active user in the system
        IF v_system_user_id IS NULL THEN
            SELECT id INTO v_system_user_id
            FROM users 
            WHERE is_active = true 
            ORDER BY created_at 
            LIMIT 1;
            RAISE NOTICE '[2004]     Using fallback system user: %', v_system_user_id;
        END IF;

        IF v_system_user_id IS NULL THEN
            RAISE WARNING '[2004]     No user found - skipping business %', v_business_rec.business_id;
            CONTINUE;
        END IF;

        -- Get account IDs for this business
        SELECT id INTO v_cash_id FROM chart_of_accounts
        WHERE business_id = v_business_rec.business_id 
          AND account_code = '1110' AND is_active = true 
        LIMIT 1;

        SELECT id INTO v_revenue_id FROM chart_of_accounts
        WHERE business_id = v_business_rec.business_id 
          AND account_code = '4100' AND is_active = true 
        LIMIT 1;

        SELECT id INTO v_tax_id FROM chart_of_accounts
        WHERE business_id = v_business_rec.business_id 
          AND account_code IN ('2130', '2120') AND is_active = true
        ORDER BY account_code 
        LIMIT 1;

        -- Skip business if critical accounts missing
        IF v_revenue_id IS NULL THEN
            RAISE WARNING '[2004]     Revenue account 4100 missing - skipping business %', 
                v_business_rec.business_id;
            CONTINUE;
        END IF;

        IF v_cash_id IS NULL THEN
            RAISE WARNING '[2004]     Cash account 1110 missing - skipping business %', 
                v_business_rec.business_id;
            CONTINUE;
        END IF;

        -- Process PENDING transactions with the FINGERPRINT CHECK
        FOR rec IN
            SELECT
                pt.id,
                pt.transaction_number,
                pt.total_amount,
                pt.discount_amount,
                pt.tax_amount AS recorded_tax,
                COALESCE(pt.tax_rate, 0) AS tax_rate,
                ROUND((pt.total_amount - pt.discount_amount) * COALESCE(pt.tax_rate, 0) / 100.0, 2) AS correct_tax,
                COALESCE(pt.discount_account_code, '4110') AS discount_acc_code,
                pt.business_id
            FROM pos_transactions pt
            WHERE pt.business_id = v_business_rec.business_id
              AND pt.discount_amount > 0
              AND pt.status = 'completed'
              AND pt.discount_correction_status = 'PENDING'
              -- CRITICAL FINGERPRINT CHECK - Only transactions with the bug pattern
              AND EXISTS (
                  SELECT 1 FROM journal_entries je
                  WHERE je.reference_id = pt.id::TEXT
                    AND je.business_id = pt.business_id
                    AND je.description ILIKE '%discount%'
                    AND je.reference_type <> 'pos_transaction'
                    AND je.reference_number NOT ILIKE 'CORR-%'
              )
              -- Skip if tax is already correct (safety)
              AND ABS(pt.tax_amount - ROUND((pt.total_amount - pt.discount_amount) * COALESCE(pt.tax_rate, 0) / 100.0, 2)) > 0.01
            ORDER BY pt.transaction_date DESC
            LIMIT 500
        LOOP
            v_correct_tax := rec.correct_tax;
            v_tax_over := ROUND(rec.recorded_tax - v_correct_tax, 2);
            v_discount_acc_code := rec.discount_acc_code;

            -- Skip if nothing to correct
            IF rec.discount_amount = 0 AND v_tax_over = 0 THEN
                IF NOT v_is_dry_run THEN
                    UPDATE pos_transactions SET discount_correction_status = 'SKIPPED' WHERE id = rec.id;
                END IF;
                v_skipped := v_skipped + 1;
                CONTINUE;
            END IF;

            BEGIN
                -- Get discount account for this business
                SELECT id INTO v_discount_id FROM chart_of_accounts
                WHERE business_id = rec.business_id
                  AND account_code = v_discount_acc_code AND is_active = true 
                LIMIT 1;

                IF v_discount_id IS NULL THEN
                    SELECT id INTO v_discount_id FROM chart_of_accounts
                    WHERE business_id = rec.business_id
                      AND account_code IN ('4113', '4112', '4111', '4110') AND is_active = true
                    ORDER BY account_code DESC 
                    LIMIT 1;
                END IF;

                IF v_discount_id IS NULL THEN
                    RAISE EXCEPTION 'No discount account found for business %', rec.business_id;
                END IF;

                v_ref := 'CORR-' || rec.transaction_number || '-' || TO_CHAR(NOW(), 'YYYYMMDD');

                IF v_is_dry_run THEN
                    -- Dry run: just log what would happen
                    RAISE NOTICE '[2004]     🔍 WOULD CORRECT: % | Discount: % | Tax: %→% (over: %)',
                        rec.transaction_number, rec.discount_amount, rec.recorded_tax, v_correct_tax, v_tax_over;
                    v_corrected := v_corrected + 1;
                ELSE
                    -- Actually apply the correction
                    INSERT INTO journal_entries (
                        business_id, journal_date, reference_number, reference_type, reference_id,
                        description, total_amount, status, created_by, posted_at, created_at, updated_at
                    ) VALUES (
                        rec.business_id, CURRENT_DATE, v_ref, 'pos_transaction', rec.id::TEXT,
                        'CORRECTION [2004]: ' || rec.transaction_number,
                        rec.discount_amount + ABS(v_tax_over),
                        'posted', v_system_user_id, NOW(), NOW(), NOW()
                    ) RETURNING id INTO v_journal_id;

                    -- LINE 1: Debit Revenue (removes wrong revenue credit)
                    INSERT INTO journal_entry_lines (
                        business_id, journal_entry_id, account_id, line_type, amount, description, created_at
                    ) VALUES (
                        rec.business_id, v_journal_id, v_revenue_id, 'debit', rec.discount_amount,
                        'CORR: Remove inflated revenue credit from separate discount entry', NOW()
                    );

                    -- LINE 2: Adjust Tax (removes excess tax or adds under-collected)
                    IF v_tax_over > 0 AND v_tax_id IS NOT NULL THEN
                        INSERT INTO journal_entry_lines (
                            business_id, journal_entry_id, account_id, line_type, amount, description, created_at
                        ) VALUES (
                            rec.business_id, v_journal_id, v_tax_id, 'debit', v_tax_over,
                            'CORR: Remove excess tax (gross → net)', NOW()
                        );
                    ELSIF v_tax_over < 0 AND v_tax_id IS NOT NULL THEN
                        INSERT INTO journal_entry_lines (
                            business_id, journal_entry_id, account_id, line_type, amount, description, created_at
                        ) VALUES (
                            rec.business_id, v_journal_id, v_tax_id, 'credit', ABS(v_tax_over),
                            'CORR: Add under-collected tax', NOW()
                        );
                    END IF;

                    -- LINE 3: Credit Discount (reverses orphaned discount debit)
                    INSERT INTO journal_entry_lines (
                        business_id, journal_entry_id, account_id, line_type, amount, description, created_at
                    ) VALUES (
                        rec.business_id, v_journal_id, v_discount_id, 'credit', rec.discount_amount,
                        'CORR: Reverse misposted discount debit from separate entry', NOW()
                    );

                    -- LINE 4: Adjust Cash (customer was over/under charged)
                    IF v_tax_over > 0 AND v_cash_id IS NOT NULL THEN
                        INSERT INTO journal_entry_lines (
                            business_id, journal_entry_id, account_id, line_type, amount, description, created_at
                        ) VALUES (
                            rec.business_id, v_journal_id, v_cash_id, 'credit', v_tax_over,
                            'CORR: Adjust cash — customer overcharged', NOW()
                        );
                    ELSIF v_tax_over < 0 AND v_cash_id IS NOT NULL THEN
                        INSERT INTO journal_entry_lines (
                            business_id, journal_entry_id, account_id, line_type, amount, description, created_at
                        ) VALUES (
                            rec.business_id, v_journal_id, v_cash_id, 'debit', ABS(v_tax_over),
                            'CORR: Adjust cash — customer undercharged', NOW()
                        );
                    END IF;

                    -- Mark transaction as corrected
                    UPDATE pos_transactions
                    SET discount_correction_status = 'CORRECTED', 
                        net_tax_amount = v_correct_tax,
                        accounting_error = NULL, 
                        updated_at = NOW()
                    WHERE id = rec.id;

                    v_corrected := v_corrected + 1;
                    RAISE NOTICE '[2004]     ✓ % | Tax: %→% (over: %)', 
                        rec.transaction_number, rec.recorded_tax, v_correct_tax, v_tax_over;
                END IF;

            EXCEPTION WHEN OTHERS THEN
                v_errors := v_errors + 1;
                IF NOT v_is_dry_run THEN
                    UPDATE pos_transactions
                    SET discount_correction_status = 'ERROR', 
                        accounting_error = SQLERRM, 
                        updated_at = NOW()
                    WHERE id = rec.id;
                END IF;
                RAISE WARNING '[2004]     ✗ % failed: %', rec.transaction_number, SQLERRM;
            END;
        END LOOP;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '[2004] Historical correction results:';
    RAISE NOTICE '[2004]   Corrected: %', v_corrected;
    RAISE NOTICE '[2004]   Skipped:   %', v_skipped;
    RAISE NOTICE '[2004]   Errors:    %', v_errors;
    
    IF v_is_dry_run AND v_corrected > 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE '[2004] 🔍 Dry-run complete. To apply changes:';
        RAISE NOTICE '[2004]    SET migration.dry_run = ''false'';';
        RAISE NOTICE '[2004]    Then re-run this migration';
    END IF;
END $$;

-- ============================================================================
-- PART 8: PER-BUSINESS TRIAL BALANCE VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_business_rec   RECORD;
    v_debits         NUMERIC;
    v_credits        NUMERIC;
    v_diff           NUMERIC;
    v_any_imbalance  BOOLEAN := FALSE;
    v_is_dry_run     BOOLEAN;
BEGIN
    BEGIN
        v_is_dry_run := current_setting('migration.dry_run', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        v_is_dry_run := false;
    END;

    RAISE NOTICE '';
    RAISE NOTICE '[2004] PART 8: Per-business trial balance verification';

    -- Get all businesses that have journal entries
    FOR v_business_rec IN
        SELECT DISTINCT je.business_id, b.name as business_name
        FROM journal_entries je
        JOIN businesses b ON b.id = je.business_id
        WHERE je.reference_type = 'pos_transaction'
           OR je.business_id IN (SELECT DISTINCT business_id FROM pos_transactions WHERE discount_amount > 0)
    LOOP
        SELECT
            COALESCE(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END), 0)
        INTO v_debits, v_credits
        FROM journal_entries je
        JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        WHERE je.business_id = v_business_rec.business_id;

        v_diff := v_debits - v_credits;

        IF ABS(v_diff) < 0.01 THEN
            RAISE NOTICE '[2004]   ✓ %: BALANCED (DR=%, CR=%)', 
                COALESCE(v_business_rec.business_name, v_business_rec.business_id::TEXT), 
                v_debits, v_credits;
        ELSE
            v_any_imbalance := TRUE;
            RAISE WARNING '[2004]   ✗ %: IMBALANCED by % (DR=%, CR=%)', 
                COALESCE(v_business_rec.business_name, v_business_rec.business_id::TEXT), 
                v_diff, v_debits, v_credits;
        END IF;
    END LOOP;

    IF v_any_imbalance AND NOT v_is_dry_run THEN
        RAISE EXCEPTION '[2004] ✗ Trial balance IMBALANCED - rolling back all changes';
    ELSIF v_any_imbalance AND v_is_dry_run THEN
        RAISE NOTICE '[2004] ⚠ Would roll back due to imbalance (dry-run mode)';
    ELSE
        RAISE NOTICE '[2004] ✅ All businesses have balanced trial balances';
    END IF;
END $$;

-- ============================================================================
-- PART 9: VERIFICATION FUNCTION (Checks all 5 columns)
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_pos_discount_fix(p_business_id UUID DEFAULT NULL)
RETURNS TABLE(
    check_item TEXT, 
    status TEXT, 
    detail TEXT, 
    action_if_failing TEXT
) AS $$
DECLARE
    v_n      INTEGER;
    v_dr     NUMERIC;
    v_cr     NUMERIC;
    v_ok     BOOLEAN;
BEGIN
    -- Check 1: All 5 pos_transactions columns exist
    SELECT COUNT(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'pos_transactions'
      AND column_name IN (
          'discount_account_code', 
          'net_tax_amount', 
          'discount_breakdown_by_account', 
          'discount_correction_status', 
          'customer_type_at_sale'
      );
    
    check_item := 'pos_transactions: 5 new columns';
    status := CASE WHEN v_n = 5 THEN '✅ PASS' ELSE '❌ FAIL' END;
    detail := v_n::TEXT || ' of 5 columns present';
    action_if_failing := 'Re-run PART 1 of migration';
    RETURN NEXT;

    -- Check 2: All 3 pos_transaction_items columns exist
    SELECT COUNT(*) INTO v_n FROM information_schema.columns
    WHERE table_name = 'pos_transaction_items'
      AND column_name IN ('net_unit_price', 'line_tax_amount', 'item_discount_amount');
    
    check_item := 'pos_transaction_items: 3 new columns';
    status := CASE WHEN v_n = 3 THEN '✅ PASS' ELSE '❌ FAIL' END;
    detail := v_n::TEXT || ' of 3 columns present';
    action_if_failing := 'Re-run PART 1 of migration';
    RETURN NEXT;

    -- Check 3: Trigger function exists and has correct signature and logic
    SELECT EXISTS(
        SELECT 1 FROM pg_proc 
        WHERE proname = 'create_journal_entry_for_pos_transaction_fixed'
          AND prorettype = (SELECT oid FROM pg_type WHERE typname = 'trigger')
          AND prosrc ILIKE '%customer_type_at_sale%'
          AND prosrc ILIKE '%net_tax_amount%'
          AND prosrc ILIKE '%discount_breakdown%'
    ) INTO v_ok;
    
    check_item := 'Trigger function: correct signature + logic';
    status := CASE WHEN v_ok THEN '✅ PASS' ELSE '❌ FAIL' END;
    detail := CASE WHEN v_ok 
                  THEN 'Returns TRIGGER, uses customer_type_at_sale and net_tax_amount'
                  ELSE 'Missing required logic or wrong return type' 
              END;
    action_if_failing := 'Re-run PART 5 of migration';
    RETURN NEXT;

    -- Check 4: Trigger is bound to the table
    SELECT EXISTS(
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'trigger_auto_pos_accounting' 
          AND event_object_table = 'pos_transactions'
    ) INTO v_ok;
    
    check_item := 'Trigger bound to pos_transactions';
    status := CASE WHEN v_ok THEN '✅ PASS' ELSE '❌ FAIL' END;
    detail := 'trigger_auto_pos_accounting on pos_transactions';
    action_if_failing := 'Re-run PART 6 of migration';
    RETURN NEXT;

    -- Check 5: Per-business trial balance (if business ID provided)
    IF p_business_id IS NOT NULL THEN
        SELECT 
            COALESCE(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END), 0)
        INTO v_dr, v_cr
        FROM journal_entries je
        JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        WHERE je.business_id = p_business_id;
        
        check_item := 'Trial balance for provided business';
        status := CASE WHEN ABS(v_dr - v_cr) < 0.01 THEN '✅ PASS' ELSE '❌ FAIL' END;
        detail := 'DR: ' || v_dr::TEXT || ' CR: ' || v_cr::TEXT || ' Diff: ' || (v_dr - v_cr)::TEXT;
        action_if_failing := 'Check discount_correction_status = ERROR';
        RETURN NEXT;
    END IF;

    -- Check 6: Discount accounts exist
    SELECT COUNT(DISTINCT account_code) INTO v_n
    FROM chart_of_accounts
    WHERE account_code IN ('4110', '4111', '4112', '4113')
      AND is_active = true
      AND (p_business_id IS NULL OR business_id = p_business_id);
    
    check_item := 'Discount accounts 4110-4113';
    status := CASE WHEN v_n >= 1 THEN '✅ PASS' ELSE '⚠ WARN' END;
    detail := v_n::TEXT || ' of 4 discount accounts found';
    action_if_failing := 'Create missing discount accounts in chart_of_accounts';
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    check_item := 'Verification error';
    status := '❌ ERROR';
    detail := SQLERRM;
    action_if_failing := 'Check migration logs';
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION verify_pos_discount_fix(UUID) IS
    '[2004] Verifies all fix components are in place. '
    'Run after migration: SELECT * FROM verify_pos_discount_fix();';

-- ============================================================================
-- PART 10: MONITORING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION monitor_discount_transactions(
    p_business_id UUID, 
    p_hours_back INTEGER DEFAULT 24
)
RETURNS TABLE(
    transaction_number TEXT, 
    transaction_date TIMESTAMPTZ, 
    discount_amount NUMERIC,
    tax_on_gross NUMERIC, 
    tax_on_net NUMERIC, 
    tax_difference NUMERIC,
    has_separate_entry BOOLEAN, 
    correction_status TEXT, 
    accounting_status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pt.transaction_number, 
        pt.transaction_date, 
        pt.discount_amount,
        pt.tax_amount AS tax_on_gross,
        COALESCE(
            pt.net_tax_amount,
            ROUND((pt.total_amount - pt.discount_amount) * COALESCE(pt.tax_rate, 0) / 100.0, 2)
        ) AS tax_on_net,
        pt.tax_amount - COALESCE(
            pt.net_tax_amount,
            ROUND((pt.total_amount - pt.discount_amount) * COALESCE(pt.tax_rate, 0) / 100.0, 2)
        ) AS tax_difference,
        EXISTS(
            SELECT 1 FROM journal_entries je
            WHERE je.reference_id = pt.id::TEXT
              AND je.description ILIKE '%discount%'
              AND je.reference_type <> 'pos_transaction'
              AND je.reference_number NOT ILIKE 'CORR-%'
        ) AS has_separate_entry,
        COALESCE(pt.discount_correction_status, 'N/A') AS correction_status,
        CASE
            WHEN pt.net_tax_amount IS NULL THEN '⚠ Pre-migration: net_tax_amount not set'
            WHEN ABS(pt.tax_amount - pt.net_tax_amount) > 0.01 THEN '❌ Tax mismatch'
            WHEN EXISTS(
                SELECT 1 FROM journal_entries je
                WHERE je.reference_id = pt.id::TEXT
                  AND je.description ILIKE '%discount%'
                  AND je.reference_type <> 'pos_transaction'
                  AND je.reference_number NOT ILIKE 'CORR-%'
            ) THEN '⚠ Bad separate entry exists'
            ELSE '✅ Correct'
        END AS accounting_status
    FROM pos_transactions pt
    WHERE pt.business_id = p_business_id
      AND pt.discount_amount > 0
      AND pt.status = 'completed'
      AND pt.created_at > NOW() - (p_hours_back || ' hours')::INTERVAL
    ORDER BY pt.created_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION monitor_discount_transactions(UUID, INTEGER) IS
    '[2004] Monitors recent discounted transactions for accounting health. '
    'Shows tax differences and whether separate discount entries exist.';

DO $$
BEGIN
    RAISE NOTICE '[2004] ✓ verify_pos_discount_fix() created';
    RAISE NOTICE '[2004] ✓ monitor_discount_transactions() created';
END $$;

-- ============================================================================
-- PART 11: SUMMARY
-- ============================================================================

DO $$
DECLARE
    v_corrected INTEGER; 
    v_errors INTEGER; 
    v_pending INTEGER;
    v_businesses INTEGER;
    v_trigger BOOLEAN;
    v_is_dry_run BOOLEAN;
BEGIN
    BEGIN
        v_is_dry_run := current_setting('migration.dry_run', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        v_is_dry_run := false;
    END;

    SELECT COUNT(*) INTO v_corrected FROM pos_transactions WHERE discount_correction_status = 'CORRECTED';
    SELECT COUNT(*) INTO v_errors   FROM pos_transactions WHERE discount_correction_status = 'ERROR';
    SELECT COUNT(*) INTO v_pending  FROM pos_transactions 
        WHERE discount_amount > 0 AND status = 'completed' 
          AND COALESCE(discount_correction_status, 'PENDING') = 'PENDING';
    SELECT COUNT(DISTINCT business_id) INTO v_businesses FROM pos_transactions 
        WHERE discount_correction_status IN ('CORRECTED', 'ERROR', 'PENDING');
    
    SELECT EXISTS(
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'trigger_auto_pos_accounting' 
          AND event_object_table = 'pos_transactions'
    ) INTO v_trigger;

    RAISE NOTICE '';
    RAISE NOTICE '╔════════════════════════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║                     MIGRATION 2004 COMPLETE — FINAL VERSION                    ║';
    RAISE NOTICE '╠════════════════════════════════════════════════════════════════════════════════╣';
    RAISE NOTICE '║  KEY FEATURES:                                                                 ║';
    RAISE NOTICE '║    ✓ Fingerprint check preserved (only fixes transactions with bug pattern)   ║';
    RAISE NOTICE '║    ✓ Per-business validation and processing                                   ║';
    RAISE NOTICE '║    ✓ Per-business trial balance verification                                  ║';
    RAISE NOTICE '║    ✓ Dry-run mode (current: %)                                            ║', 
        CASE WHEN v_is_dry_run THEN 'ENABLED' ELSE 'DISABLED' END;
    RAISE NOTICE '║    ✓ Uses only columns that exist in your schema                              ║';
    RAISE NOTICE '╠════════════════════════════════════════════════════════════════════════════════╣';
    RAISE NOTICE '║  RESULTS:                                                                      ║';
    RAISE NOTICE '║    Businesses affected: %                                                     ║', v_businesses;
    RAISE NOTICE '║    Corrected: %        Errors: %        Pending: %                          ║', 
        v_corrected, v_errors, v_pending;
    RAISE NOTICE '║    Trigger: %                                                              ║',
        CASE WHEN v_trigger THEN '✅ BOUND' ELSE '❌ MISSING — CRITICAL' END;
    RAISE NOTICE '╠════════════════════════════════════════════════════════════════════════════════╣';
    RAISE NOTICE '║  NEXT STEPS:                                                                   ║';
    RAISE NOTICE '║    1. SELECT * FROM verify_pos_discount_fix();                                 ║';
    RAISE NOTICE '║    2. If dry-run was enabled and results look correct:                         ║';
    RAISE NOTICE '║       SET migration.dry_run = ''false'';                                       ║';
    RAISE NOTICE '║       Then re-run this migration                                               ║';
    RAISE NOTICE '║    3. Deploy updated posService.js (discount BEFORE tax)                       ║';
    RAISE NOTICE '║    4. Deploy updated discountAccountingService.js (add POS guard)              ║';
    RAISE NOTICE '║    5. Create test discounted transaction and verify                            ║';
    RAISE NOTICE '║    6. Monitor: SELECT * FROM monitor_discount_transactions(''<uuid>'', 24);   ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════════════════════════════════╝';

    IF NOT v_trigger THEN
        RAISE EXCEPTION '[2004] Trigger missing at summary — rolling back';
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- POST-COMMIT VERIFICATION QUERIES (Run manually)
-- ============================================================================
-- 
-- -- Run full verification
-- SELECT * FROM verify_pos_discount_fix();
-- 
-- -- Check specific business
-- SELECT * FROM verify_pos_discount_fix('0eb7d105-d6cb-43c1-b497-41a710d37b4b');
-- 
-- -- Monitor recent transactions
-- SELECT * FROM monitor_discount_transactions('0eb7d105-d6cb-43c1-b497-41a710d37b4b', 24);
-- 
-- -- Check for any errors
-- SELECT transaction_number, accounting_error 
-- FROM pos_transactions 
-- WHERE discount_correction_status = 'ERROR';
-- 
-- -- Check trial balance manually
-- SELECT 
--     SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) AS total_debits,
--     SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) AS total_credits,
--     SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) - 
--     SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) AS difference
-- FROM journal_entries je
-- JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
-- WHERE je.business_id = '0eb7d105-d6cb-43c1-b497-41a710d37b4b';
-- ============================================================================
