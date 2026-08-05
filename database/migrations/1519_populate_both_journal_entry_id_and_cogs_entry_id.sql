-- Migration 1519: Populate both journal_entry_id and cogs_entry_id
-- symmetrically on inventory_transactions, for both sale and refund paths.
-- Prior state: sale path set only journal_entry_id (header), refund path
-- set only cogs_entry_id (specific COGS line). Neither was wrong, but the
-- asymmetry meant a query relying on either field behaved inconsistently
-- depending on whether the row came from a sale or a refund. No prior
-- correctness impact (nothing currently reads the previously-missing
-- field), purely a completeness/consistency fix ahead of handover.

-- ─── PART 1: Sale side — also link the COGS line ───────────────────────
CREATE OR REPLACE FUNCTION public.create_journal_entry_for_pos_transaction_fixed(p_transaction_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_customer_type      VARCHAR(50);
    v_receiving_id       UUID;
    v_revenue_id         UUID;
    v_tax_id             UUID;
    v_discount_id        UUID;
    v_cogs_id            UUID;
    v_inventory_id       UUID;
    v_product_count      INTEGER := 0;
    v_total_cogs         NUMERIC(15,2) := 0;
    v_acc_code           TEXT;
    v_acc_amount         NUMERIC(15,2);
    v_acc_id             UUID;
    v_breakdown_total    NUMERIC(15,2) := 0;
    v_journal_id         UUID;
    v_ref_number         TEXT;
    v_description        TEXT;
    v_error_message      TEXT;
    v_cogs_line_id        UUID;  -- NEW (1519)
BEGIN
    SELECT
        business_id, total_amount, COALESCE(discount_amount, 0),
        CASE
            WHEN COALESCE(discount_amount, 0) > 0 AND COALESCE(net_tax_amount, 0) = 0
            THEN ROUND((total_amount - COALESCE(discount_amount, 0)) * COALESCE(tax_rate, 0) / 100.0, 2)
            ELSE COALESCE(net_tax_amount, tax_amount, 0)
        END,
        final_amount, payment_method, transaction_number, created_by,
        discount_account_code, discount_breakdown_by_account,
        COALESCE(customer_type_at_sale, 'individual')
    INTO
        v_business_id, v_gross_subtotal, v_discount_amount,
        v_net_tax, v_cash_amount, v_payment_method,
        v_transaction_number, v_created_by,
        v_discount_acc_code, v_discount_breakdown, v_customer_type
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
        RAISE EXCEPTION '[JE] Amount inconsistency on %: final=% but (gross-discount+tax)=%',
            v_transaction_number, v_cash_amount, (v_gross_subtotal - v_discount_amount + v_net_tax);
    END IF;

    SELECT
        COUNT(*) FILTER (WHERE item_type IN ('product','inventory')),
        COALESCE(SUM(
            CASE WHEN item_type IN ('product','inventory')
                 THEN pti.quantity * COALESCE(ii.cost_price, 0)
                 ELSE 0 END
        ), 0)
    INTO v_product_count, v_total_cogs
    FROM pos_transaction_items pti
    LEFT JOIN inventory_items ii ON ii.id = pti.inventory_item_id
    WHERE pti.pos_transaction_id = p_transaction_id;

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

    SELECT id INTO v_revenue_id FROM chart_of_accounts
    WHERE business_id = v_business_id AND account_code = '4100'
      AND is_active = true LIMIT 1;

    IF v_customer_type = 'company' THEN
        SELECT id INTO v_tax_id FROM chart_of_accounts
        WHERE business_id = v_business_id
          AND account_code IN ('2130','2120') AND is_active = true
        ORDER BY CASE account_code WHEN '2130' THEN 1 ELSE 2 END
        LIMIT 1;
    ELSE
        SELECT id INTO v_tax_id FROM chart_of_accounts
        WHERE business_id = v_business_id
          AND account_code IN ('2120','2130') AND is_active = true
        ORDER BY CASE account_code WHEN '2120' THEN 1 ELSE 2 END
        LIMIT 1;
    END IF;

    IF v_tax_id IS NULL AND v_net_tax > 0 THEN
        RAISE WARNING '[JE] No tax account (2120/2130) found for business % — tax line skipped for %',
            v_business_id, v_transaction_number;
    END IF;

    SELECT id INTO v_cogs_id FROM chart_of_accounts
    WHERE business_id = v_business_id AND account_code = '5100'
      AND is_active = true LIMIT 1;
    SELECT id INTO v_inventory_id FROM chart_of_accounts
    WHERE business_id = v_business_id AND account_code = '1300'
      AND is_active = true LIMIT 1;

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

    INSERT INTO journal_entry_lines (
        business_id, journal_entry_id, account_id,
        line_type, amount, description, created_at
    ) VALUES (
        v_business_id, v_journal_id, v_receiving_id,
        'debit', v_cash_amount,
        'Payment received: ' || v_transaction_number || ' via ' || v_payment_method,
        NOW()
    );

    INSERT INTO journal_entry_lines (
        business_id, journal_entry_id, account_id,
        line_type, amount, description, created_at
    ) VALUES (
        v_business_id, v_journal_id, v_revenue_id,
        'credit', v_gross_subtotal,
        'Sales revenue (gross catalogue price): ' || v_transaction_number,
        NOW()
    );

    IF v_net_tax > 0 AND v_tax_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
            business_id, journal_entry_id, account_id,
            line_type, amount, description, created_at
        ) VALUES (
            v_business_id, v_journal_id, v_tax_id,
            'credit', v_net_tax,
            'Tax payable (' ||
                CASE v_customer_type WHEN 'company' THEN 'WHT 2130' ELSE 'VAT 2120' END
            || '): ' || v_transaction_number,
            NOW()
        );
    END IF;

    IF v_discount_amount > 0 THEN
        IF v_discount_breakdown IS NOT NULL
           AND jsonb_typeof(v_discount_breakdown) = 'object'
        THEN
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
    -- FIX (1519): capture the COGS line id via RETURNING, then use it to
    -- backfill inventory_transactions.cogs_entry_id below, matching the
    -- pattern already used on the refund side (process_refund_accounting
    -- Step 4b / migrations 1508–1509).
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
        ) RETURNING id INTO v_cogs_line_id;

        INSERT INTO journal_entry_lines (
            business_id, journal_entry_id, account_id,
            line_type, amount, description, created_at
        ) VALUES (
            v_business_id, v_journal_id, v_inventory_id,
            'credit', v_total_cogs,
            'Inventory reduction: ' || v_transaction_number, NOW()
        );

        UPDATE inventory_transactions
        SET journal_entry_id = v_journal_id,
            cogs_entry_id    = v_cogs_line_id,
            updated_at       = NOW()
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
$function$;

