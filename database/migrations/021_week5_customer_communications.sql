-- ============================================================================
-- WEEK 5: CUSTOMER COMMUNICATIONS SYSTEM
-- ============================================================================

CREATE TABLE customer_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    
    -- Communication details
    type VARCHAR(50) NOT NULL CHECK (type IN ('email', 'sms', 'phone', 'in_person', 'note')),
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    subject VARCHAR(200),
    content TEXT NOT NULL,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'delivered', 'read', 'failed')),
    
    -- Metadata
    related_job_id UUID REFERENCES jobs(id),
    related_invoice_id UUID REFERENCES invoices(id),
    
    -- Timestamps
    scheduled_for TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE customer_communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_communications_business_isolation ON customer_communications 
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- PERMISSIONS FOR CUSTOMER COMMUNICATIONS
-- ============================================================================

INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
(NULL, 'customer_communication:create', 'customer', 'Create customer communications', 'customer_communication', 'create', true),
(NULL, 'customer_communication:read', 'customer', 'View customer communications', 'customer_communication', 'read', true),
(NULL, 'customer_communication:update', 'customer', 'Update customer communications', 'customer_communication', 'update', true),
(NULL, 'customer_communication:delete', 'customer', 'Delete customer communications', 'customer_communication', 'delete', true);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_customer_comm_customer_id ON customer_communications(customer_id);
CREATE INDEX idx_customer_comm_business_id ON customer_communications(business_id);
CREATE INDEX idx_customer_comm_type ON customer_communications(type);
CREATE INDEX idx_customer_comm_created_at ON customer_communications(created_at);
CREATE INDEX idx_customer_comm_related_job ON customer_communications(related_job_id);
CREATE INDEX idx_customer_comm_related_invoice ON customer_communications(related_invoice_id);

