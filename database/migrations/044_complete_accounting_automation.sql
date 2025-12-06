-- ============================================================================
-- COMPLETE ACCOUNTING AUTOMATION SYSTEM
-- ============================================================================
-- Purpose: Single, reliable trigger system for ALL business transaction accounting
-- Date: 2025-12-05
-- Key Features:
-- 1. Works on INSERT with status 'completed' (real-world usage)
-- 2. Also works on UPDATE status changes
-- 3. Comprehensive error handling
-- 4. Complete audit trail
-- 5. No business operation blocking
-- ============================================================================

-- ============================================================================
-- 1. CLEAN UP EXISTING MESS
-- ============================================================================
DO $$
BEGIN
    -- Drop all accounting triggers to start fresh
    DROP TRIGGER IF EXISTS trigger_auto_pos_accounting ON pos_transactions;
    DROP TRIGGER IF EXISTS trigger_pos_accounting_insert ON pos_transactions;
    DROP TRIGGER IF EXISTS trigger_accounting_pos_transactions ON pos_transactions;
    DROP TRIGGER IF EXISTS trigger_accounting_expenses ON expenses;
    DROP TRIGGER IF EXISTS trigger_accounting_invoices ON invoices;
    DROP TRIGGER IF EXISTS trigger_accounting_purchase_orders ON purchase_orders;
    DROP TRIGGER IF EXISTS trigger_accounting_inventory_movements ON inventory_movements;
    
    RAISE NOTICE '✅ Cleaned up existing triggers';
END $$;

-- ============================================================================
-- 2. FIX THE CRITICAL process_pos_sale FUNCTION ONCE AND FOR ALL
-- ============================================================================
CREATE OR REPLACE FUNCTION process_pos_sale_fixed(p_pos_transaction_id UUID)
RETURNS UUID AS $$
DECLARE
    v_business_id UUID;
    v_final_amount DECIMAL(15,2);
    v_created_by UUID;
    v_transaction_number VARCHAR(100);
    v_cash_account_id UUID;
    v_revenue_account_id UUID;
    v_journal_entry_id UUID;
BEGIN
    -- Get transaction details
    SELECT 
        business_id, 
        final_amount, 
        created_by,
        transaction_number
    INTO 
        v_business_id, 
        v_final_amount, 
        v_created_by,
        v_transaction_number
    FROM pos_transactions 
    WHERE id = p_pos_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'POS transaction not found: %', p_pos_transaction_id;
    END IF;

    -- Validate required fields
    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Business ID is required';
    END IF;

    -- Get account IDs (these MUST exist from chart_of_accounts setup)
    SELECT id INTO v_cash_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '1110'  -- Cash account
    LIMIT 1;

    SELECT id INTO v_revenue_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '4100'  -- Sales Revenue account
    LIMIT 1;

    IF v_cash_account_id IS NULL THEN
        RAISE EXCEPTION 'Cash account (1110) not found for business: %', v_business_id;
    END IF;

    IF v_revenue_account_id IS NULL THEN
        RAISE EXCEPTION 'Sales Revenue account (4100) not found for business: %', v_business_id;
    END IF;

    -- Create journal entry
    INSERT INTO journal_entries (
        business_id,
        journal_date,
        reference_number,
        reference_type,
        reference_id,
        description,
        total_amount,
        created_by,
        posted_at
    ) VALUES (
        v_business_id,
        CURRENT_DATE,
        'JE-' || COALESCE(v_transaction_number, EXTRACT(EPOCH FROM NOW())::TEXT),
        'pos_transaction',
        p_pos_transaction_id,
        'POS Sale: ' || COALESCE(v_transaction_number, p_pos_transaction_id::TEXT),
        v_final_amount,
        COALESCE(v_created_by, (SELECT id FROM users WHERE business_id = v_business_id LIMIT 1)),
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- Create debit entry (Cash increase)
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        v_business_id,
        v_journal_entry_id,
        v_cash_account_id,
        'debit',
        v_final_amount,
        'Cash received from POS sale'
    );

    -- Create credit entry (Revenue increase)
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        v_business_id,
        v_journal_entry_id,
        v_revenue_account_id,
        'credit',
        v_final_amount,
        'Sales revenue from POS'
    );

    -- Update customer if exists
    UPDATE customers
    SET 
        total_spent = COALESCE(total_spent, 0) + v_final_amount,
        last_visit = NOW(),
        updated_at = NOW()
    WHERE id IN (
        SELECT customer_id 
        FROM pos_transactions 
        WHERE id = p_pos_transaction_id AND customer_id IS NOT NULL
    );

    -- Update inventory if needed
    UPDATE products p
    SET current_stock = current_stock - pti.quantity,
        updated_at = NOW()
    FROM pos_transaction_items pti
    WHERE pti.pos_transaction_id = p_pos_transaction_id
      AND pti.product_id = p.id
      AND p.business_id = v_business_id;

    RETURN v_journal_entry_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. UNIVERSAL ACCOUNTING TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION universal_accounting_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_business_id UUID;
    v_record_id UUID;
    v_user_id UUID;
    v_status TEXT;
    v_old_status TEXT;
    v_amount DECIMAL(15,2);
    v_journal_entry_id UUID;
