-- ============================================================================
-- MIGRATION: 1013_refund_system_complete_fix.sql
-- Purpose: Complete production-ready refund system with all accounting integration
-- FIXED: Properly handles trigger dependencies
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: SAFELY DROP DEPENDENT TRIGGER FIRST
-- ============================================================================

-- Drop the trigger that depends on the function
DROP TRIGGER IF EXISTS trigger_refund_accounting ON refunds;

-- Now we can safely drop and recreate the function
DROP FUNCTION IF EXISTS create_refund_journal_entry(UUID, UUID);
DROP FUNCTION IF EXISTS process_refund_accounting();

-- ============================================================================
-- SECTION 2: FIX THE CORE JOURNAL ENTRY FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION create_refund_journal_entry(
    p_refund_id UUID,
    p_user_id UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT, journal_entry_id UUID) AS $$
DECLARE
    -- Refund details
    v_business_id UUID;
    v_refund_number VARCHAR(50);
    v_total_refunded NUMERIC(15,2);
    v_subtotal_refunded NUMERIC(15,2);
    v_discount_refunded NUMERIC(15,2);
    v_tax_refunded NUMERIC(15,2);
    v_original_transaction_id UUID;
    v_original_transaction_type VARCHAR(20);
    v_refund_method VARCHAR(20);
    
    -- Journal entry variables
    v_journal_entry_id UUID;
    v_reference_number VARCHAR(50);
    v_line_count INTEGER := 0;
    
    -- Account IDs
    v_cash_account_id UUID;
    v_sales_returns_account_id UUID;
    v_discount_account_id UUID;
    v_tax_account_id UUID;
    
    -- Error handling
    v_error_message TEXT;
BEGIN
    -- Get refund details with EXPLICIT table alias to avoid ambiguity
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
    
    -- Check if already processed
    IF EXISTS (SELECT 1 FROM refunds WHERE id = p_refund_id AND journal_entry_id IS NOT NULL) THEN
        success := FALSE;
        message := 'Refund already has journal entry';
        journal_entry_id := NULL;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Get Cash/Bank account based on refund method
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
    
    -- Get Sales Returns account
    SELECT id INTO v_sales_returns_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id 
      AND account_code = '4150' 
      AND is_active = true;
    
    IF v_sales_returns_account_id IS NULL THEN
        -- Try to create it
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
    
    -- Get Discount account if discounts refunded
    IF v_discount_refunded > 0 THEN
        SELECT id INTO v_discount_account_id
        FROM chart_of_accounts
        WHERE business_id = v_business_id 
          AND account_code = '4110'
          AND is_active = true;
    END IF;
    
    -- Get Tax account if tax refunded
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
        v_business_id,
        CURRENT_DATE,
        v_reference_number,
        'REFUND',
        p_refund_id::TEXT,
        'Refund: ' || v_refund_number || ' for ' || v_original_transaction_type || ' transaction',
        v_total_refunded,
        'posted',
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;
    
    -- Create debit line: Sales Returns
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
        v_sales_returns_account_id,
        'debit',
        v_subtotal_refunded,
        'Refunded sales amount'
    );
    v_line_count := v_line_count + 1;
    
    -- Create debit line: Discounts (if any)
    IF v_discount_refunded > 0 AND v_discount_account_id IS NOT NULL THEN
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
            v_discount_account_id,
            'debit',
            v_discount_refunded,
            'Refunded discount amount'
        );
        v_line_count := v_line_count + 1;
    END IF;
    
    -- Create debit line: Tax (if any)
    IF v_tax_refunded > 0 AND v_tax_account_id IS NOT NULL THEN
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
            v_tax_account_id,
            'debit',
            v_tax_refunded,
            'Refunded tax amount'
        );
        v_line_count := v_line_count + 1;
    END IF;
    
    -- Create credit line: Cash/Bank
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
        v_total_refunded,
        'Refund payment to customer'
    );
    v_line_count := v_line_count + 1;
    
    -- Update refund with journal entry ID
    UPDATE refunds
    SET journal_entry_id = v_journal_entry_id,
        completed_at = NOW(),
        status = 'COMPLETED'
    WHERE id = p_refund_id;
    
    -- Log success to audit trail
    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        metadata,
        created_at
    ) VALUES (
        v_business_id,
        p_user_id,
        'accounting.refund.journal_entry.created',
        'refund',
        p_refund_id,
        '{}'::jsonb,
        jsonb_build_object(
            'refund_number', v_refund_number,
            'journal_entry_id', v_journal_entry_id,
            'total_refunded', v_total_refunded,
            'automated', true
        ),
        jsonb_build_object(
            'function', 'create_refund_journal_entry',
            'line_count', v_line_count
        ),
        NOW()
    );
    
    success := TRUE;
    message := 'Journal entry created with ' || v_line_count || ' lines';
    journal_entry_id := v_journal_entry_id;
    RETURN NEXT;
    
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    
    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        metadata,
        created_at
    ) VALUES (
        COALESCE(v_business_id, '00000000-0000-0000-0000-000000000000'::UUID),
        p_user_id,
        'accounting.refund.journal_entry.error',
        'refund',
        p_refund_id,
        '{}'::jsonb,
        jsonb_build_object(
            'error', v_error_message,
            'refund_number', v_refund_number
        ),
        jsonb_build_object(
            'function', 'create_refund_journal_entry',
            'sqlstate', SQLSTATE
        ),
        NOW()
    );
    
    success := FALSE;
    message := SQLERRM;
    journal_entry_id := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 3: CREATE UPDATED TRIGGER FUNCTION WITH TRANSACTION UPDATES
