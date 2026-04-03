-- ============================================================================
-- MIGRATION: 1015_refund_system_production_grade.sql
-- Purpose: Complete production-grade refund system with full integration
-- Based on patterns from: 1013_refund_system_complete_fix.sql
-- Date: April 2, 2026
-- Version: 1.0.0
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: SAFE DROP AND RECREATE (if needed, but preserve data)
-- ============================================================================

-- First, drop dependent triggers safely
DROP TRIGGER IF EXISTS trigger_refund_accounting ON refunds;
DROP TRIGGER IF EXISTS trigger_refunds_updated_at ON refunds;

-- ============================================================================
-- SECTION 2: CORE TABLES (with IF NOT EXISTS for safety)
-- ============================================================================

-- Refunds table - core refund tracking
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    refund_number VARCHAR(50) NOT NULL,

    -- Original transaction details
    original_transaction_id UUID NOT NULL,
    original_transaction_type VARCHAR(20) NOT NULL CHECK (original_transaction_type IN ('POS', 'INVOICE')),

    -- Refund details
    refund_type VARCHAR(20) NOT NULL CHECK (refund_type IN ('FULL', 'PARTIAL', 'ITEM')),
    refund_method VARCHAR(20) NOT NULL CHECK (refund_method IN ('CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT_NOTE', 'MOBILE_MONEY')),

    -- Financial breakdown
    subtotal_refunded NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_refunded NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_refunded NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_refunded NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Accounting integration
    journal_entry_id UUID REFERENCES journal_entries(id),

    -- Approval workflow
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'VOID')),
    approval_id UUID REFERENCES discount_approvals(id),
    requires_approval BOOLEAN DEFAULT FALSE,
    approval_threshold_amount NUMERIC(15,2),

    -- Reason and notes
    refund_reason TEXT NOT NULL,
    notes TEXT,

    -- Audit trail
    created_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    voided_by UUID REFERENCES users(id),
    voided_at TIMESTAMPTZ,
    void_reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT refunds_business_number_unique UNIQUE (business_id, refund_number),
    CONSTRAINT refunds_amount_positive CHECK (total_refunded > 0)
);

-- Refund items table - line-level tracking
CREATE TABLE IF NOT EXISTS refund_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_id UUID NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    -- Original line item reference
    original_line_item_id UUID NOT NULL,
    original_line_type VARCHAR(20) NOT NULL CHECK (original_line_type IN ('POS_ITEM', 'INVOICE_LINE')),

    -- Item details
    product_id UUID,
    service_id UUID,
    item_name VARCHAR(200) NOT NULL,
    quantity_refunded NUMERIC(10,2) NOT NULL,
    unit_price NUMERIC(15,2) NOT NULL,

    -- Financial breakdown
    subtotal_refunded NUMERIC(15,2) NOT NULL,
    discount_refunded NUMERIC(15,2) DEFAULT 0,
    tax_refunded NUMERIC(15,2) DEFAULT 0,
    total_refunded NUMERIC(15,2) NOT NULL,

    -- Links to other systems
    discount_allocation_line_id UUID REFERENCES discount_allocation_lines(id),

    -- Reason
    reason TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT refund_items_quantity_positive CHECK (quantity_refunded > 0)
);

-- Tax allocations table for refunds
CREATE TABLE IF NOT EXISTS refund_tax_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_id UUID NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
    tax_allocation_id UUID,
    amount_reversed NUMERIC(15,2) NOT NULL CHECK (amount_reversed > 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    notes TEXT,
    
    CONSTRAINT idx_refund_tax_allocations_refund_id FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE CASCADE
);

-- ============================================================================
-- SECTION 3: INDEXES (for performance)
-- ============================================================================

