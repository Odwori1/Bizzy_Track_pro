-- 004_week4_invoice_templates_recurring.sql
-- WEEK 4: Advanced Invoicing System - Templates & Recurring Invoices

BEGIN;

-- =============================================================================
-- INVOICE TEMPLATES TABLE
-- =============================================================================

CREATE TABLE invoice_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    content JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT fk_invoice_templates_created_by 
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =============================================================================
-- RECURRING INVOICES TABLE
-- =============================================================================

CREATE TABLE recurring_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    template_id UUID REFERENCES invoice_templates(id) ON DELETE SET NULL,
    frequency VARCHAR(50) NOT NULL, -- 'weekly', 'monthly', 'quarterly', 'yearly'
    start_date DATE NOT NULL,
    end_date DATE,
    next_invoice_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'cancelled', 'completed'
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT fk_recurring_invoices_created_by 
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Invoice templates indexes
CREATE INDEX idx_invoice_templates_business_id ON invoice_templates(business_id);
CREATE INDEX idx_invoice_templates_created_by ON invoice_templates(created_by);
CREATE INDEX idx_invoice_templates_is_active ON invoice_templates(is_active);

-- Recurring invoices indexes
CREATE INDEX idx_recurring_invoices_business_id ON recurring_invoices(business_id);
CREATE INDEX idx_recurring_invoices_customer_id ON recurring_invoices(customer_id);
CREATE INDEX idx_recurring_invoices_template_id ON recurring_invoices(template_id);
CREATE INDEX idx_recurring_invoices_status ON recurring_invoices(status);
CREATE INDEX idx_recurring_invoices_next_date ON recurring_invoices(next_invoice_date);

-- =============================================================================
-- ROW LEVEL SECURITY ENABLEMENT
-- =============================================================================

ALTER TABLE invoice_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY invoice_templates_business_isolation ON invoice_templates
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY recurring_invoices_business_isolation ON recurring_invoices
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- =============================================================================
-- WEEK 4 PERMISSIONS
-- =============================================================================

-- Add Invoice Template permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
(NULL, 'invoice_template:view', 'invoicing', 'View invoice templates', 'invoice_template', 'view', true),
(NULL, 'invoice_template:create', 'invoicing', 'Create invoice templates', 'invoice_template', 'create', true),
(NULL, 'invoice_template:update', 'invoicing', 'Update invoice templates', 'invoice_template', 'update', true),
(NULL, 'invoice_template:delete', 'invoicing', 'Delete invoice templates', 'invoice_template', 'delete', true),

-- Add Recurring Invoice permissions
(NULL, 'recurring_invoice:view', 'invoicing', 'View recurring invoices', 'recurring_invoice', 'view', true),
(NULL, 'recurring_invoice:create', 'invoicing', 'Create recurring invoices', 'recurring_invoice', 'create', true),
(NULL, 'recurring_invoice:update', 'invoicing', 'Update recurring invoices', 'recurring_invoice', 'update', true),
(NULL, 'recurring_invoice:delete', 'invoicing', 'Delete recurring invoices', 'recurring_invoice', 'delete', true),
(NULL, 'recurring_invoice:pause', 'invoicing', 'Pause recurring invoices', 'recurring_invoice', 'pause', true),
(NULL, 'recurring_invoice:resume', 'invoicing', 'Resume recurring invoices', 'recurring_invoice', 'resume', true);

-- =============================================================================
-- UPDATE TRIGGERS
-- =============================================================================

CREATE TRIGGER update_invoice_templates_updated_at
    BEFORE UPDATE ON invoice_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recurring_invoices_updated_at
    BEFORE UPDATE ON recurring_invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
