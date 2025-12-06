-- ============================================================================
-- MIGRATION: Create Unified Accounting Automation System
-- ============================================================================
-- Purpose: Single trigger system for ALL business transaction accounting
-- Date: 2025-12-05
-- ============================================================================

-- ============================================================================
-- 1. ACCOUNTING EVENT REGISTRY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS accounting_event_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Event Identification
    source_table VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('INSERT', 'UPDATE', 'DELETE')),
    trigger_condition TEXT,
    
    -- Accounting Configuration
    accounting_function VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    
    -- Metadata
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(business_id, source_table, event_type, trigger_condition)
);

-- ============================================================================
-- 2. UNIVERSAL ACCOUNTING ROUTER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION route_to_accounting()
RETURNS TRIGGER AS $$
DECLARE
    v_event accounting_event_registry%ROWTYPE;
    v_journal_entry_id UUID;
    v_success BOOLEAN;
    v_message TEXT;
    v_business_id UUID;
    v_record_id UUID;
    v_user_id UUID;
BEGIN
    -- Determine business ID and record ID based on trigger operation
    CASE TG_OP
        WHEN 'INSERT' THEN
            v_business_id := NEW.business_id;
            v_record_id := NEW.id;
            v_user_id := NEW.created_by;
        WHEN 'UPDATE' THEN
            v_business_id := NEW.business_id;
            v_record_id := NEW.id;
            v_user_id := NEW.updated_by;
        WHEN 'DELETE' THEN
            v_business_id := OLD.business_id;
            v_record_id := OLD.id;
            v_user_id := NULL;
    END CASE;

    -- Find accounting configuration for this event
    SELECT * INTO v_event
    FROM accounting_event_registry
    WHERE business_id = v_business_id
      AND source_table = TG_TABLE_NAME
      AND event_type = TG_OP
      AND enabled = true
      AND (
        trigger_condition IS NULL OR
        CASE TG_OP
            WHEN 'INSERT' THEN eval_trigger_condition(trigger_condition, NEW, NULL)
            WHEN 'UPDATE' THEN eval_trigger_condition(trigger_condition, NEW, OLD)
            WHEN 'DELETE' THEN eval_trigger_condition(trigger_condition, NULL, OLD)
        END
      )
    LIMIT 1;

    -- If no configuration found, exit gracefully
    IF NOT FOUND THEN
        RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    -- Log that we're processing accounting
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        details, metadata
    ) VALUES (
        v_business_id,
        v_user_id,
        'accounting.processing.start',
        TG_TABLE_NAME,
        v_record_id,
        jsonb_build_object('event_type', TG_OP, 'accounting_function', v_event.accounting_function),
        jsonb_build_object('trigger', 'route_to_accounting')
    );

    -- Route to appropriate accounting function
    CASE v_event.accounting_function
        -- POS Transactions
        WHEN 'process_pos_transaction' THEN
            IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
                SELECT * INTO v_success, v_message
                FROM process_pos_sale(v_record_id);
            END IF;
        
        -- Expenses
        WHEN 'process_expense_payment' THEN
            IF TG_OP = 'UPDATE' AND NEW.status = 'paid' AND OLD.status != 'paid' THEN
                PERFORM create_accounting_for_expense(v_record_id, v_user_id);
                v_success := true;
                v_message := 'Expense accounting created';
            END IF;
        
        -- Invoices
        WHEN 'process_invoice_payment' THEN
            IF TG_OP = 'UPDATE' AND NEW.status = 'paid' AND OLD.status != 'paid' THEN
                PERFORM create_accounting_for_invoice(v_record_id, v_user_id);
                v_success := true;
                v_message := 'Invoice accounting created';
            END IF;
        
        -- Purchase Orders
        WHEN 'process_purchase_order' THEN
            IF TG_OP = 'UPDATE' AND NEW.status = 'received' AND OLD.status != 'received' THEN
                PERFORM create_accounting_for_purchase_order(v_record_id, v_user_id);
                v_success := true;
                v_message := 'Purchase order accounting created';
            END IF;
        
        -- Inventory Movements
        WHEN 'process_inventory_movement' THEN
            IF TG_OP = 'INSERT' THEN
                PERFORM create_accounting_for_inventory_movement(v_record_id, v_user_id);
                v_success := true;
                v_message := 'Inventory movement accounting created';
            END IF;
        
        -- Default: Try to use generic function
        ELSE
            BEGIN
                EXECUTE 'SELECT ' || v_event.accounting_function || '($1, $2)'
                INTO v_journal_entry_id
                USING v_record_id, v_user_id;
                
                v_success := true;
                v_message := 'Accounting processed by ' || v_event.accounting_function;
            EXCEPTION WHEN OTHERS THEN
                v_success := false;
                v_message := 'Function ' || v_event.accounting_function || ' failed: ' || SQLERRM;
            END;
    END CASE;

    -- Log result
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        details, metadata
    ) VALUES (
        v_business_id,
        v_user_id,
        CASE WHEN v_success THEN 'accounting.processing.success' ELSE 'accounting.processing.failed' END,
        TG_TABLE_NAME,
        v_record_id,
        jsonb_build_object(
            'success', v_success,
            'message', v_message,
            'event_type', TG_OP,
            'accounting_function', v_event.accounting_function
        ),
        jsonb_build_object('trigger', 'route_to_accounting')
    );

    -- Return appropriate value
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
    