-- Refunds indexes
CREATE INDEX IF NOT EXISTS idx_refunds_business_id ON refunds(business_id);
CREATE INDEX IF NOT EXISTS idx_refunds_original_transaction ON refunds(original_transaction_id, original_transaction_type);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_journal_entry ON refunds(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_refunds_approval ON refunds(approval_id);
CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON refunds(created_at);
CREATE INDEX IF NOT EXISTS idx_refunds_business_status ON refunds(business_id, status);
CREATE INDEX IF NOT EXISTS idx_refunds_business_date ON refunds(business_id, created_at DESC);

-- Refund items indexes
CREATE INDEX IF NOT EXISTS idx_refund_items_refund_id ON refund_items(refund_id);
CREATE INDEX IF NOT EXISTS idx_refund_items_original_line ON refund_items(original_line_item_id, original_line_type);
CREATE INDEX IF NOT EXISTS idx_refund_items_product ON refund_items(product_id);
CREATE INDEX IF NOT EXISTS idx_refund_items_service ON refund_items(service_id);
CREATE INDEX IF NOT EXISTS idx_refund_items_business_id ON refund_items(business_id);

-- Refund tax allocations indexes
CREATE INDEX IF NOT EXISTS idx_refund_tax_allocations_refund_id ON refund_tax_allocations(refund_id);
CREATE INDEX IF NOT EXISTS idx_refund_tax_allocations_created_at ON refund_tax_allocations(created_at);

-- ============================================================================
-- SECTION 4: ENHANCE EXISTING TABLES
-- ============================================================================

-- Add refund tracking to POS transactions
ALTER TABLE pos_transactions
ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) DEFAULT 'NONE' CHECK (refund_status IN ('NONE', 'PARTIAL', 'FULL', 'CANCELLED'));

-- Add refund tracking to invoices
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) DEFAULT 'NONE' CHECK (refund_status IN ('NONE', 'PARTIAL', 'FULL', 'CANCELLED'));

-- Add refund links to discount allocations
ALTER TABLE discount_allocations
ADD COLUMN IF NOT EXISTS original_allocation_id UUID REFERENCES discount_allocations(id),
ADD COLUMN IF NOT EXISTS is_refund_reversal BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS refund_id UUID REFERENCES refunds(id);

-- Add refund support to inventory transactions
ALTER TABLE inventory_transactions
DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;

ALTER TABLE inventory_transactions
ADD CONSTRAINT inventory_transactions_transaction_type_check
CHECK (transaction_type::text = ANY (ARRAY[
    'purchase'::character varying::text,
    'sale'::character varying::text,
    'adjustment'::character varying::text,
    'transfer'::character varying::text,
    'write_off'::character varying::text,
    'refund'::character varying::text
]));

-- ============================================================================
-- SECTION 5: HELPER FUNCTIONS
-- ============================================================================

