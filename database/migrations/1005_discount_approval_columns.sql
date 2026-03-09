-- File: 1005_discount_approval_columns.sql
-- PURPOSE: Add missing columns for discount approval workflow
-- CREATED: March 3, 2026

-- =====================================================
-- 1. ADD MISSING COLUMNS TO pos_transactions
-- =====================================================
ALTER TABLE pos_transactions 
ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES discount_approvals(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pos_transactions_requires_approval ON pos_transactions(requires_approval);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_approval_id ON pos_transactions(approval_id);

-- =====================================================
-- 2. ADD MISSING COLUMNS TO invoices
-- =====================================================
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES discount_approvals(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoices_requires_approval ON invoices(requires_approval);
CREATE INDEX IF NOT EXISTS idx_invoices_approval_id ON invoices(approval_id);

-- =====================================================
-- 3. ENHANCE discount_approvals TABLE
-- =====================================================
ALTER TABLE discount_approvals
ADD COLUMN IF NOT EXISTS discount_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS discount_value NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(20) CHECK (transaction_type IN ('POS', 'INVOICE')),
ADD COLUMN IF NOT EXISTS metadata JSONB,
ADD COLUMN IF NOT EXISTS items JSONB,
ADD COLUMN IF NOT EXISTS calculated_discount NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_discount_approvals_pos_transaction_id ON discount_approvals(pos_transaction_id);
CREATE INDEX IF NOT EXISTS idx_discount_approvals_invoice_id ON discount_approvals(invoice_id);
CREATE INDEX IF NOT EXISTS idx_discount_approvals_status ON discount_approvals(status);
CREATE INDEX IF NOT EXISTS idx_discount_approvals_transaction_type ON discount_approvals(transaction_type);

-- =====================================================
-- 4. ENSURE discount_allocation_lines HAS BOTH COLUMNS
-- =====================================================
-- Make sure both columns exist (they should, but just in case)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'discount_allocation_lines' 
        AND column_name = 'pos_transaction_item_id'
    ) THEN
        ALTER TABLE discount_allocation_lines ADD COLUMN pos_transaction_item_id UUID REFERENCES pos_transaction_items(id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'discount_allocation_lines' 
        AND column_name = 'invoice_line_item_id'
    ) THEN
        ALTER TABLE discount_allocation_lines ADD COLUMN invoice_line_item_id UUID REFERENCES invoice_line_items(id);
    END IF;
END $$;

-- =====================================================
-- 5. ADD COMMENT DOCUMENTATION
-- =====================================================
COMMENT ON COLUMN pos_transactions.requires_approval IS 'Indicates if this transaction requires discount approval';
COMMENT ON COLUMN pos_transactions.approval_id IS 'Reference to the discount approval record';
COMMENT ON COLUMN invoices.requires_approval IS 'Indicates if this invoice requires discount approval';
COMMENT ON COLUMN invoices.approval_id IS 'Reference to the discount approval record';
COMMENT ON COLUMN discount_approvals.transaction_type IS 'Type of transaction (POS or INVOICE)';
COMMENT ON COLUMN discount_approvals.metadata IS 'Additional metadata for the approval request';
COMMENT ON COLUMN discount_approvals.items IS 'Line items that were in the transaction';
COMMENT ON COLUMN discount_approvals.calculated_discount IS 'The calculated discount amount';
