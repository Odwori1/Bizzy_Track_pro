-- =====================================================================
-- Migration 1515: Dead account-code seeder cleanup + refund journal
-- entry defense-in-depth (fail-closed guards + balance assertion)
-- =====================================================================
-- Part A: Deactivate existing dead duplicate account codes 1500/1600/
-- 1700/1800 (confirmed unreachable by any live application code,
-- Part 4 of v13.0 report). These duplicate 1440/1450/1490-1495/1480
-- in name and function.
UPDATE chart_of_accounts
SET is_active = false, updated_at = NOW()
WHERE account_code IN ('1500', '1600', '1700', '1800');

-- Part B: Stop the seeder from creating them for every future business.
-- Same single-argument signature as live — CREATE OR REPLACE is safe
-- here (no overload risk, unlike 1513/1514's set_opening_balance()).
CREATE OR REPLACE FUNCTION public.ensure_business_has_complete_accounts(p_business_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_business_exists BOOLEAN;
    v_root_asset UUID;
    v_root_liability UUID;
    v_root_equity UUID;
    v_root_revenue UUID;
    v_root_expense UUID;
BEGIN
    SELECT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) INTO v_business_exists;
    IF NOT v_business_exists THEN
        RAISE NOTICE 'Business % does not exist, skipping account creation', p_business_id;
        RETURN;
    END IF;

    RAISE NOTICE 'Ensuring complete chart of accounts for business: %', p_business_id;

    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '1000', 'Assets', 'asset', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2000', 'Liabilities', 'liability', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3000', 'Equity', 'equity', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4000', 'Revenue', 'revenue', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5000', 'Expenses', 'expense', true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    SELECT id INTO v_root_asset FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '1000';
    SELECT id INTO v_root_liability FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '2000';
    SELECT id INTO v_root_equity FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '3000';
    SELECT id INTO v_root_revenue FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '4000';
    SELECT id INTO v_root_expense FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '5000';

    -- Asset Accounts (1500/1600/1700/1800 REMOVED — dead duplicates of
    -- 1440/1450/1490-1495/1480, confirmed unreachable, migration 1515)
    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '1110', 'Cash', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1115', 'Credit Notes Receivable', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1120', 'Bank Account', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1130', 'Mobile Money', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1200', 'Accounts Receivable', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1300', 'Inventory', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1400', 'Prepaid Expenses', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1410', 'Land', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1420', 'Buildings', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1430', 'Vehicles', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1440', 'Equipment', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1450', 'Furniture and Fixtures', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1460', 'Computers and Software', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1470', 'Leasehold Improvements', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1480', 'Other Fixed Assets', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1490', 'Accumulated Depreciation - Buildings', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1491', 'Accumulated Depreciation - Vehicles', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1492', 'Accumulated Depreciation - Equipment', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1493', 'Accumulated Depreciation - Furniture', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1494', 'Accumulated Depreciation - Computers', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1495', 'Accumulated Depreciation - Other Assets', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1496', 'Gain on Disposal of Assets', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1497', 'Loss on Disposal of Assets', 'expense', v_root_expense, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '2100', 'Accounts Payable', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2120', 'Sales Tax Payable', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2130', 'WHT Payable', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2150', 'Refund Liability', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2200', 'Loans Payable', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2210', 'Short-term Loans', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2220', 'Long-term Loans', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2300', 'Accrued Expenses', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2400', 'Unearned Revenue', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2500', 'Other Liabilities', 'liability', v_root_liability, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '3100', 'Owner''s Capital', 'equity', v_root_equity, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3200', 'Owner''s Drawings', 'equity', v_root_equity, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3300', 'Retained Earnings', 'equity', v_root_equity, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3400', 'Current Earnings', 'equity', v_root_equity, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '4100', 'Sales Revenue', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4110', 'Sales Discounts', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4111', 'Volume Discounts', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4112', 'Early Payment Discounts', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4113', 'Promotional Discounts', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4150', 'Sales Returns & Allowances', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4200', 'Service Revenue', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4300', 'Discounts Given', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4400', 'Other Revenue', 'revenue', v_root_revenue, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '5100', 'Cost of Goods Sold', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5200', 'Rent Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5201', 'Office Supplies Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5202', 'Utilities Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5203', 'Rent Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5204', 'Marketing Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5205', 'Travel Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5206', 'Salaries and Wages', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5209', 'Miscellaneous Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5300', 'Insurance Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5400', 'Repairs and Maintenance', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5500', 'Advertising Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5600', 'Depreciation Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5700', 'Other Expenses', 'expense', v_root_expense, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    INSERT INTO business_accounting_status (
        business_id, chart_of_accounts_created, currency_code, initialization_status
    ) VALUES (
        p_business_id, TRUE,
        (SELECT currency FROM businesses WHERE id = p_business_id),
        'PENDING'
    )
    ON CONFLICT (business_id) DO UPDATE
    SET chart_of_accounts_created = TRUE,
        updated_at = NOW();

    RAISE NOTICE '✅ Chart of accounts complete for business: % (65 accounts)', p_business_id;
END;
$function$;