-- ============================================================================

CREATE OR REPLACE FUNCTION process_refund_accounting()
RETURNS TRIGGER AS $$
DECLARE
    v_result RECORD;
    v_updated_status TEXT;
    v_refund_items_count INTEGER;
BEGIN
    -- Only process when status changes to APPROVED
    IF NEW.status = 'APPROVED' AND (TG_OP = 'INSERT' OR OLD.status != 'APPROVED') THEN
        
        RAISE NOTICE '🔄 Processing refund accounting for: %', NEW.refund_number;
        
        -- Create journal entry
        SELECT * INTO v_result FROM create_refund_journal_entry(NEW.id, NEW.approved_by);
        
        IF NOT v_result.success THEN
            RAISE WARNING '⚠️ Refund accounting failed for %: %', NEW.refund_number, v_result.message;
            RETURN NEW;
        END IF;
        
        RAISE NOTICE '✅ Journal entry created: %', v_result.journal_entry_id;
        
        -- Update original transaction (POS or Invoice)
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
            
            RAISE NOTICE '📝 Updated POS transaction: refunded_amount=%, status=%',
                NEW.total_refunded, v_updated_status;
                
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
            
            RAISE NOTICE '📝 Updated Invoice: refunded_amount=%, status=%',
                NEW.total_refunded, v_updated_status;
        END IF;
        
        -- Process inventory reversal
        SELECT COUNT(*) INTO v_refund_items_count
        FROM refund_items
        WHERE refund_id = NEW.id;
        
        IF v_refund_items_count > 0 THEN
            PERFORM reverse_inventory_on_refund(NEW.id, NEW.approved_by);
            RAISE NOTICE '📦 Processed inventory reversal for % items', v_refund_items_count;
        END IF;
        
        -- Process discount reversal
        IF NEW.discount_refunded > 0 THEN
            PERFORM reverse_discounts_on_refund(NEW.id, NEW.approved_by);
            RAISE NOTICE '💰 Processed discount reversal: %', NEW.discount_refunded;
        END IF;
        
        -- Process tax reversal
        IF NEW.tax_refunded > 0 THEN
            PERFORM reverse_tax_on_refund(NEW.id, NEW.approved_by);
            RAISE NOTICE '🏛️ Processed tax reversal: %', NEW.tax_refunded;
        END IF;
        
        -- Log completion
        INSERT INTO audit_logs (
            business_id,
            user_id,
            action,
            resource_type,
            resource_id,
            old_values,
            new_values,
            metadata,
            created_at
        ) VALUES (
            NEW.business_id,
            NEW.approved_by,
            'refund.processed.complete',
            'refund',
            NEW.id,
            jsonb_build_object('old_status', OLD.status),
            jsonb_build_object(
                'new_status', NEW.status,
                'journal_entry_id', v_result.journal_entry_id,
                'refund_amount', NEW.total_refunded
            ),
            jsonb_build_object(
                'trigger', 'process_refund_accounting',
                'items_processed', v_refund_items_count,
                'discount_reversed', NEW.discount_refunded > 0,
                'tax_reversed', NEW.tax_refunded > 0
            ),
            NOW()
        );
        
        RAISE NOTICE '✅ Refund processing complete for: %', NEW.refund_number;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 4: RECREATE THE TRIGGER
