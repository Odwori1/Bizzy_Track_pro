BEGIN;

-- ============================================================================
-- STEP 1: Replace the callable (UUID, UUID) → UUID version with the fixed logic
-- ============================================================================

CREATE OR REPLACE FUNCTION create_journal_entry_for_pos_transaction_fixed(
    p_transaction_id UUID,
    p_user_id        UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_business_id        UUID;
    v_gross_subtotal     NUMERIC(15,2);
    v_discount_amount    NUMERIC(15,2);
    v_net_tax            NUMERIC(15,2);
    v_cash_amount        NUMERIC(15,2);
    v_payment_method     VARCHAR(50);
    v_transaction_number VARCHAR(100);
    v_created_by         UUID;
    v_discount_acc_code  TEXT;
    v_discount_breakdown JSONB;
    v_receiving_id       UUID;
    v_revenue_id         UUID;
    v_tax_id             UUID;
    v_discount_id        UUID;
    v_cogs_id            UUID;
    v_inventory_id       UUID;
    v_total_cogs         NUMERIC(15,2) := 0;
    v_acc_code           TEXT;
    v_acc_amount         NUMERIC(15,2);
    v_acc_id             UUID;
    v_breakdown_total    NUMERIC(15,2) := 0;
    v_journal_id         UUID;
    v_ref_number         TEXT;
    v_description        TEXT;
    v_error_message      TEXT;
BEGIN
    -- Read transaction — use net_tax_amount when set, recompute from tax_rate
    -- when a discounted transaction was created before the posService.js fix.
    SELECT
        business_id,
        total_amount,
        COALESCE(discount_amount, 0),
        CASE
            WHEN COALESCE(discount_amount, 0) > 0
             AND COALESCE(net_tax_amount, 0) = 0
            THEN ROUND(
                     (total_amount - COALESCE(discount_amount, 0))
                     * COALESCE(tax_rate, 0) / 100.0,
                 2)
            ELSE COALESCE(net_tax_amount, tax_amount, 0)
        END,
        final_amount,
        payment_method,
        transaction_number,
        created_by,
        discount_account_code,
        discount_breakdown_by_account
    INTO
        v_business_id, v_gross_subtotal, v_discount_amount,
        v_net_tax, v_cash_amount, v_payment_method,
        v_transaction_number, v_created_by,
        v_discount_acc_code, v_discount_breakdown
    FROM pos_transactions
    WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '[JE] Transaction not found: %', p_transaction_id;
    END IF;

    IF v_gross_subtotal <= 0 THEN
        RAISE EXCEPTION '[JE] total_amount must be > 0 for %', v_transaction_number;
    END IF;
    IF v_cash_amount <= 0 THEN
        RAISE EXCEPTION '[JE] final_amount must be > 0 for %', v_transaction_number;
    END IF;
    IF ABS(v_cash_amount - (v_gross_subtotal - v_discount_amount + v_net_tax)) > 1 THEN
        RAISE EXCEPTION
            '[JE] Amount inconsistency on %: final=% but (gross-discount+tax)=%',
            v_transaction_number,
            v_cash_amount,
            (v_gross_subtotal - v_discount_amount + v_net_tax);
    END IF;

    -- COGS
    SELECT
        COUNT(*) FILTER (WHERE item_type IN ('product','inventory')),
        COALESCE(SUM(
            CASE WHEN item_type IN ('product','inventory')
                 THEN pti.quantity * COALESCE(ii.cost_price, 0)
                 ELSE 0 END
        ), 0)
    INTO v_total_cogs, v_total_cogs
    FROM pos_transaction_items pti
    LEFT JOIN inventory_items ii ON ii.id = pti.inventory_item_id
    WHERE pti.pos_transaction_id = p_transaction_id;

    -- Receiving account
    SELECT id INTO v_receiving_id FROM chart_of_accounts
    WHERE business_id  = v_business_id
      AND account_code = CASE v_payment_method
                            WHEN 'cash'         THEN '1110'
                            WHEN 'card'         THEN '1120'
                            WHEN 'mobile_money' THEN '1130'
                            ELSE '1110' END
      AND is_active = true LIMIT 1;
    IF v_receiving_id IS NULL THEN
        SELECT id INTO v_receiving_id FROM chart_of_accounts
        WHERE business_id = v_business_id AND account_code = '1110'
          AND is_active = true LIMIT 1;
    END IF;

    -- Revenue (4100)
    SELECT id INTO v_revenue_id FROM chart_of_accounts
    WHERE business_id = v_business_id AND account_code = '4100'
      AND is_active = true LIMIT 1;

    -- Tax payable — prefer WHT (2130), fall back to VAT (2120)
    SELECT id INTO v_tax_id FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code IN ('2130','2120') AND is_active = true
    ORDER BY CASE account_code WHEN '2130' THEN 1 ELSE 2 END LIMIT 1;

    -- COGS (5100) and Inventory (1300)
    SELECT id INTO v_cogs_id FROM chart_of_accounts
    WHERE business_id = v_business_id AND account_code = '5100'
      AND is_active = true LIMIT 1;
    SELECT id INTO v_inventory_id FROM chart_of_accounts
    WHERE business_id = v_business_id AND account_code = '1300'
      AND is_active = true LIMIT 1;

    -- Discount account
    IF v_discount_amount > 0 THEN
        IF v_discount_acc_code IS NOT NULL THEN
            SELECT id INTO v_discount_id FROM chart_of_accounts
            WHERE business_id = v_business_id
              AND account_code = v_discount_acc_code AND is_active = true LIMIT 1;
        END IF;
        IF v_discount_id IS NULL THEN
            SELECT id INTO v_discount_id FROM chart_of_accounts
            WHERE business_id = v_business_id
              AND account_code IN ('4113','4112','4111','4110') AND is_active = true
            ORDER BY account_code DESC LIMIT 1;
        END IF;
        IF v_discount_id IS NULL AND v_discount_breakdown IS NULL THEN
            RAISE EXCEPTION '[JE] No discount account found for business % (tried %)',
                v_business_id, v_discount_acc_code;
        END IF;
    END IF;

    IF v_receiving_id IS NULL THEN
        RAISE EXCEPTION '[JE] Receiving account missing for business % method %',
            v_business_id, v_payment_method;
    END IF;
    IF v_revenue_id IS NULL THEN
        RAISE EXCEPTION '[JE] Revenue account 4100 missing for business %', v_business_id;
    END IF;

    v_ref_number  := 'JE-' || v_transaction_number;
    v_description := 'POS Sale: ' || v_transaction_number || ' | ' || v_payment_method;
    IF v_discount_amount > 0 THEN
        v_description := v_description
            || ' | Discount: ' || v_discount_amount::TEXT
            || ' (' || COALESCE(v_discount_acc_code, 'multi') || ')';
    END IF;

    -- Create the single journal entry
    INSERT INTO journal_entries (
        business_id, journal_date, reference_number,
        reference_type, reference_id, description,
        total_amount, status, created_by,
        posted_at, created_at, updated_at
    ) VALUES (
        v_business_id, CURRENT_DATE, v_ref_number,
        'pos_transaction', p_transaction_id::TEXT, v_description,
        v_cash_amount + COALESCE(v_total_cogs, 0),
        'posted', COALESCE(p_user_id, v_created_by),
        NOW(), NOW(), NOW()
    ) RETURNING id INTO v_journal_id;

    -- LINE 1: Cash DR
    INSERT INTO journal_entry_lines (
        business_id, journal_entry_id, account_id,
        line_type, amount, description, created_at
    ) VALUES (
        v_business_id, v_journal_id, v_receiving_id,
        'debit', v_cash_amount,
        'Payment received: ' || v_transaction_number || ' via ' || v_payment_method,
        NOW()
    );

    -- LINE 2: Revenue CR at GROSS
    INSERT INTO journal_entry_lines (
        business_id, journal_entry_id, account_id,
        line_type, amount, description, created_at
    ) VALUES (
        v_business_id, v_journal_id, v_revenue_id,
        'credit', v_gross_subtotal,
        'Sales revenue (gross catalogue price): ' || v_transaction_number,
        NOW()
    );

    -- LINE 3: Tax CR on NET amount
    IF v_net_tax > 0 AND v_tax_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
            business_id, journal_entry_id, account_id,
            line_type, amount, description, created_at
        ) VALUES (
            v_business_id, v_journal_id, v_tax_id,
            'credit', v_net_tax,
            'Tax payable on net (post-discount) amount: ' || v_transaction_number,
            NOW()
        );
    END IF;

    -- LINE 4: Discount DR contra-revenue (only when discount exists)
    IF v_discount_amount > 0 THEN
        IF v_discount_breakdown IS NOT NULL
           AND jsonb_typeof(v_discount_breakdown) = 'object'
        THEN
            -- Stacked discounts: one debit line per account code
            FOR v_acc_code, v_acc_amount IN
                SELECT key, value::NUMERIC(15,2)
                FROM jsonb_each_text(v_discount_breakdown)
            LOOP
                CONTINUE WHEN COALESCE(v_acc_amount, 0) <= 0;
                SELECT id INTO v_acc_id FROM chart_of_accounts
                WHERE business_id = v_business_id
                  AND account_code = v_acc_code AND is_active = true LIMIT 1;
                IF v_acc_id IS NULL THEN
                    SELECT id INTO v_acc_id FROM chart_of_accounts
                    WHERE business_id = v_business_id AND account_code = '4110'
                      AND is_active = true LIMIT 1;
                END IF;
                IF v_acc_id IS NOT NULL THEN
                    INSERT INTO journal_entry_lines (
                        business_id, journal_entry_id, account_id,
                        line_type, amount, description, created_at
                    ) VALUES (
                        v_business_id, v_journal_id, v_acc_id,
                        'debit', v_acc_amount,
                        'Discount (' || v_acc_code || '): ' || v_transaction_number,
                        NOW()
                    );
                    v_breakdown_total := v_breakdown_total + v_acc_amount;
                END IF;
            END LOOP;
            -- Rounding guard
            IF ABS(v_breakdown_total - v_discount_amount) > 0.005
               AND v_discount_id IS NOT NULL
            THEN
                INSERT INTO journal_entry_lines (
                    business_id, journal_entry_id, account_id,
                    line_type, amount, description, created_at
                ) VALUES (
                    v_business_id, v_journal_id, v_discount_id,
                    'debit', v_discount_amount - v_breakdown_total,
                    'Discount rounding adjustment: ' || v_transaction_number,
                    NOW()
                );
            END IF;
        ELSE
            -- Single discount type
            INSERT INTO journal_entry_lines (
                business_id, journal_entry_id, account_id,
                line_type, amount, description, created_at
            ) VALUES (
                v_business_id, v_journal_id, v_discount_id,
                'debit', v_discount_amount,
                'Discount (' || COALESCE(v_discount_acc_code, '4110') || '): '
                    || v_transaction_number,
                NOW()
            );
        END IF;
    END IF;

    -- LINES 5+6: COGS DR + Inventory CR
    IF v_total_cogs > 0
       AND v_cogs_id IS NOT NULL
       AND v_inventory_id IS NOT NULL
    THEN
        INSERT INTO journal_entry_lines (
            business_id, journal_entry_id, account_id,
            line_type, amount, description, created_at
        ) VALUES (
            v_business_id, v_journal_id, v_cogs_id,
            'debit', v_total_cogs,
            'Cost of goods sold: ' || v_transaction_number, NOW()
        );
        INSERT INTO journal_entry_lines (
            business_id, journal_entry_id, account_id,
            line_type, amount, description, created_at
        ) VALUES (
            v_business_id, v_journal_id, v_inventory_id,
            'credit', v_total_cogs,
            'Inventory reduction: ' || v_transaction_number, NOW()
        );
        UPDATE inventory_transactions
        SET journal_entry_id = v_journal_id, updated_at = NOW()
        WHERE reference_id   = p_transaction_id
          AND reference_type = 'pos_transaction'
          AND journal_entry_id IS NULL;
    END IF;

    RETURN v_journal_id;

EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    RAISE WARNING '[JE] Failed for %: %', p_transaction_id, v_error_message;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 2: Drop the RETURNS TRIGGER version (OID 1017037) — it is unused.
--         process_pos_sale_on_update calls the parameterised version above.
--         The trigger_auto_pos_accounting binding also goes with it.
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_pos_accounting ON pos_transactions;
DROP FUNCTION IF EXISTS create_journal_entry_for_pos_transaction_fixed();

-- ============================================================================
-- STEP 3: Verify the final state
-- ============================================================================

DO $$
DECLARE
    v_fn_count      INTEGER;
    v_trigger_count INTEGER;
BEGIN
    -- Exactly one version of the function must remain
    SELECT COUNT(*) INTO v_fn_count
    FROM pg_proc
    WHERE proname = 'create_journal_entry_for_pos_transaction_fixed';

    IF v_fn_count <> 1 THEN
        RAISE EXCEPTION
            'Expected 1 function version, found %. Check pg_proc.', v_fn_count;
    END IF;

    -- That version must be the parameterised one
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'create_journal_entry_for_pos_transaction_fixed'
          AND pg_get_function_arguments(oid) LIKE 'p_transaction_id uuid%'
          AND prorettype = (SELECT oid FROM pg_type WHERE typname = 'uuid')
    ) THEN
        RAISE EXCEPTION
            'Parameterised (UUID, UUID) → UUID version not found after cleanup.';
    END IF;

    -- Exactly one accounting trigger must remain on pos_transactions
    SELECT COUNT(*) INTO v_trigger_count
    FROM pg_trigger
    WHERE tgrelid = 'pos_transactions'::regclass
      AND tgname IN (
          'trigger_auto_pos_accounting',
          'trigger_auto_pos_accounting_update'
      );

    IF v_trigger_count <> 1 THEN
        RAISE EXCEPTION
            'Expected 1 accounting trigger, found %.', v_trigger_count;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'pos_transactions'::regclass
          AND tgname = 'trigger_auto_pos_accounting_update'
    ) THEN
        RAISE EXCEPTION
            'trigger_auto_pos_accounting_update is missing — wrong trigger survived.';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '✓ Function: create_journal_entry_for_pos_transaction_fixed(UUID, UUID) → UUID';
    RAISE NOTICE '✓ Trigger : trigger_auto_pos_accounting_update → process_pos_sale_on_update';
    RAISE NOTICE '✓ Removed : trigger_auto_pos_accounting (was calling wrong signature)';
    RAISE NOTICE '✓ Removed : create_journal_entry_for_pos_transaction_fixed() RETURNS TRIGGER';
    RAISE NOTICE '';
    RAISE NOTICE 'Flow after this fix:';
    RAISE NOTICE '  pos_transactions UPDATE (pending → completed)';
    RAISE NOTICE '  → trigger_auto_pos_accounting_update';
    RAISE NOTICE '  → process_pos_sale_on_update() [guards: items exist, no duplicate]';
    RAISE NOTICE '  → create_journal_entry_for_pos_transaction_fixed(UUID, UUID)';
    RAISE NOTICE '  → Cash DR | Revenue CR (gross) | Tax CR (net) | Discount DR | COGS DR | Inv CR';
END $$;

COMMIT;