-- Part C: create_refund_journal_entry() — fail-closed guards on discount/
-- tax account lookups (matching the existing sales-returns/cash pattern),
-- plus a general debit=credit balance assertion before the entry is
-- treated as complete. The assertion is the primary safety net: it
-- catches ANY missing-line combination (discount, tax, COGS, inventory)
-- generically, not just the two cases with explicit guards below.
-- Same signature as live (uuid, uuid) — CREATE OR REPLACE is safe.
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
    v_total_debits NUMERIC(15,2); v_total_credits NUMERIC(15,2);
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

    -- NEW (1515): fail closed on discount account, matching sales-returns/cash pattern
    IF v_discount_refunded > 0 THEN
        SELECT coa.id INTO v_discount_account_id FROM chart_of_accounts coa
        WHERE coa.business_id = v_business_id AND coa.account_code = v_discount_account_code AND coa.is_active = true;
        IF v_discount_account_id IS NULL THEN
            SELECT coa.id INTO v_discount_account_id FROM chart_of_accounts coa
            WHERE coa.business_id = v_business_id AND coa.account_code = '4110' AND coa.is_active = true;
        END IF;
        IF v_discount_account_id IS NULL THEN
            success := FALSE; message := 'Discount account not found for refund reversal'; journal_entry_id := NULL;
            RETURN NEXT; RETURN;
        END IF;
    END IF;

    -- NEW (1515): fail closed on tax account
    IF v_tax_refunded > 0 THEN
        SELECT coa.id INTO v_tax_account_id FROM chart_of_accounts coa
        WHERE coa.business_id = v_business_id AND coa.account_code = '2120' AND coa.is_active = true;
        IF v_tax_account_id IS NULL THEN
            success := FALSE; message := 'Sales Tax Payable account not found for refund reversal'; journal_entry_id := NULL;
            RETURN NEXT; RETURN;
        END IF;
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

    INSERT INTO journal_entry_lines (business_id, journal_entry_id, account_id, line_type, amount, description)
    VALUES (v_business_id, v_journal_entry_id, v_sales_returns_account_id, 'debit', v_subtotal_refunded, 'Refunded sales amount');
    v_line_count := v_line_count + 1;

    IF v_discount_refunded > 0 AND v_discount_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (business_id, journal_entry_id, account_id, line_type, amount, description)
        VALUES (v_business_id, v_journal_entry_id, v_discount_account_id, 'credit', v_discount_refunded,
            'Reverse discount amount (' || v_discount_account_code || ')');
        v_line_count := v_line_count + 1;
    END IF;

    IF v_tax_refunded > 0 AND v_tax_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (business_id, journal_entry_id, account_id, line_type, amount, description)
        VALUES (v_business_id, v_journal_entry_id, v_tax_account_id, 'debit', v_tax_refunded, 'Reverse tax payable');
        v_line_count := v_line_count + 1;
    END IF;

    IF v_has_products AND v_cogs_account_id IS NOT NULL AND v_total_cogs > 0 THEN
        INSERT INTO journal_entry_lines (business_id, journal_entry_id, account_id, line_type, amount, description)
        VALUES (v_business_id, v_journal_entry_id, v_cogs_account_id, 'credit', v_total_cogs, 'Reverse COGS for returned products');
        v_line_count := v_line_count + 1;
    END IF;

    IF v_has_products AND v_inventory_account_id IS NOT NULL AND v_total_cogs > 0 THEN
        INSERT INTO journal_entry_lines (business_id, journal_entry_id, account_id, line_type, amount, description)
        VALUES (v_business_id, v_journal_entry_id, v_inventory_account_id, 'debit', v_total_cogs, 'Restore inventory for returned products');
        v_line_count := v_line_count + 1;
    END IF;

    IF v_restock_fee > 0 AND v_restock_fee_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (business_id, journal_entry_id, account_id, line_type, amount, description)
        VALUES (v_business_id, v_journal_entry_id, v_restock_fee_account_id, 'credit', v_restock_fee, 'Restock fee revenue');
        v_line_count := v_line_count + 1;
    END IF;

    DECLARE v_net_credit NUMERIC(15,2) := v_total_refunded;
    BEGIN
        IF v_restock_fee > 0 THEN v_net_credit := v_total_refunded - v_restock_fee; END IF;
        INSERT INTO journal_entry_lines (business_id, journal_entry_id, account_id, line_type, amount, description)
        VALUES (v_business_id, v_journal_entry_id, v_cash_account_id, 'credit', v_net_credit,
            CASE WHEN v_refund_method = 'CREDIT_NOTE' THEN 'Credit note issued to customer' ELSE 'Refund payment to customer' END);
        v_line_count := v_line_count + 1;
    END;

    -- NEW (1515): general balance assertion — catches any combination of
    -- missing/skipped lines (discount, tax, COGS, inventory) that the
    -- individual guards above don't explicitly enumerate. Fails closed:
    -- RAISE EXCEPTION here is caught by this function's own handler
    -- below, converted to success=false, which process_refund_accounting()
    -- re-raises, rolling back the whole refund transaction.
    SELECT
        COALESCE(SUM(CASE WHEN line_type = 'debit' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN line_type = 'credit' THEN amount ELSE 0 END), 0)
    INTO v_total_debits, v_total_credits
    FROM journal_entry_lines WHERE journal_entry_id = v_journal_entry_id;

    IF ABS(v_total_debits - v_total_credits) > 0.01 THEN
        RAISE EXCEPTION 'Refund journal entry unbalanced: debits=% credits=% (refund %, % lines)',
            v_total_debits, v_total_credits, v_refund_number, v_line_count;
    END IF;

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