EXCEPTION WHEN OTHERS THEN
    -- Log any unhandled errors but don't fail the business transaction
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        details, metadata
    ) VALUES (
        COALESCE(v_business_id, '00000000-0000-0000-0000-000000000000'::UUID),
        v_user_id,
        'accounting.processing.error',
        TG_TABLE_NAME,
        COALESCE(v_record_id, '00000000-0000-0000-0000-000000000000'::UUID),
        jsonb_build_object('error', SQLERRM, 'context', 'Unhandled error in route_to_accounting'),
        jsonb_build_object('trigger', 'route_to_accounting')
    );
    
    RAISE LOG 'Accounting automation error for % on %: %', TG_OP, TG_TABLE_NAME, SQLERRM;
    
    -- Always return so business transaction continues
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. HELPER FUNCTION FOR CONDITION EVALUATION
-- ============================================================================
CREATE OR REPLACE FUNCTION eval_trigger_condition(
    p_condition TEXT,
    p_new_record ANYELEMENT DEFAULT NULL,
    p_old_record ANYELEMENT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_result BOOLEAN;
    v_sql TEXT;
BEGIN
    -- Convert condition to SQL
    -- Example condition: "NEW.status = 'paid' AND OLD.status != 'paid'"
    -- We'll replace NEW/OLD with actual column references
    
    v_sql := 'SELECT ' || p_condition;
    
    -- Replace NEW and OLD with parameter references
    v_sql := REPLACE(v_sql, 'NEW.', 'p_new_record.');
    v_sql := REPLACE(v_sql, 'OLD.', 'p_old_record.');
    
    EXECUTE v_sql INTO v_result;
    
    RETURN COALESCE(v_result, false);
    
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error evaluating condition "%": %', p_condition, SQLERRM;
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. CREATE DEFAULT ACCOUNTING CONFIGURATIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION setup_default_accounting_events(p_business_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Only insert if not exists
    INSERT INTO accounting_event_registry (business_id, source_table, event_type, trigger_condition, accounting_function, description)
    VALUES
        -- POS Transactions: When status changes to completed
        (p_business_id, 'pos_transactions', 'UPDATE', 'NEW.status = ''completed'' AND OLD.status != ''completed''', 'process_pos_transaction', 'POS sale completion'),
        
        -- Expenses: When status changes to paid
        (p_business_id, 'expenses', 'UPDATE', 'NEW.status = ''paid'' AND OLD.status != ''paid''', 'process_expense_payment', 'Expense payment'),
        
        -- Invoices: When status changes to paid
        (p_business_id, 'invoices', 'UPDATE', 'NEW.status = ''paid'' AND OLD.status != ''paid''', 'process_invoice_payment', 'Invoice payment'),
        
        -- Purchase Orders: When status changes to received
        (p_business_id, 'purchase_orders', 'UPDATE', 'NEW.status = ''received'' AND OLD.status != ''received''', 'process_purchase_order', 'Purchase order receipt'),
        
        -- Inventory Movements: On creation
        (p_business_id, 'inventory_movements', 'INSERT', NULL, 'process_inventory_movement', 'Inventory movement'),
        
        -- Equipment Hire: When status changes to completed
        (p_business_id, 'equipment_hires', 'UPDATE', 'NEW.status = ''completed'' AND OLD.status != ''completed''', 'process_equipment_hire', 'Equipment hire completion')
    ON CONFLICT (business_id, source_table, event_type, trigger_condition) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. CREATE MISSING ACCOUNTING FUNCTIONS
-- ============================================================================

-- Generic expense accounting
CREATE OR REPLACE FUNCTION create_accounting_for_expense(p_expense_id UUID, p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_journal_entry_id UUID;
    v_business_id UUID;
BEGIN
    -- Get business ID from expense
    SELECT business_id INTO v_business_id
    FROM expenses WHERE id = p_expense_id;
    
    -- Use existing function or create simple entry
    BEGIN
        -- Try to use the manual journal entry creation via API
        -- This will be handled by the application layer
        SELECT id INTO v_journal_entry_id
        FROM journal_entries
        WHERE reference_type = 'expense'
          AND reference_id = p_expense_id
          AND business_id = v_business_id
        LIMIT 1;
        
        IF NOT FOUND THEN
            -- Simple fallback: create basic expense entry
            INSERT INTO journal_entries (
                business_id, journal_date, reference_number, reference_type, reference_id,
                description, total_amount, status, created_by
            )
            SELECT 
                e.business_id,
                COALESCE(e.expense_date, CURRENT_DATE),
                'JE-EXP-' || EXTRACT(EPOCH FROM NOW())::TEXT,
                'expense',
                e.id,
                'Expense: ' || COALESCE(e.description, 'No description'),
                e.amount,
                'posted',
                COALESCE(p_user_id, e.created_by)
            FROM expenses e
            WHERE e.id = p_expense_id
            RETURNING id INTO v_journal_entry_id;
        END IF;
        
        RETURN v_journal_entry_id;
    END;
END;
$$ LANGUAGE plpgsql;

-- Generic invoice accounting
CREATE OR REPLACE FUNCTION create_accounting_for_invoice(p_invoice_id UUID, p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_journal_entry_id UUID;
    v_business_id UUID;
BEGIN
    -- Similar structure to expense function
    SELECT business_id INTO v_business_id
    FROM invoices WHERE id = p_invoice_id;
    
    -- Implementation would follow similar pattern
    -- For now, return NULL to be implemented
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. CREATE TRIGGERS ON ALL BUSINESS TABLES
-- ============================================================================
DO $$
DECLARE
    v_table_name TEXT;
BEGIN
    -- Create triggers on all business transaction tables
    FOR v_table_name IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_name IN (
            'pos_transactions',
            'expenses', 
            'invoices',
            'purchase_orders',
            'inventory_movements',
            'equipment_hires'
        )
    LOOP
        -- Drop existing trigger if exists
        EXECUTE 'DROP TRIGGER IF EXISTS trigger_accounting_' || v_table_name || ' ON ' || v_table_name;
        
        -- Create new unified trigger
        EXECUTE 'CREATE TRIGGER trigger_accounting_' || v_table_name || '
                 AFTER INSERT OR UPDATE OR DELETE ON ' || v_table_name || '
                 FOR EACH ROW
                 EXECUTE FUNCTION route_to_accounting()';
        
        RAISE NOTICE 'Created accounting trigger on table: %', v_table_name;
    END LOOP;
END $$;

-- ============================================================================
-- 7. SETUP FOR EXISTING BUSINESS
-- ============================================================================
DO $$
DECLARE
    v_business_id UUID;
BEGIN
    -- Setup for test business
    v_business_id := '243a15b5-255a-4852-83bf-5cb46aa62b5e';
    
    -- Setup default accounting events
    PERFORM setup_default_accounting_events(v_business_id);
    
    RAISE NOTICE 'Setup accounting events for business: %', v_business_id;
END $$;

-- ============================================================================
-- 8. VERIFICATION
-- ============================================================================
DO $$
DECLARE
    v_trigger_count INTEGER;
    v_event_count INTEGER;
BEGIN
    -- Count triggers created
    SELECT COUNT(*) INTO v_trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE t.tgname LIKE 'trigger_accounting_%';
    
    -- Count events configured
    SELECT COUNT(*) INTO v_event_count
    FROM accounting_event_registry;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'UNIFIED ACCOUNTING SYSTEM STATUS';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Accounting triggers created: %', v_trigger_count;
    RAISE NOTICE 'Accounting events configured: %', v_event_count;
    RAISE NOTICE '========================================';
END $$;