-- ============================================================================

CREATE TRIGGER trigger_refund_accounting
    AFTER UPDATE OF status ON refunds
    FOR EACH ROW
    WHEN (NEW.status = 'APPROVED')
    EXECUTE FUNCTION process_refund_accounting();

-- ============================================================================
-- SECTION 5: INVENTORY REVERSAL FUNCTION
-- ============================================================================

-- First, update the transaction_type constraint to include 'refund'
ALTER TABLE inventory_transactions 
DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;

ALTER TABLE inventory_transactions 
ADD CONSTRAINT inventory_transactions_transaction_type_check 
CHECK (transaction_type::text = ANY (ARRAY[
    'purchase'::character varying, 
    'sale'::character varying, 
    'adjustment'::character varying, 
    'transfer'::character varying, 
    'write_off'::character varying,
    'refund'::character varying
]::text[]));

-- Create the inventory reversal function
CREATE OR REPLACE FUNCTION reverse_inventory_on_refund(
    p_refund_id UUID,
    p_user_id UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT, items_processed INTEGER) AS $$
DECLARE
    v_business_id UUID;
    v_refund_item RECORD;
    v_inventory_item_id UUID;
    v_current_stock NUMERIC(12,4);
    v_quantity_refunded NUMERIC(12,4);
    v_unit_cost NUMERIC(12,4);
    v_items_processed INTEGER := 0;
    v_error_message TEXT;
