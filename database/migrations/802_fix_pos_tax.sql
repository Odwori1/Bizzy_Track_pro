-- Update the function to include 'pos_sale' in the sale transaction types
CREATE OR REPLACE FUNCTION public.post_tax_to_gl(p_tax_transaction_id uuid, p_user_id uuid)
RETURNS TABLE(success boolean, journal_entry_id uuid, message text)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_tax RECORD;
    v_business_id UUID;
    v_tax_account_id UUID;
    v_journal_entry_id UUID;
    v_reference_number VARCHAR(100);
    v_error_message TEXT;
BEGIN
    -- Get tax transaction details
    SELECT
        tt.*,
        tt.transaction_id,
        tt.transaction_type,
        tt.business_id,
        tt.tax_amount,
        tt.transaction_date,
        tt.created_by
    INTO v_tax
    FROM transaction_taxes tt
    WHERE tt.id = p_tax_transaction_id;

    IF NOT FOUND THEN
        success := FALSE;
        journal_entry_id := NULL;
        message := 'Tax transaction not found: ' || p_tax_transaction_id;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Check if already posted
    IF v_tax.is_posted_to_ledger = TRUE THEN
        success := FALSE;
        journal_entry_id := v_tax.journal_entry_id;
        message := 'Tax already posted to GL';
        RETURN NEXT;
        RETURN;
    END IF;

    -- Determine tax account based on transaction type
    -- ✅ FIX: Added 'pos_sale' to the list of sale transaction types
    IF v_tax.transaction_type IN ('POS', 'INVOICE', 'SALE', 'pos_sale') THEN
        -- Sales/POS/Invoice -> Sales Tax Payable (2120) - Liability
        SELECT id INTO v_tax_account_id
        FROM chart_of_accounts
        WHERE business_id = v_tax.business_id
          AND account_code = '2120'
          AND is_active = true;

        IF v_tax_account_id IS NULL THEN
            success := FALSE;
            journal_entry_id := NULL;
            message := 'Sales Tax Payable account (2120) not found';
            RETURN NEXT;
            RETURN;
        END IF;
    ELSE
        -- Purchases/Expenses -> Input VAT Receivable (2125) - Asset
        SELECT id INTO v_tax_account_id
        FROM chart_of_accounts
        WHERE business_id = v_tax.business_id
          AND account_code = '2125'
          AND is_active = true;

        IF v_tax_account_id IS NULL THEN
            success := FALSE;
            journal_entry_id := NULL;
            message := 'Input VAT Receivable account (2125) not found';
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    -- Generate reference number
    v_reference_number := 'TAX-' || TO_CHAR(v_tax.transaction_date, 'YYYYMMDD') || '-' ||
                          SUBSTRING(p_tax_transaction_id::text, 1, 8);

    -- Create journal entry for tax
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
        v_tax.business_id,
        v_tax.transaction_date,
        v_reference_number,
        'TAX_POSTING',
        p_tax_transaction_id::text,
        'Tax posting for ' || v_tax.transaction_type || ' transaction: ' || v_tax.tax_amount || ' ' ||
        CASE
            WHEN v_tax.transaction_type IN ('POS', 'INVOICE', 'SALE', 'pos_sale') THEN 'Sales Tax Payable'
            ELSE 'Input VAT Receivable'
        END,
        v_tax.tax_amount,
        'posted',
        COALESCE(p_user_id, v_tax.created_by),
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- Create journal entry line for tax
    IF v_tax.transaction_type IN ('POS', 'INVOICE', 'SALE', 'pos_sale') THEN
        -- Sales: Credit Tax Payable (increase liability)
        INSERT INTO journal_entry_lines (
            journal_entry_id,
            business_id,
            account_id,
            line_type,
            amount,
            description
        ) VALUES (
            v_journal_entry_id,
            v_tax.business_id,
            v_tax_account_id,
            'credit',
            v_tax.tax_amount,
            'Sales tax on ' || v_tax.transaction_type || ' transaction ' || v_tax.transaction_id
        );
    ELSE
        -- Purchases: Debit Input VAT (increase asset)
        INSERT INTO journal_entry_lines (
            journal_entry_id,
            business_id,
            account_id,
            line_type,
            amount,
            description
        ) VALUES (
            v_journal_entry_id,
            v_tax.business_id,
            v_tax_account_id,
            'debit',
            v_tax.tax_amount,
            'Input VAT on ' || v_tax.transaction_type || ' transaction ' || v_tax.transaction_id
        );
    END IF;

    -- Update tax transaction as posted
    UPDATE transaction_taxes
    SET is_posted_to_ledger = TRUE,
        journal_entry_id = v_journal_entry_id,
        updated_at = NOW()
    WHERE id = p_tax_transaction_id;

    -- Audit log
    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        new_values,
        created_at
    ) VALUES (
        v_tax.business_id,
        COALESCE(p_user_id, v_tax.created_by),
        'tax.posted_to_gl',
        'transaction_taxes',
        p_tax_transaction_id,
        jsonb_build_object(
            'journal_entry_id', v_journal_entry_id,
            'tax_amount', v_tax.tax_amount,
            'transaction_type', v_tax.transaction_type
        ),
        NOW()
    );

    success := TRUE;
    journal_entry_id := v_journal_entry_id;
    message := 'Tax posted to GL successfully with journal entry: ' || v_journal_entry_id;
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;

    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        new_values,
        created_at
    ) VALUES (
        COALESCE(v_tax.business_id, '00000000-0000-0000-0000-000000000000'::UUID),
        COALESCE(p_user_id, v_tax.created_by, '00000000-0000-0000-0000-000000000000'::UUID),
        'tax.post_to_gl.error',
        'transaction_taxes',
        p_tax_transaction_id,
        jsonb_build_object('error', v_error_message, 'sqlstate', SQLSTATE),
        NOW()
    );

    success := FALSE;
    journal_entry_id := NULL;
    message := SQLERRM;
    RETURN NEXT;
END;
$function$;