-- ─── PART 2: Refund side — also link the journal_entry_id header ───────
CREATE OR REPLACE FUNCTION public.process_refund_accounting()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_je_result RECORD;
    v_inv_result RECORD;
    v_disc_result RECORD;
    v_tax_result RECORD;
    v_updated_status TEXT;
    v_refund_items_count INTEGER;
    v_period_check RECORD;
    v_cogs_line_id UUID;
BEGIN
    IF NEW.status = 'APPROVED' AND (TG_OP = 'INSERT' OR OLD.status != 'APPROVED') THEN

        SELECT * INTO v_period_check
        FROM check_period_open_for_refund(NEW.original_transaction_id, NEW.original_transaction_type);

        IF NOT v_period_check.is_open THEN
            RAISE EXCEPTION 'Cannot process refund: Accounting period % is closed (closed on %)',
                v_period_check.period_name, v_period_check.closed_date;
        END IF;

        RAISE NOTICE '🔄 Processing refund accounting for: %', NEW.refund_number;

        SELECT COUNT(*) INTO v_refund_items_count FROM refund_items WHERE refund_id = NEW.id;

        IF v_refund_items_count > 0 THEN
            SELECT * INTO v_inv_result FROM reverse_inventory_on_refund(NEW.id, NEW.approved_by);
            IF NOT v_inv_result.success THEN
                RAISE EXCEPTION 'Refund inventory reversal failed for %: %',
                    NEW.refund_number, v_inv_result.message;
            END IF;
            RAISE NOTICE '📦 Processed inventory reversal for % items', v_inv_result.items_processed;
        END IF;

        IF NEW.discount_refunded > 0 THEN
            SELECT * INTO v_disc_result FROM reverse_discounts_on_refund(NEW.id, NEW.approved_by);
            IF NOT v_disc_result.success THEN
                RAISE EXCEPTION 'Refund discount reversal failed for %: %',
                    NEW.refund_number, v_disc_result.message;
            END IF;
            RAISE NOTICE '💰 Processed discount reversal: %', NEW.discount_refunded;
        END IF;

        IF NEW.tax_refunded > 0 THEN
            SELECT * INTO v_tax_result FROM reverse_tax_on_refund(NEW.id, NEW.approved_by);
            IF NOT v_tax_result.success THEN
                RAISE EXCEPTION 'Refund tax reversal failed for %: %',
                    NEW.refund_number, v_tax_result.message;
            END IF;
            RAISE NOTICE '🏛️ Processed tax reversal: %', NEW.tax_refunded;
        END IF;

        SELECT * INTO v_je_result FROM create_refund_journal_entry(NEW.id, NEW.approved_by);
        IF NOT v_je_result.success THEN
            RAISE EXCEPTION 'Refund accounting failed for %: %', NEW.refund_number, v_je_result.message;
        END IF;
        RAISE NOTICE '✅ Journal entry created: %', v_je_result.journal_entry_id;

        -- FIX (1519): now sets journal_entry_id in the SAME update as
        -- cogs_entry_id, closing the symmetry gap with the sale-side path.
        -- journal_entry_id is set unconditionally (whenever items exist),
        -- cogs_entry_id only when a matching COGS line is found (i.e. when
        -- the refund actually involved a product with COGS to reverse).
        IF v_refund_items_count > 0 THEN
            SELECT jel.id INTO v_cogs_line_id
            FROM journal_entry_lines jel
            JOIN chart_of_accounts ca ON ca.id = jel.account_id
            WHERE jel.journal_entry_id = v_je_result.journal_entry_id
              AND ca.business_id = NEW.business_id
              AND ca.account_code = '5100'
              AND jel.line_type = 'credit'
            LIMIT 1;

            UPDATE inventory_transactions
            SET journal_entry_id = v_je_result.journal_entry_id,
                cogs_entry_id    = COALESCE(v_cogs_line_id, cogs_entry_id)
            WHERE reference_type = 'refund'
              AND reference_id = NEW.id
              AND business_id = NEW.business_id
              AND journal_entry_id IS NULL;
        END IF;

        IF NEW.original_transaction_type = 'POS' THEN
            UPDATE pos_transactions
            SET refunded_amount = COALESCE(refunded_amount, 0) + NEW.total_refunded,
                refund_status = CASE
                    WHEN COALESCE(refunded_amount, 0) + NEW.total_refunded >= total_amount THEN 'FULL'
                    ELSE 'PARTIAL'
                END,
                updated_at = NOW()
            WHERE id = NEW.original_transaction_id
            RETURNING refund_status INTO v_updated_status;

            UPDATE pos_transaction_items
            SET already_refunded_qty = COALESCE(already_refunded_qty, 0) + ri.quantity_refunded,
                already_refunded_amount = COALESCE(already_refunded_amount, 0) + ri.total_refunded
            FROM refund_items ri
            WHERE ri.refund_id = NEW.id
            AND pos_transaction_items.id = ri.original_line_item_id;

        ELSIF NEW.original_transaction_type = 'INVOICE' THEN
            UPDATE invoices
            SET refunded_amount = COALESCE(refunded_amount, 0) + NEW.total_refunded,
                refund_status = CASE
                    WHEN COALESCE(refunded_amount, 0) + NEW.total_refunded >= total_amount THEN 'FULL'
                    ELSE 'PARTIAL'
                END,
                updated_at = NOW()
            WHERE id = NEW.original_transaction_id
            RETURNING refund_status INTO v_updated_status;

            UPDATE invoice_line_items
            SET already_refunded_qty = COALESCE(already_refunded_qty, 0) + ri.quantity_refunded,
                already_refunded_amount = COALESCE(already_refunded_amount, 0) + ri.total_refunded
            FROM refund_items ri
            WHERE ri.refund_id = NEW.id
            AND invoice_line_items.id = ri.original_line_item_id;
        END IF;

        INSERT INTO audit_logs (
            business_id, user_id, action, resource_type, resource_id,
            old_values, new_values, metadata, created_at
        ) VALUES (
            NEW.business_id, NEW.approved_by, 'refund.processed.complete', 'refund', NEW.id,
            jsonb_build_object('old_status', OLD.status),
            jsonb_build_object('new_status', NEW.status,
                                'journal_entry_id', v_je_result.journal_entry_id,
                                'refund_amount', NEW.total_refunded),
            jsonb_build_object('trigger', 'process_refund_accounting',
                                'items_processed', v_refund_items_count,
                                'discount_reversed', NEW.discount_refunded > 0,
                                'tax_reversed', NEW.tax_refunded > 0),
            NOW()
        );

        RAISE NOTICE '✅ Refund processing complete for: %', NEW.refund_number;
    END IF;

    RETURN NEW;
END;
$function$;
