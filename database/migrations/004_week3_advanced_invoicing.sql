-- ============================================================================
-- WEEK 3: ADVANCED INVOICING SYSTEM
-- ============================================================================

-- Invoices table for professional invoicing
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Invoice identification
    invoice_number VARCHAR(50) NOT NULL,
    invoice_date TIMESTAMPTZ DEFAULT NOW(),
    due_date TIMESTAMPTZ,
    
    -- Linked entities
    job_id UUID REFERENCES jobs(id),
    customer_id UUID REFERENCES customers(id) NOT NULL,
    
    -- Financial details
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_paid DECIMAL(12,2) DEFAULT 0,
    balance_due DECIMAL(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    
    -- Payment status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
    payment_method VARCHAR(50),
    payment_date TIMESTAMPTZ,
    
    -- Invoice details
    notes TEXT,
    terms TEXT,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(business_id, invoice_number)
);

-- Invoice line items for detailed breakdown
CREATE TABLE invoice_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    
    -- Service details
    service_id UUID REFERENCES services(id),
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    
    -- Line item details
    tax_rate DECIMAL(5,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price * tax_rate / 100) STORED,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_business_isolation ON invoices FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY invoice_items_business_isolation ON invoice_line_items FOR ALL USING (
    invoice_id IN (SELECT id FROM invoices WHERE business_id = current_setting('app.current_business_id')::UUID)
);

-- ============================================================================
-- PERMISSIONS FOR INVOICE MANAGEMENT
-- ============================================================================

-- Add invoice permissions to system permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- Invoice permissions
(NULL, 'invoice:create', 'financial', 'Create invoices', 'invoice', 'create', true),
(NULL, 'invoice:read', 'financial', 'View invoices', 'invoice', 'read', true),
(NULL, 'invoice:update', 'financial', 'Update invoice details', 'invoice', 'update', true),
(NULL, 'invoice:delete', 'financial', 'Delete invoices', 'invoice', 'delete', true),
(NULL, 'invoice:send', 'financial', 'Send invoices to customers', 'invoice', 'send', true),
(NULL, 'invoice:payment:record', 'financial', 'Record invoice payments', 'invoice', 'payment_record', true);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_invoices_business_status ON invoices(business_id, status);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_job_id ON invoices(job_id);
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX idx_invoice_items_invoice_id ON invoice_line_items(invoice_id);