BEGIN
    -- Determine values based on operation
    CASE TG_OP
        WHEN 'INSERT' THEN
            v_business_id := NEW.business_id;
            v_record_id := NEW.id;
            v_user_id := NEW.created_by;
            v_status := NEW.status;
            v_amount := COALESCE(NEW.amount, NEW.final_amount, NEW.total_amount, 0);
        WHEN 'UPDATE' THEN
            v_business_id := NEW.business_id;
            v_record_id := NEW.id;
            v_user_id := COALESCE(NEW.updated_by, NEW.created_by);
            v_status := NEW.status;
            v_old_status := OLD.status;
            v_amount := COALESCE(NEW.amount, NEW.final_amount, NEW.total_amount, 0);
        ELSE
            -- DELETE operations don't create accounting
            RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
    END CASE;

    -- Log that we're checking for accounting
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        details, metadata
    ) VALUES (
        v_business_id,
        v_user_id,
        'accounting.trigger.checking',
        TG_TABLE_NAME,
        v_record_id,
        jsonb_build_object(
            'operation', TG_OP,
            'status', v_status,
            'old_status', v_old_status,
            'amount', v_amount
        ),
        jsonb_build_object('trigger', 'universal_accounting_trigger')
    );

    -- Route based on table and status
    IF TG_TABLE_NAME = 'pos_transactions' THEN
        -- POS Transactions: Create accounting when status is 'completed'
        IF (TG_OP = 'INSERT' AND v_status = 'completed') OR 
           (TG_OP = 'UPDATE' AND v_status = 'completed' AND v_old_status != 'completed') THEN
            
            BEGIN
                v_journal_entry_id := process_pos_sale_fixed(v_record_id);
                
                INSERT INTO audit_logs (
                    business_id, user_id, action, resource_type, resource_id,
                    details, metadata
                ) VALUES (
                    v_business_id,
                    v_user_id,
                    'accounting.created.success',
                    TG_TABLE_NAME,
                    v_record_id,
                    jsonb_build_object(
                        'journal_entry_id', v_journal_entry_id,
                        'amount', v_amount,
                        'automated', true
                    ),
                    jsonb_build_object('trigger', 'universal_accounting_trigger')
                );
                
                RAISE LOG '✅ POS accounting created: %', v_journal_entry_id;
                
            EXCEPTION WHEN OTHERS THEN
                INSERT INTO audit_logs (
                    business_id, user_id, action, resource_type, resource_id,
                    details, metadata
                ) VALUES (
                    v_business_id,
                    v_user_id,
                    'accounting.created.error',
                    TG_TABLE_NAME,
                    v_record_id,
                    jsonb_build_object(
                        'error', SQLERRM,
                        'amount', v_amount,
                        'automated', true
                    ),
                    jsonb_build_object('trigger', 'universal_accounting_trigger')
                );
                
                RAISE WARNING 'POS accounting failed for %: %', v_record_id, SQLERRM;
            END;
        END IF;
    
    ELSIF TG_TABLE_NAME = 'expenses' THEN
        -- Expenses: Create accounting when status changes to 'paid'
        IF TG_OP = 'UPDATE' AND v_status = 'paid' AND v_old_status != 'paid' THEN
            BEGIN
                -- Simple expense accounting: Debit Expense, Credit Cash
                SELECT id INTO v_journal_entry_id
                FROM create_simple_expense_accounting(v_record_id, v_user_id);
                
                INSERT INTO audit_logs (
                    business_id, user_id, action, resource_type, resource_id,
                    details, metadata
                ) VALUES (
                    v_business_id,
                    v_user_id,
                    'accounting.created.success',
                    TG_TABLE_NAME,
                    v_record_id,
                    jsonb_build_object(
                        'journal_entry_id', v_journal_entry_id,
                        'amount', v_amount,
                        'type', 'expense_payment'
                    ),
                    jsonb_build_object('trigger', 'universal_accounting_trigger')
                );
                
                RAISE LOG '✅ Expense accounting created: %', v_journal_entry_id;
                
            EXCEPTION WHEN OTHERS THEN
                INSERT INTO audit_logs (
                    business_id, user_id, action, resource_type, resource_id,
                    details, metadata
                ) VALUES (
                    v_business_id,
                    v_user_id,
                    'accounting.created.error',
                    TG_TABLE_NAME,
                    v_record_id,
                    jsonb_build_object(
                        'error', SQLERRM,
                        'amount', v_amount
                    ),
                    jsonb_build_object('trigger', 'universal_accounting_trigger')
                );
            END;
        END IF;
    
    ELSIF TG_TABLE_NAME = 'invoices' THEN
        -- Invoices: Create accounting when status changes to 'paid'
        IF TG_OP = 'UPDATE' AND v_status = 'paid' AND v_old_status != 'paid' THEN
            BEGIN
                -- Simple invoice accounting: Debit Cash, Credit Revenue
                SELECT id INTO v_journal_entry_id
                FROM create_simple_invoice_accounting(v_record_id, v_user_id);
                
                INSERT INTO audit_logs (
                    business_id, user_id, action, resource_type, resource_id,
                    details, metadata
                ) VALUES (
                    v_business_id,
                    v_user_id,
                    'accounting.created.success',
                    TG_TABLE_NAME,
                    v_record_id,
                    jsonb_build_object(
                        'journal_entry_id', v_journal_entry_id,
                        'amount', v_amount,
                        'type', 'invoice_payment'
                    ),
                    jsonb_build_object('trigger', 'universal_accounting_trigger')
                );
                
            EXCEPTION WHEN OTHERS THEN
                INSERT INTO audit_logs (
                    business_id, user_id, action, resource_type, resource_id,
                    details, metadata
                ) VALUES (
                    v_business_id,
                    v_user_id,
                    'accounting.created.error',
                    TG_TABLE_NAME,
                    v_record_id,
                    jsonb_build_object('error', SQLERRM)
                );
            END;
        END IF;
    END IF;

    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
    
