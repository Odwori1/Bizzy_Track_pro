CREATE OR REPLACE FUNCTION public.create_refund_journal_entry(p_refund_id uuid, p_user_id uuid)
RETURNS TABLE(success boolean, message text, journal_entry_id uuid)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_business_id UUID; v_refund_number VARCHAR(50); v_total_refunded NUMERIC(15,2);
    v_subtotal_refunded NUMERIC(15,2); v_discount_refunded NUMERIC(15,2);
    v_tax_refunded NUMERIC(15,2); v_restock_fee NUMERIC(15,2);
    v_original_transaction_id UUID; v_original_transaction_type VARCHAR(20);
    v_refund_method VARCHAR(20); v_journal_entry_id UUID;
    v_reference_number VARCHAR(50); v_line_count INTEGER := 0;
    v_cash_account_id UUID; v_sales_returns_account_id UUID;
    v_discount_account_id UUID; v_tax_account_id UUID;
    v_cogs_account_id UUID; v_inventory_account_id UUID;
    v_restock_fee_account_id UUID; v_credit_note_account_id UUID;
    v_has_products BOOLEAN := FALSE; v_total_cogs NUMERIC(15,2) := 0;
    v_discount_account_code VARCHAR(10); v_error_message TEXT;
BEGIN
    SELECT r.business_id, r.refund_number, r.total_refunded, r.subtotal_refunded,
           r.discount_refunded, r.tax_refunded, r.restock_fee, r.original_transaction_id,
           r.original_transaction_type, r.refund_method
    INTO v_business_id, v_refund_number, v_total_refunded, v_subtotal_refunded,
         v_discount_refunded, v_tax_refunded, v_restock_fee, v_original_transaction_id,
         v_original_transaction_type, v_refund_method
    FROM refunds r WHERE r.id = p_refund_id;

    IF NOT FOUND THEN
        success := FALSE; message := 'Refund not found'; journal_entry_id := NULL;
        RETURN NEXT; RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM refunds r2 WHERE r2.id = p_refund_id AND r2.journal_entry_id IS NOT NULL) THEN
        success := FALSE; message := 'Refund already has journal entry'; journal_entry_id := NULL;
        RETURN NEXT; RETURN;
    END IF;

    IF v_original_transaction_type = 'POS' THEN
        SELECT pt.discount_account_code INTO v_discount_account_code
        FROM pos_transactions pt WHERE pt.id = v_original_transaction_id;
    ELSIF v_original_transaction_type = 'INVOICE' THEN
        SELECT ca.account_code INTO v_discount_account_code
        FROM discount_allocations da
        JOIN chart_of_accounts ca ON da.discount_account_code = ca.account_code
        WHERE da.invoice_id = v_original_transaction_id AND da.status = 'APPLIED' LIMIT 1;
    END IF;
    IF v_discount_account_code IS NULL THEN v_discount_account_code := '4110'; END IF;

    IF v_refund_method = 'CREDIT_NOTE' THEN
        SELECT coa.id INTO v_credit_note_account_id FROM chart_of_accounts coa
        WHERE coa.business_id = v_business_id AND coa.account_code = '1200' AND coa.is_active = true LIMIT 1;
        IF v_credit_note_account_id IS NULL THEN
            SELECT coa.id INTO v_credit_note_account_id FROM chart_of_accounts coa
            WHERE coa.business_id = v_business_id AND coa.account_code = '2150' AND coa.is_active = true LIMIT 1;
        END IF;
        v_cash_account_id := v_credit_note_account_id;
    ELSE
        SELECT coa.id INTO v_cash_account_id FROM chart_of_accounts coa
        WHERE coa.business_id = v_business_id
          AND coa.account_code = CASE v_refund_method
              WHEN 'CASH' THEN '1110' WHEN 'CARD' THEN '1120'
              WHEN 'MOBILE_MONEY' THEN '1130' WHEN 'BANK_TRANSFER' THEN '1120' ELSE '1120' END
          AND coa.is_active = true LIMIT 1;
    END IF;

    IF v_cash_account_id IS NULL THEN
        success := FALSE; message := 'Cash/Bank/AR account not found'; journal_entry_id := NULL;
        RETURN NEXT; RETURN;
    END IF;

    SELECT coa.id INTO v_sales_returns_account_id FROM chart_of_accounts coa
    WHERE coa.business_id = v_business_id AND coa.account_code = '4150' AND coa.is_active = true;
    IF v_sales_returns_account_id IS NULL THEN
        PERFORM setup_business_refund_accounts(v_business_id, p_user_id);
        SELECT coa.id INTO v_sales_returns_account_id FROM chart_of_accounts coa
        WHERE coa.business_id = v_business_id AND coa.account_code = '4150' AND coa.is_active = true;
        IF v_sales_returns_account_id IS NULL THEN
            success := FALSE; message := 'Sales Returns account not found'; journal_entry_id := NULL;
            RETURN NEXT; RETURN;
        END IF;
    END IF;

    IF v_discount_refunded > 0 THEN
        SELECT coa.id INTO v_discount_account_id FROM chart_of_accounts coa
        WHERE coa.business_id = v_business_id AND coa.account_code = v_discount_account_code AND coa.is_active = true;
        IF v_discount_account_id IS NULL THEN
            SELECT coa.id INTO v_discount_account_id FROM chart_of_accounts coa
            WHERE coa.business_id = v_business_id AND coa.account_code = '4110' AND coa.is_active = true;
        END IF;
    END IF;

    IF v_tax_refunded > 0 THEN
        SELECT coa.id INTO v_tax_account_id FROM chart_of_accounts coa
        WHERE coa.business_id = v_business_id AND coa.account_code = '2120' AND coa.is_active = true;
    END IF;

    SELECT EXISTS (SELECT 1 FROM refund_items ri WHERE ri.refund_id = p_refund_id AND ri.product_id IS NOT NULL) INTO v_has_products;

    IF v_has_products THEN
        SELECT coa.id INTO v_cogs_account_id FROM chart_of_accounts coa
        WHERE coa.business_id = v_business_id AND coa.account_code = '5100' AND coa.is_active = true;
        SELECT coa.id INTO v_inventory_account_id FROM chart_of_accounts coa
        WHERE coa.business_id = v_business_id AND coa.account_code = '1300' AND coa.is_active = true;
        SELECT COALESCE(SUM(it.total_cost), 0) INTO v_total_cogs FROM inventory_transactions it
        WHERE it.reference_type = 'refund' AND it.reference_id = p_refund_id;
    END IF;

    IF v_restock_fee > 0 THEN
        SELECT coa.id INTO v_restock_fee_account_id FROM chart_of_accounts coa
        WHERE coa.business_id = v_business_id AND coa.account_code = '4160' AND coa.is_active = true;
    END IF;

    v_reference_number := 'REF-' || v_refund_number;

    INSERT INTO journal_entries (business_id, journal_date, reference_number, reference_type,
        reference_id, description, total_amount, status, created_by, posted_at)
    VALUES (v_business_id, CURRENT_DATE, v_reference_number, 'REFUND', p_refund_id::TEXT,
        'Refund: ' || v_refund_number || ' for ' || v_original_transaction_type || ' transaction',
        v_total_refunded, 'posted', p_user_id, NOW())
    RETURNING journal_entries.id INTO v_journal_entry_id;

    -- LINE 1: Debit Sales Returns
    INSERT INTO journal_entry_lines (business_id, journal_entry_id, account_id, line_type, amount, description)
    VALUES (v_business_id, v_journal_entry_id, v_sales_returns_account_id, 'debit', v_subtotal_refunded, 'Refunded sales amount');
    v_line_count := v_line_count + 1;

    -- LINE 2: CREDIT Discounts (FIXED: 'debit' -> 'credit')
    IF v_discount_refunded > 0 AND v_discount_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (business_id, journal_entry_id, account_id, line_type, amount, description)
        VALUES (v_business_id, v_journal_entry_id, v_discount_account_id, 'credit', v_discount_refunded,
            'Reverse discount amount (' || v_discount_account_code || ')');
        v_line_count := v_line_count + 1;
    END IF;

    -- LINE 3: Debit Tax
    IF v_tax_refunded > 0 AND v_tax_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (business_id, journal_entry_id, account_id, line_type, amount, description)
        VALUES (v_business_id, v_journal_entry_id, v_tax_account_id, 'debit', v_tax_refunded, 'Reverse tax payable');
        v_line_count := v_line_count + 1;
    END IF;

    -- LINE 4: Credit COGS
    IF v_has_products AND v_cogs_account_id IS NOT NULL AND v_total_cogs > 0 THEN
        INSERT INTO journal_entry_lines (business_id, journal_entry_id, account_id, line_type, amount, description)
        VALUES (v_business_id, v_journal_entry_id, v_cogs_account_id, 'credit', v_total_cogs, 'Reverse COGS for returned products');
        v_line_count := v_line_count + 1;
    END IF;

    -- LINE 5: Debit Inventory
    IF v_has_products AND v_inventory_account_id IS NOT NULL AND v_total_cogs > 0 THEN
        INSERT INTO journal_entry_lines (business_id, journal_entry_id, account_id, line_type, amount, description)
        VALUES (v_business_id, v_journal_entry_id, v_inventory_account_id, 'debit', v_total_cogs, 'Restore inventory for returned products');
        v_line_count := v_line_count + 1;
    END IF;

    -- LINE 6: Credit Restock Fee
    IF v_restock_fee > 0 AND v_restock_fee_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (business_id, journal_entry_id, account_id, line_type, amount, description)
        VALUES (v_business_id, v_journal_entry_id, v_restock_fee_account_id, 'credit', v_restock_fee, 'Restock fee revenue');
        v_line_count := v_line_count + 1;
    END IF;

    -- FINAL LINE: Credit Cash/Bank/AR
    DECLARE v_net_credit NUMERIC(15,2) := v_total_refunded;
    BEGIN
        IF v_restock_fee > 0 THEN v_net_credit := v_total_refunded - v_restock_fee; END IF;
        INSERT INTO journal_entry_lines (business_id, journal_entry_id, account_id, line_type, amount, description)
        VALUES (v_business_id, v_journal_entry_id, v_cash_account_id, 'credit', v_net_credit,
            CASE WHEN v_refund_method = 'CREDIT_NOTE' THEN 'Credit note issued to customer' ELSE 'Refund payment to customer' END);
        v_line_count := v_line_count + 1;
    END;

    UPDATE refunds r SET journal_entry_id = v_journal_entry_id, completed_at = NOW(), status = 'COMPLETED'
    WHERE r.id = p_refund_id;

    INSERT INTO audit_logs (business_id, user_id, action, resource_type, resource_id, new_values, metadata, created_at)
    VALUES (v_business_id, p_user_id, 'accounting.refund.journal_entry.created', 'refund', p_refund_id,
        jsonb_build_object('refund_number', v_refund_number, 'journal_entry_id', v_journal_entry_id,
            'total_refunded', v_total_refunded, 'cogs_reversed', v_total_cogs, 'discount_account_used', v_discount_account_code),
        jsonb_build_object('function', 'create_refund_journal_entry', 'line_count', v_line_count,
            'has_products', v_has_products, 'restock_fee', v_restock_fee), NOW());

    success := TRUE;
    message := 'Journal entry created with ' || v_line_count || ' lines';
    journal_entry_id := v_journal_entry_id;
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    INSERT INTO audit_logs (business_id, user_id, action, resource_type, resource_id, new_values, metadata, created_at)
    VALUES (COALESCE(v_business_id, '00000000-0000-0000-0000-000000000000'::UUID), p_user_id,
        'accounting.refund.journal_entry.error', 'refund', p_refund_id,
        jsonb_build_object('error', v_error_message),
        jsonb_build_object('function', 'create_refund_journal_entry', 'sqlstate', SQLSTATE), NOW());
    success := FALSE; message := SQLERRM; journal_entry_id := NULL;
    RETURN NEXT;
END;
$function$;
