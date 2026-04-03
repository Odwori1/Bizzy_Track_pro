-- Fix the ambiguous column reference
CREATE OR REPLACE FUNCTION create_refund_journal_entry(
    p_refund_id UUID,
    p_user_id UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT, journal_entry_id UUID) AS $$
DECLARE
    v_business_id UUID;
    v_refund_number VARCHAR(50);
    v_total_refunded NUMERIC(15,2);
    v_subtotal_refunded NUMERIC(15,2);
    v_discount_refunded NUMERIC(15,2);
    v_tax_refunded NUMERIC(15,2);
    v_original_transaction_id UUID;
    v_original_transaction_type VARCHAR(20);
    v_refund_method VARCHAR(20);
    v_journal_entry_id UUID;
    v_reference_number VARCHAR(50);
    v_line_count INTEGER := 0;
    v_cash_account_id UUID;
    v_sales_returns_account_id UUID;
    v_discount_account_id UUID;
    v_tax_account_id UUID;
    v_error_message TEXT;
BEGIN
    -- Get refund details with explicit table alias
    SELECT
        r.business_id,
        r.refund_number,
        r.total_refunded,
        r.subtotal_refunded,
        r.discount_refunded,
        r.tax_refunded,
        r.original_transaction_id,
        r.original_transaction_type,
        r.refund_method
    INTO
        v_business_id,
        v_refund_number,
        v_total_refunded,
        v_subtotal_refunded,
        v_discount_refunded,
        v_tax_refunded,
        v_original_transaction_id,
        v_original_transaction_type,
        v_refund_method
    FROM refunds r
    WHERE r.id = p_refund_id;

    IF NOT FOUND THEN
        success := FALSE;
        message := 'Refund not found: ' || p_refund_id;
        journal_entry_id := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Check if already processed - use alias to avoid ambiguity
    IF EXISTS (SELECT 1 FROM refunds r2 WHERE r2.id = p_refund_id AND r2.journal_entry_id IS NOT NULL) THEN
        success := FALSE;
        message := 'Refund already has journal entry';
        journal_entry_id := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Get cash/bank account based on refund method
    SELECT id INTO v_cash_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = CASE v_refund_method
          WHEN 'CASH' THEN '1110'
          WHEN 'CARD' THEN '1120'
          WHEN 'MOBILE_MONEY' THEN '1130'
          WHEN 'BANK_TRANSFER' THEN '1120'
          ELSE '1120'
      END
      AND is_active = true
    LIMIT 1;

    IF v_cash_account_id IS NULL THEN
        success := FALSE;
        message := 'Cash/Bank account not found for refund method: ' || v_refund_method;
        journal_entry_id := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Get sales returns account
    SELECT id INTO v_sales_returns_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '4150'
      AND is_active = true;

    IF v_sales_returns_account_id IS NULL THEN
        PERFORM setup_business_refund_accounts(v_business_id, p_user_id);
        SELECT id INTO v_sales_returns_account_id
        FROM chart_of_accounts
        WHERE business_id = v_business_id
          AND account_code = '4150'
          AND is_active = true;
        IF v_sales_returns_account_id IS NULL THEN
            success := FALSE;
            message := 'Sales Returns account (4150) not found and could not be created';
            journal_entry_id := NULL;
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    -- Get discount account if discounts refunded
    IF v_discount_refunded > 0 THEN
        SELECT id INTO v_discount_account_id
        FROM chart_of_accounts
        WHERE business_id = v_business_id
          AND account_code = '4110'
          AND is_active = true;
    END IF;

    -- Get tax account if tax refunded
    IF v_tax_refunded > 0 THEN
        SELECT id INTO v_tax_account_id
        FROM chart_of_accounts
        WHERE business_id = v_business_id
          AND account_code = '2120'
          AND is_active = true;
    END IF;

    -- Create journal entry
    v_reference_number := 'REF-' || v_refund_number;

    INSERT INTO journal_entries (
        business_id, journal_date, reference_number, reference_type,
        reference_id, description, total_amount, status, created_by, posted_at
    ) VALUES (
        v_business_id, CURRENT_DATE, v_reference_number, 'REFUND',
        p_refund_id::TEXT,
        'Refund: ' || v_refund_number || ' for ' || v_original_transaction_type || ' transaction',
        v_total_refunded, 'posted', p_user_id, NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- Create debit line: Sales Returns
    INSERT INTO journal_entry_lines (
        business_id, journal_entry_id, account_id, line_type, amount, description
    ) VALUES (
        v_business_id, v_journal_entry_id, v_sales_returns_account_id,
        'debit', v_subtotal_refunded, 'Refunded sales amount'
    );
    v_line_count := v_line_count + 1;

    -- Create debit line: Discounts (if any)
    IF v_discount_refunded > 0 AND v_discount_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
            business_id, journal_entry_id, account_id, line_type, amount, description
        ) VALUES (
            v_business_id, v_journal_entry_id, v_discount_account_id,
            'debit', v_discount_refunded, 'Refunded discount amount'
        );
        v_line_count := v_line_count + 1;
    END IF;

    -- Create debit line: Tax (if any)
    IF v_tax_refunded > 0 AND v_tax_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
            business_id, journal_entry_id, account_id, line_type, amount, description
        ) VALUES (
            v_business_id, v_journal_entry_id, v_tax_account_id,
            'debit', v_tax_refunded, 'Refunded tax amount'
        );
        v_line_count := v_line_count + 1;
    END IF;

    -- Create credit line: Cash/Bank
    INSERT INTO journal_entry_lines (
        business_id, journal_entry_id, account_id, line_type, amount, description
    ) VALUES (
        v_business_id, v_journal_entry_id, v_cash_account_id,
        'credit', v_total_refunded, 'Refund payment to customer'
    );
    v_line_count := v_line_count + 1;

    -- Update refund with journal entry ID - use alias to avoid ambiguity
    UPDATE refunds r
    SET journal_entry_id = v_journal_entry_id,
        completed_at = NOW(),
        status = 'COMPLETED'
    WHERE r.id = p_refund_id;

    -- Log success
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        new_values, metadata, created_at
    ) VALUES (
        v_business_id, p_user_id, 'accounting.refund.journal_entry.created',
        'refund', p_refund_id,
        jsonb_build_object(
            'refund_number', v_refund_number,
            'journal_entry_id', v_journal_entry_id,
            'total_refunded', v_total_refunded
        ),
        jsonb_build_object('function', 'create_refund_journal_entry', 'line_count', v_line_count),
        NOW()
    );

    success := TRUE;
    message := 'Journal entry created with ' || v_line_count || ' lines';
    journal_entry_id := v_journal_entry_id;
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    success := FALSE;
    message := SQLERRM;
    journal_entry_id := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