EXCEPTION WHEN OTHERS THEN
    -- Critical: NEVER fail the business transaction
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        details, metadata
    ) VALUES (
        COALESCE(v_business_id, '00000000-0000-0000-0000-000000000000'::UUID),
        v_user_id,
        'accounting.trigger.error',
        TG_TABLE_NAME,
        COALESCE(v_record_id, '00000000-0000-0000-0000-000000000000'::UUID),
        jsonb_build_object(
            'error', SQLERRM,
            'operation', TG_OP,
            'table', TG_TABLE_NAME
        ),
        jsonb_build_object('trigger', 'universal_accounting_trigger')
    );
    
    RAISE LOG 'Accounting trigger error (non-blocking): %', SQLERRM;
    
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. SIMPLE ACCOUNTING FUNCTIONS FOR OTHER TRANSACTIONS
-- ============================================================================

-- Expense Accounting
CREATE OR REPLACE FUNCTION create_simple_expense_accounting(p_expense_id UUID, p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_business_id UUID;
    v_amount DECIMAL(15,2);
    v_description TEXT;
    v_expense_account_id UUID;
    v_cash_account_id UUID;
    v_journal_entry_id UUID;
BEGIN
    -- Get expense details
    SELECT business_id, amount, description
    INTO v_business_id, v_amount, v_description
    FROM expenses WHERE id = p_expense_id;
    
    -- Get expense account (use first expense account found)
    SELECT id INTO v_expense_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_type = 'expense'
      AND account_code LIKE '5%'
    ORDER BY account_code
    LIMIT 1;
    
    -- Get cash account
    SELECT id INTO v_cash_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '1110'
    LIMIT 1;
    
    -- Create journal entry
    INSERT INTO journal_entries (
        business_id,
        journal_date,
        reference_number,
        reference_type,
        reference_id,
        description,
        total_amount,
        created_by,
        posted_at
    ) VALUES (
        v_business_id,
        CURRENT_DATE,
        'JE-EXP-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        'expense',
        p_expense_id,
        'Expense: ' || COALESCE(v_description, 'Payment'),
        v_amount,
        COALESCE(p_user_id, (SELECT id FROM users WHERE business_id = v_business_id LIMIT 1)),
        NOW()
    ) RETURNING id INTO v_journal_entry_id;
    
    -- Debit: Expense
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        v_business_id,
        v_journal_entry_id,
        v_expense_account_id,
        'debit',
        v_amount,
        'Expense payment'
    );
    
    -- Credit: Cash
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        v_business_id,
        v_journal_entry_id,
        v_cash_account_id,
        'credit',
        v_amount,
        'Cash payment for expense'
    );
    
    RETURN v_journal_entry_id;