BEGIN
    -- Get business ID from refund
    SELECT business_id INTO v_business_id
    FROM refunds
    WHERE id = p_refund_id;
    
    IF NOT FOUND THEN
        success := FALSE;
        message := 'Refund not found: ' || p_refund_id;
        items_processed := 0;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Process each refund item
    FOR v_refund_item IN 
        SELECT 
            ri.product_id,
            ri.quantity_refunded,
            ri.unit_price
        FROM refund_items ri
        WHERE ri.refund_id = p_refund_id
          AND ri.product_id IS NOT NULL
    LOOP
        -- Get inventory item ID from product
        SELECT inventory_item_id INTO v_inventory_item_id
        FROM products
        WHERE id = v_refund_item.product_id
          AND business_id = v_business_id;
        
        IF v_inventory_item_id IS NOT NULL THEN
            -- Get current stock
            SELECT current_stock INTO v_current_stock
            FROM inventory_items
            WHERE id = v_inventory_item_id;
            
            v_quantity_refunded := v_refund_item.quantity_refunded;
            
            -- Get unit cost
            SELECT cost_price INTO v_unit_cost
            FROM inventory_items
            WHERE id = v_inventory_item_id;
            
            -- Update inventory quantity (increase stock)
            UPDATE inventory_items
            SET current_stock = current_stock + v_quantity_refunded,
                updated_at = NOW()
            WHERE id = v_inventory_item_id;
            
            -- Create inventory transaction
            INSERT INTO inventory_transactions (
                business_id,
                inventory_item_id,
                product_id,
                transaction_type,
                quantity,
                unit_cost,
                reference_type,
                reference_id,
                created_by,
                notes
            ) VALUES (
                v_business_id,
                v_inventory_item_id,
                v_refund_item.product_id,
                'refund',
                v_quantity_refunded,
                v_unit_cost,
                'refund',
                p_refund_id,
                p_user_id,
                'Inventory reversal from refund: ' || p_refund_id
            );
            
            v_items_processed := v_items_processed + 1;
            
            -- Log inventory change
            INSERT INTO audit_logs (
                business_id,
                user_id,
                action,
                resource_type,
                resource_id,
                old_values,
                new_values,
                metadata,
                created_at
            ) VALUES (
                v_business_id,
                p_user_id,
                'inventory.refund.reversal',
                'inventory_item',
                v_inventory_item_id,
                jsonb_build_object('stock_before', v_current_stock),
                jsonb_build_object('stock_after', v_current_stock + v_quantity_refunded),
                jsonb_build_object(
                    'refund_id', p_refund_id,
                    'quantity', v_quantity_refunded,
                    'unit_cost', v_unit_cost
                ),
                NOW()
            );
        END IF;
    END LOOP;
    
    success := TRUE;
    message := 'Processed ' || v_items_processed || ' inventory items';
    items_processed := v_items_processed;
    RETURN NEXT;
    
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    
    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        metadata,
        created_at
    ) VALUES (
        v_business_id,
        p_user_id,
        'inventory.refund.reversal.error',
        'refund',
        p_refund_id,
        '{}'::jsonb,
        jsonb_build_object('error', v_error_message),
        jsonb_build_object('function', 'reverse_inventory_on_refund'),
        NOW()
    );
    
    success := FALSE;
    message := SQLERRM;
    items_processed := v_items_processed;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 6: DISCOUNT REVERSAL FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION reverse_discounts_on_refund(
    p_refund_id UUID,
    p_user_id UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
    v_business_id UUID;
    v_refund RECORD;
    v_discount_allocation RECORD;
    v_reversal_allocation_id UUID;
    v_error_message TEXT;
BEGIN
    -- Get refund details
    SELECT business_id, original_transaction_id, original_transaction_type, discount_refunded
    INTO v_refund
    FROM refunds
    WHERE id = p_refund_id;
    
    IF NOT FOUND THEN
        success := FALSE;
        message := 'Refund not found: ' || p_refund_id;
        RETURN NEXT;
        RETURN;
    END IF;
    
    IF v_refund.discount_refunded = 0 THEN
        success := TRUE;
        message := 'No discounts to reverse';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Find discount allocations on the original transaction
    FOR v_discount_allocation IN 
        SELECT da.*
        FROM discount_allocations da
        WHERE (da.pos_transaction_id = v_refund.original_transaction_id
               OR da.invoice_id = v_refund.original_transaction_id)
          AND da.status = 'APPLIED'
          AND da.voided_at IS NULL
          AND da.is_refund_reversal = FALSE
    LOOP
        -- Create reversal allocation
        INSERT INTO discount_allocations (
            business_id,
            discount_rule_id,
            promotional_discount_id,
            invoice_id,
            pos_transaction_id,
            allocation_number,
            total_discount_amount,
            allocation_method,
            status,
            original_allocation_id,
            is_refund_reversal,
            refund_id,
            created_by
        ) VALUES (
            v_refund.business_id,
            v_discount_allocation.discount_rule_id,
            v_discount_allocation.promotional_discount_id,
            v_discount_allocation.invoice_id,
            v_discount_allocation.pos_transaction_id,
            'REV-' || v_discount_allocation.allocation_number,
            -v_discount_allocation.total_discount_amount,
            v_discount_allocation.allocation_method,
            'VOID',
            v_discount_allocation.id,
            TRUE,
            p_refund_id,
            p_user_id
        ) RETURNING id INTO v_reversal_allocation_id;
        
        -- Update original allocation
        UPDATE discount_allocations
        SET status = 'VOID',
            voided_by = p_user_id,
            voided_at = NOW(),
            void_reason = 'Refunded: ' || p_refund_id
        WHERE id = v_discount_allocation.id;
        
        -- Log discount reversal
        INSERT INTO audit_logs (
            business_id,
            user_id,
            action,
            resource_type,
            resource_id,
            old_values,
            new_values,
            metadata,
            created_at
        ) VALUES (
            v_refund.business_id,
            p_user_id,
            'discount.refund.reversal',
            'discount_allocation',
            v_discount_allocation.id,
            jsonb_build_object(
                'original_status', v_discount_allocation.status,
                'discount_amount', v_discount_allocation.total_discount_amount
            ),
            jsonb_build_object(
                'new_status', 'VOID',
                'reversal_id', v_reversal_allocation_id
            ),
            jsonb_build_object(
                'refund_id', p_refund_id,
                'reason', 'refund_processing'
            ),
            NOW()
        );
    END LOOP;
    
    success := TRUE;
    message := 'Discounts reversed successfully';
    RETURN NEXT;
    
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    
    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        metadata,
        created_at
    ) VALUES (
        v_refund.business_id,
        p_user_id,
        'discount.refund.reversal.error',
        'refund',
        p_refund_id,
        '{}'::jsonb,
        jsonb_build_object('error', v_error_message),
        jsonb_build_object('function', 'reverse_discounts_on_refund'),
        NOW()
    );
    
    success := FALSE;
    message := SQLERRM;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 7: TAX REVERSAL FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION reverse_tax_on_refund(
    p_refund_id UUID,
    p_user_id UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
    v_business_id UUID;
    v_refund RECORD;
    v_error_message TEXT;
BEGIN
    -- Get refund details
    SELECT business_id, original_transaction_id, original_transaction_type, tax_refunded
    INTO v_refund
    FROM refunds
    WHERE id = p_refund_id;
    
    IF NOT FOUND THEN
        success := FALSE;
        message := 'Refund not found: ' || p_refund_id;
        RETURN NEXT;
        RETURN;
    END IF;
    
    IF v_refund.tax_refunded = 0 THEN
        success := TRUE;
        message := 'No taxes to reverse';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Create tax reversal tracking table if not exists
    CREATE TABLE IF NOT EXISTS refund_tax_allocations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        refund_id UUID NOT NULL REFERENCES refunds(id),
        tax_allocation_id UUID,
        amount_reversed NUMERIC(15,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by UUID REFERENCES users(id)
    );
    
    -- Log tax reversal
    INSERT INTO refund_tax_allocations (
        refund_id,
        amount_reversed,
        created_by
    ) VALUES (
        p_refund_id,
        v_refund.tax_refunded,
        p_user_id
    );
    
    -- Log tax reversal to audit
    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        metadata,
        created_at
    ) VALUES (
        v_refund.business_id,
        p_user_id,
        'tax.refund.reversal',
        'refund',
        p_refund_id,
        '{}'::jsonb,
        jsonb_build_object('tax_amount_reversed', v_refund.tax_refunded),
        jsonb_build_object(
            'function', 'reverse_tax_on_refund',
            'transaction_type', v_refund.original_transaction_type
        ),
        NOW()
    );
    
    success := TRUE;
    message := 'Tax reversal recorded: ' || v_refund.tax_refunded;
    RETURN NEXT;
    
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    
    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        metadata,
        created_at
    ) VALUES (
        v_refund.business_id,
        p_user_id,
        'tax.refund.reversal.error',
        'refund',
        p_refund_id,
        '{}'::jsonb,
        jsonb_build_object('error', v_error_message),
        jsonb_build_object('function', 'reverse_tax_on_refund'),
        NOW()
    );
    
    success := FALSE;
    message := SQLERRM;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 8: VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_function_count INTEGER;
    v_trigger_exists BOOLEAN;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'REFUND SYSTEM FIX INSTALLATION STATUS';
    RAISE NOTICE '========================================';
    
    -- Check functions
    SELECT COUNT(*) INTO v_function_count
    FROM pg_proc
    WHERE proname IN (
        'create_refund_journal_entry',
        'process_refund_accounting',
        'reverse_inventory_on_refund',
        'reverse_discounts_on_refund',
        'reverse_tax_on_refund'
    );
    
    RAISE NOTICE 'Functions created: %', v_function_count;
    
    -- Check trigger
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trigger_refund_accounting' 
          AND tgrelid = 'refunds'::regclass
    ) INTO v_trigger_exists;
    
    RAISE NOTICE 'Trigger recreated: %', v_trigger_exists;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ REFUND SYSTEM FIX INSTALLED SUCCESSFULLY';
    RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
COMMIT;