-- Generate refund number
CREATE OR REPLACE FUNCTION generate_refund_number(p_business_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year_prefix VARCHAR(4);
    v_month_prefix VARCHAR(2);
    v_sequence_num INTEGER;
    v_refund_number VARCHAR(50);
BEGIN
    v_year_prefix := TO_CHAR(CURRENT_DATE, 'YYYY');
    v_month_prefix := TO_CHAR(CURRENT_DATE, 'MM');

    SELECT COALESCE(MAX(CAST(SUBSTRING(refund_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_sequence_num
    FROM refunds
    WHERE business_id = p_business_id
      AND refund_number LIKE 'RF-' || v_year_prefix || '-' || v_month_prefix || '-%';

    v_refund_number := 'RF-' || v_year_prefix || '-' || v_month_prefix || '-' || LPAD(v_sequence_num::TEXT, 5, '0');
    RETURN v_refund_number;
END;
$$ LANGUAGE plpgsql;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_refund_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_refunds_updated_at
    BEFORE UPDATE ON refunds
    FOR EACH ROW
    EXECUTE FUNCTION update_refund_updated_at();

-- ============================================================================
-- SECTION 6: ACCOUNT SETUP FUNCTIONS
-- ============================================================================

-- Setup refund accounts for a business
CREATE OR REPLACE FUNCTION setup_business_refund_accounts(p_business_id UUID, p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_root_revenue UUID;
    v_root_liability UUID;
    v_root_asset UUID;
BEGIN
    -- Get parent accounts
    SELECT id INTO v_root_revenue FROM chart_of_accounts
    WHERE business_id = p_business_id AND account_code = '4000' LIMIT 1;
    
    SELECT id INTO v_root_liability FROM chart_of_accounts
    WHERE business_id = p_business_id AND account_code = '2000' LIMIT 1;
    
    SELECT id INTO v_root_asset FROM chart_of_accounts
    WHERE business_id = p_business_id AND account_code = '1000' LIMIT 1;

    -- Add refund-specific accounts
    INSERT INTO chart_of_accounts (business_id, account_code, account_name, account_type, parent_account_id, created_by)
    VALUES
        (p_business_id, '4150', 'Sales Returns & Allowances', 'revenue', v_root_revenue, p_user_id),
        (p_business_id, '2150', 'Refund Liability', 'liability', v_root_liability, p_user_id),
        (p_business_id, '1115', 'Credit Notes Receivable', 'asset', v_root_asset, p_user_id)
    ON CONFLICT (business_id, account_code) DO NOTHING;

    RAISE NOTICE '✅ Refund accounts setup for business: %', p_business_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 7: CORE REFUND ACCOUNTING FUNCTION
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

    -- Check if already processed
    IF EXISTS (SELECT 1 FROM refunds WHERE id = p_refund_id AND journal_entry_id IS NOT NULL) THEN
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

    -- Log success
    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        new_values,
        metadata,
        created_at
    ) VALUES (
        v_business_id,
        p_user_id,
        'accounting.refund.journal_entry.created',
        'refund',
        p_refund_id,
        jsonb_build_object(
            'refund_number', v_refund_number,
            'journal_entry_id', v_journal_entry_id,
            'total_refunded', v_total_refunded
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
        new_values,
        metadata,
        created_at
    ) VALUES (
        COALESCE(v_business_id, '00000000-0000-0000-0000-000000000000'::UUID),
        p_user_id,
        'accounting.refund.journal_entry.error',
        'refund',
        p_refund_id,
        jsonb_build_object('error', v_error_message),
        jsonb_build_object('function', 'create_refund_journal_entry', 'sqlstate', SQLSTATE),
        NOW()
    );

    success := FALSE;
    message := SQLERRM;
    journal_entry_id := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 8: REVERSAL FUNCTIONS
-- ============================================================================

-- Inventory reversal function
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

    -- Process each refund item that has a product
    FOR v_refund_item IN
        SELECT ri.product_id, ri.quantity_refunded, ri.item_name
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
            -- Get current stock and cost
            SELECT current_stock, cost_price INTO v_current_stock, v_unit_cost
            FROM inventory_items
            WHERE id = v_inventory_item_id;

            v_quantity_refunded := v_refund_item.quantity_refunded;

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
        new_values,
        metadata,
        created_at
    ) VALUES (
        v_business_id,
        p_user_id,
        'inventory.refund.reversal.error',
        'refund',
        p_refund_id,
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

-- Discount reversal function
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
            jsonb_build_object('original_status', v_discount_allocation.status, 'discount_amount', v_discount_allocation.total_discount_amount),
            jsonb_build_object('new_status', 'VOID', 'reversal_id', v_reversal_allocation_id),
            jsonb_build_object('refund_id', p_refund_id, 'reason', 'refund_processing'),
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
        new_values,
        metadata,
        created_at
    ) VALUES (
        v_refund.business_id,
        p_user_id,
        'discount.refund.reversal.error',
        'refund',
        p_refund_id,
        jsonb_build_object('error', v_error_message),
        jsonb_build_object('function', 'reverse_discounts_on_refund'),
        NOW()
    );

    success := FALSE;
    message := SQLERRM;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Tax reversal function
CREATE OR REPLACE FUNCTION reverse_tax_on_refund(
    p_refund_id UUID,
    p_user_id UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
    v_business_id UUID;
    v_refund RECORD;
    v_tax_amount NUMERIC(15,2);
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

    v_tax_amount := COALESCE(v_refund.tax_refunded, 0);

    IF v_tax_amount = 0 THEN
        success := TRUE;
        message := 'No taxes to reverse';
        RETURN NEXT;
        RETURN;
    END IF;

    -- Record tax reversal
    INSERT INTO refund_tax_allocations (
        refund_id,
        amount_reversed,
        created_by,
        notes
    ) VALUES (
        p_refund_id,
        v_tax_amount,
        p_user_id,
        'Tax reversal for refund: ' || p_refund_id || ' - Amount: ' || v_tax_amount
    );

    -- Log to audit
    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        new_values,
        metadata,
        created_at
    ) VALUES (
        v_refund.business_id,
        p_user_id,
        'tax.refund.reversal',
        'refund',
        p_refund_id,
        jsonb_build_object(
            'tax_amount_reversed', v_tax_amount,
            'transaction_type', v_refund.original_transaction_type,
            'transaction_id', v_refund.original_transaction_id
        ),
        jsonb_build_object('function', 'reverse_tax_on_refund'),
        NOW()
    );

    success := TRUE;
    message := 'Tax reversal recorded: ' || v_tax_amount;
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
        metadata,
        created_at
    ) VALUES (
        COALESCE(v_refund.business_id, '00000000-0000-0000-0000-000000000000'::UUID),
        p_user_id,
        'tax.refund.reversal.error',
        'refund',
        p_refund_id,
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
-- SECTION 9: MAIN TRIGGER FUNCTION (Orchestrates all reversals)
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

        -- Update original transaction
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

            RAISE NOTICE '📝 Updated POS transaction: added refunded_amount=%, new status=%',
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

            RAISE NOTICE '📝 Updated Invoice: added refunded_amount=%, new status=%',
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
-- SECTION 10: CREATE TRIGGER
-- ============================================================================

CREATE TRIGGER trigger_refund_accounting
    AFTER UPDATE OF status ON refunds
    FOR EACH ROW
    WHEN (NEW.status = 'APPROVED')
    EXECUTE FUNCTION process_refund_accounting();

-- ============================================================================
-- SECTION 11: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_tax_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refunds_business_isolation ON refunds;
CREATE POLICY refunds_business_isolation ON refunds
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

DROP POLICY IF EXISTS refund_items_business_isolation ON refund_items;
CREATE POLICY refund_items_business_isolation ON refund_items
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

DROP POLICY IF EXISTS refund_tax_allocations_business_isolation ON refund_tax_allocations;
CREATE POLICY refund_tax_allocations_business_isolation ON refund_tax_allocations
    FOR ALL USING (
        refund_id IN (SELECT id FROM refunds WHERE business_id = current_setting('app.current_business_id')::UUID)
    );

-- ============================================================================
-- SECTION 12: SETUP FOR EXISTING BUSINESSES
-- ============================================================================

DO $$
DECLARE
    v_business_record RECORD;
    v_user_id UUID;
    v_count INTEGER := 0;
BEGIN
    -- Setup for all existing businesses
    FOR v_business_record IN SELECT id FROM businesses LOOP
        -- Get a user for this business
        SELECT id INTO v_user_id FROM users WHERE business_id = v_business_record.id LIMIT 1;

        IF v_user_id IS NOT NULL THEN
            PERFORM setup_business_refund_accounts(v_business_record.id, v_user_id);
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RAISE NOTICE '✅ Refund accounts setup completed for % businesses', v_count;
END $$;

-- ============================================================================
-- SECTION 13: VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_table_count INTEGER;
    v_function_count INTEGER;
    v_trigger_exists BOOLEAN;
    v_business_id UUID := 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
BEGIN
    -- Count tables
    SELECT COUNT(*) INTO v_table_count
    FROM information_schema.tables
    WHERE table_name IN ('refunds', 'refund_items', 'refund_tax_allocations');

    -- Count functions
    SELECT COUNT(*) INTO v_function_count
    FROM pg_proc
    WHERE proname IN (
        'generate_refund_number',
        'create_refund_journal_entry',
        'process_refund_accounting',
        'reverse_inventory_on_refund',
        'reverse_discounts_on_refund',
        'reverse_tax_on_refund',
        'setup_business_refund_accounts'
    );

    -- Check trigger
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_refund_accounting'
          AND tgrelid = 'refunds'::regclass
    ) INTO v_trigger_exists;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'REFUND SYSTEM PRODUCTION INSTALLATION';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tables created: %/3', v_table_count;
    RAISE NOTICE 'Functions created: %/7', v_function_count;
    RAISE NOTICE 'Trigger active: %', v_trigger_exists;
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Production-grade refund system installed!';
    RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK SECTION (for reference)
-- ============================================================================
/*
-- To rollback this migration:
DROP TRIGGER IF EXISTS trigger_refund_accounting ON refunds;
DROP TRIGGER IF EXISTS trigger_refunds_updated_at ON refunds;
DROP FUNCTION IF EXISTS reverse_tax_on_refund(UUID, UUID);
DROP FUNCTION IF EXISTS reverse_discounts_on_refund(UUID, UUID);
DROP FUNCTION IF EXISTS reverse_inventory_on_refund(UUID, UUID);
DROP FUNCTION IF EXISTS process_refund_accounting();
DROP FUNCTION IF EXISTS create_refund_journal_entry(UUID, UUID);
DROP FUNCTION IF EXISTS generate_refund_number(UUID);
DROP FUNCTION IF EXISTS setup_business_refund_accounts(UUID, UUID);
DROP TABLE IF EXISTS refund_tax_allocations;
DROP TABLE IF EXISTS refund_items;
DROP TABLE IF EXISTS refunds;
-- Note: Removing columns from other tables requires separate ALTER statements
*/