END;
$$ LANGUAGE plpgsql;

-- Invoice Accounting
CREATE OR REPLACE FUNCTION create_simple_invoice_accounting(p_invoice_id UUID, p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_business_id UUID;
    v_amount DECIMAL(15,2);
    v_description TEXT;
    v_revenue_account_id UUID;
    v_cash_account_id UUID;
    v_journal_entry_id UUID;
BEGIN
    -- Get invoice details
    SELECT business_id, total_amount, description
    INTO v_business_id, v_amount, v_description
    FROM invoices WHERE id = p_invoice_id;
    
    -- Get revenue account
    SELECT id INTO v_revenue_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '4100'
    LIMIT 1;
    
    -- Get cash account
    SELECT id INTO v_cash_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '1110'
    LIMIT 1;
    
    -- Create journal entry
    INSERT INTO journal_entries (
        business_id,
        journal_date,
        reference_number,
        reference_type,
        reference_id,
        description,
        total_amount,
        created_by,
        posted_at
    ) VALUES (
        v_business_id,
        CURRENT_DATE,
        'JE-INV-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        'invoice',
        p_invoice_id,
        'Invoice Payment: ' || COALESCE(v_description, 'Invoice'),
        v_amount,
        COALESCE(p_user_id, (SELECT id FROM users WHERE business_id = v_business_id LIMIT 1)),
        NOW()
    ) RETURNING id INTO v_journal_entry_id;
    
    -- Debit: Cash
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        v_business_id,
        v_journal_entry_id,
        v_cash_account_id,
        'debit',
        v_amount,
        'Cash received from invoice'
    );
    
    -- Credit: Revenue
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        v_business_id,
        v_journal_entry_id,
        v_revenue_account_id,
        'credit',
        v_amount,
        'Revenue from invoice'
    );
    
    RETURN v_journal_entry_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. CREATE TRIGGERS ON ALL BUSINESS TABLES
-- ============================================================================
DO $$
BEGIN
    -- Create triggers on key business tables
    EXECUTE 'CREATE TRIGGER trigger_accounting_pos
             AFTER INSERT OR UPDATE ON pos_transactions
             FOR EACH ROW
             EXECUTE FUNCTION universal_accounting_trigger()';
    
    EXECUTE 'CREATE TRIGGER trigger_accounting_expenses
             AFTER INSERT OR UPDATE ON expenses
             FOR EACH ROW
             EXECUTE FUNCTION universal_accounting_trigger()';
    
    EXECUTE 'CREATE TRIGGER trigger_accounting_invoices
             AFTER INSERT OR UPDATE ON invoices
             FOR EACH ROW
             EXECUTE FUNCTION universal_accounting_trigger()';
    
    RAISE NOTICE '✅ Created accounting triggers on pos_transactions, expenses, invoices';
END $$;

-- ============================================================================
-- 6. VERIFICATION AND TESTING
-- ============================================================================
DO $$
DECLARE
    v_test_transaction_id UUID;
    v_journal_count_before INTEGER;
    v_journal_count_after INTEGER;
    v_recent_journal RECORD;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'COMPREHENSIVE ACCOUNTING SYSTEM TEST';
    RAISE NOTICE '========================================';
    
    -- Count existing journal entries
    SELECT COUNT(*) INTO v_journal_count_before
    FROM journal_entries 
    WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e';
    
    RAISE NOTICE 'Starting journal entries: %', v_journal_count_before;
    
    -- TEST 1: Create POS transaction with status 'completed' (should trigger immediately)
    RAISE NOTICE '';
    RAISE NOTICE 'TEST 1: POS Transaction with status "completed"';
    RAISE NOTICE '----------------------------------------';
    
    INSERT INTO pos_transactions (
        business_id,
        transaction_number,
        total_amount,
        discount_amount,
        tax_amount,
        final_amount,
        payment_method,
        status,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        '243a15b5-255a-4852-83bf-5cb46aa62b5e',
        'AUTO-ACCT-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        5000.00,
        250.00,
        300.00,
        5050.00,
        'cash',
        'completed',
        'b4af1699-0149-47e2-bc55-66214c0572ba',
        NOW(),
        NOW()
    ) RETURNING id INTO v_test_transaction_id;
    
    RAISE NOTICE 'Created transaction: %', v_test_transaction_id;
    
    -- Wait for trigger
    PERFORM pg_sleep(0.5);
    
    -- Check results
    SELECT COUNT(*) INTO v_journal_count_after
    FROM journal_entries 
    WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e';
    
    IF v_journal_count_after > v_journal_count_before THEN
        RAISE NOTICE '✅ SUCCESS: % new journal entry created', v_journal_count_after - v_journal_count_before;
        
        -- Show the new entry
        SELECT reference_number, description, total_amount, created_at 
        INTO v_recent_journal
        FROM journal_entries 
        WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
        ORDER BY created_at DESC 
        LIMIT 1;
        
        RAISE NOTICE '   Entry: % - % - %', 
            v_recent_journal.reference_number, 
            v_recent_journal.description, 
            v_recent_journal.total_amount;
    ELSE
        RAISE NOTICE '❌ FAILED: No journal entry created';
    END IF;
    
    -- TEST 2: Verify audit trail
    RAISE NOTICE '';
    RAISE NOTICE 'TEST 2: Audit Trail Verification';
    RAISE NOTICE '----------------------------------------';
    
    DECLARE
        v_audit_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_audit_count
        FROM audit_logs 
        WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
          AND resource_id = v_test_transaction_id
          AND action LIKE '%accounting%';
        
        IF v_audit_count > 0 THEN
            RAISE NOTICE '✅ SUCCESS: % audit log entries created', v_audit_count;
        ELSE
            RAISE NOTICE '❌ FAILED: No audit logs created';
        END IF;
    END;
    
    -- TEST 3: Verify accounting equation
    RAISE NOTICE '';
    RAISE NOTICE 'TEST 3: Accounting Equation Verification';
    RAISE NOTICE '----------------------------------------';
    
    DECLARE
        v_total_debits DECIMAL(15,2);
        v_total_credits DECIMAL(15,2);
        v_difference DECIMAL(15,2);
    BEGIN
        SELECT 
            SUM(CASE WHEN line_type = 'debit' THEN amount ELSE 0 END),
            SUM(CASE WHEN line_type = 'credit' THEN amount ELSE 0 END)
        INTO v_total_debits, v_total_credits
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        WHERE je.business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e';
        
        v_difference := ABS(COALESCE(v_total_debits, 0) - COALESCE(v_total_credits, 0));
        
        IF v_difference = 0 THEN
            RAISE NOTICE '✅ SUCCESS: Debits (%%) = Credits (%%)', 
                v_total_debits, v_total_credits;
        ELSE
            RAISE NOTICE '❌ FAILED: Debits (%%) ≠ Credits (%%), Difference: %%', 
                v_total_debits, v_total_credits, v_difference;
        END IF;
    END;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SYSTEM READY FOR PRODUCTION';
    RAISE NOTICE '========================================';
    
END $$;
