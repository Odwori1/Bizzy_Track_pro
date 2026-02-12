-- Migration: 725_complete_wht_certificate_system.sql
-- Description: Complete the WHT certificate system by adding missing tables and enhancements
-- Created: February 6, 2026

BEGIN;

-- ============================================================================
-- 1. CREATE MISSING TABLES
-- ============================================================================

-- Table: wht_certificate_items
-- Stores individual line items for each WHT certificate
CREATE TABLE IF NOT EXISTS wht_certificate_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    certificate_id UUID NOT NULL REFERENCES withholding_tax_certificates(id) ON DELETE CASCADE,
    
    -- Transaction details
    transaction_id UUID REFERENCES transactions(id),
    transaction_date DATE NOT NULL,
    
    -- Item description
    description TEXT NOT NULL,
    invoice_number VARCHAR(100),
    
    -- Amount details
    amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
    wht_rate DECIMAL(5,2) NOT NULL CHECK (wht_rate >= 0 AND wht_rate <= 100),
    wht_amount DECIMAL(15,2) NOT NULL CHECK (wht_amount >= 0),
    
    -- Tax details
    tax_type_code VARCHAR(20) NOT NULL,
    tax_type_id UUID REFERENCES tax_types(id),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: wht_certificate_status_history
-- Tracks status changes for audit trail
CREATE TABLE IF NOT EXISTS wht_certificate_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    certificate_id UUID NOT NULL REFERENCES withholding_tax_certificates(id) ON DELETE CASCADE,
    
    -- Status change details
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    changed_by UUID REFERENCES users(id),
    change_reason TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: wht_certificate_templates
-- Stores certificate templates for different business needs
CREATE TABLE IF NOT EXISTS wht_certificate_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Template details
    template_name VARCHAR(100) NOT NULL,
    template_type VARCHAR(50) NOT NULL, -- 'URA_FORM_WHT3', 'CUSTOMER_CERTIFICATE', 'SIMPLIFIED'
    language VARCHAR(10) DEFAULT 'en',
    
    -- Template content
    header_content TEXT,
    body_content TEXT,
    footer_content TEXT,
    styles JSONB,
    
    -- Business branding
    include_business_logo BOOLEAN DEFAULT true,
    include_business_address BOOLEAN DEFAULT true,
    include_business_tin BOOLEAN DEFAULT true,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(business_id, template_name)
);

-- ============================================================================
-- 2. ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add missing columns to withholding_tax_certificates
ALTER TABLE withholding_tax_certificates 
ADD COLUMN IF NOT EXISTS certificate_type VARCHAR(20) DEFAULT 'CUSTOMER_CERTIFICATE',
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES wht_certificate_templates(id),
ADD COLUMN IF NOT EXISTS pdf_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS emailed_to VARCHAR(255),
ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS email_status VARCHAR(20),
ADD COLUMN IF NOT EXISTS email_error TEXT,
ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS void_reason TEXT,
ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES users(id);

-- ============================================================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Indexes for wht_certificate_items
CREATE INDEX IF NOT EXISTS idx_wht_certificate_items_certificate_id 
ON wht_certificate_items(certificate_id);

CREATE INDEX IF NOT EXISTS idx_wht_certificate_items_transaction_id 
ON wht_certificate_items(transaction_id);

CREATE INDEX IF NOT EXISTS idx_wht_certificate_items_transaction_date 
ON wht_certificate_items(transaction_date);

-- Indexes for wht_certificate_status_history
CREATE INDEX IF NOT EXISTS idx_wht_certificate_status_history_certificate_id 
ON wht_certificate_status_history(certificate_id);

CREATE INDEX IF NOT EXISTS idx_wht_certificate_status_history_created_at 
ON wht_certificate_status_history(created_at);

-- Indexes for wht_certificate_templates
CREATE INDEX IF NOT EXISTS idx_wht_certificate_templates_business_id 
ON wht_certificate_templates(business_id);

CREATE INDEX IF NOT EXISTS idx_wht_certificate_templates_template_type 
ON wht_certificate_templates(template_type);

CREATE INDEX IF NOT EXISTS idx_wht_certificate_templates_is_active 
ON wht_certificate_templates(is_active);

-- Additional indexes for withholding_tax_certificates
CREATE INDEX IF NOT EXISTS idx_withholding_tax_certificates_supplier_id 
ON withholding_tax_certificates(supplier_id);

CREATE INDEX IF NOT EXISTS idx_withholding_tax_certificates_invoice_id 
ON withholding_tax_certificates(invoice_id);

CREATE INDEX IF NOT EXISTS idx_withholding_tax_certificates_tax_period 
ON withholding_tax_certificates(tax_period);

CREATE INDEX IF NOT EXISTS idx_withholding_tax_certificates_status 
ON withholding_tax_certificates(status);

-- ============================================================================
-- 4. CREATE RLS (ROW LEVEL SECURITY) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE wht_certificate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE wht_certificate_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE wht_certificate_templates ENABLE ROW LEVEL SECURITY;

-- Ensure withholding_tax_certificates has RLS enabled
ALTER TABLE withholding_tax_certificates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for wht_certificate_items
DROP POLICY IF EXISTS wht_certificate_items_isolation_policy ON wht_certificate_items;
CREATE POLICY wht_certificate_items_isolation_policy ON wht_certificate_items
    USING (EXISTS (
        SELECT 1 FROM withholding_tax_certificates wc 
        WHERE wc.id = wht_certificate_items.certificate_id 
        AND wc.business_id = current_setting('app.current_business_id')::UUID
    ));

-- Create RLS policies for wht_certificate_status_history
DROP POLICY IF EXISTS wht_certificate_status_history_isolation_policy ON wht_certificate_status_history;
CREATE POLICY wht_certificate_status_history_isolation_policy ON wht_certificate_status_history
    USING (EXISTS (
        SELECT 1 FROM withholding_tax_certificates wc 
        WHERE wc.id = wht_certificate_status_history.certificate_id 
        AND wc.business_id = current_setting('app.current_business_id')::UUID
    ));

-- Create RLS policies for wht_certificate_templates
DROP POLICY IF EXISTS wht_certificate_templates_isolation_policy ON wht_certificate_templates;
CREATE POLICY wht_certificate_templates_isolation_policy ON wht_certificate_templates
    USING (business_id = current_setting('app.current_business_id')::UUID);

-- Ensure withholding_tax_certificates has proper RLS policy
DROP POLICY IF EXISTS withholding_tax_certificates_isolation_policy ON withholding_tax_certificates;
CREATE POLICY withholding_tax_certificates_isolation_policy ON withholding_tax_certificates
    USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- 5. CREATE CERTIFICATE NUMBERING FUNCTION
-- ============================================================================

-- Function to generate certificate numbers: WHT/YYYY/MM/001
CREATE OR REPLACE FUNCTION generate_wht_certificate_number(
    p_business_id UUID,
    p_certificate_date DATE DEFAULT CURRENT_DATE
)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year VARCHAR(4);
    v_month VARCHAR(2);
    v_sequence INTEGER;
    v_certificate_number VARCHAR(50);
BEGIN
    -- Extract year and month
    v_year := EXTRACT(YEAR FROM p_certificate_date)::VARCHAR;
    v_month := LPAD(EXTRACT(MONTH FROM p_certificate_date)::VARCHAR, 2, '0');
    
    -- Get next sequence for this business, year, month
    SELECT COALESCE(MAX(CAST(SPLIT_PART(certificate_number, '/', 4) AS INTEGER)), 0) + 1
    INTO v_sequence
    FROM withholding_tax_certificates
    WHERE business_id = p_business_id
        AND certificate_number LIKE 'WHT/' || v_year || '/' || v_month || '/%';
    
    -- Generate certificate number
    v_certificate_number := 'WHT/' || v_year || '/' || v_month || '/' || LPAD(v_sequence::VARCHAR, 3, '0');
    
    RETURN v_certificate_number;
EXCEPTION
    WHEN OTHERS THEN
        -- Fallback: use timestamp-based number
        v_certificate_number := 'WHT/' || v_year || '/' || v_month || '/' || 
            LPAD(EXTRACT(EPOCH FROM NOW())::INTEGER % 1000::VARCHAR, 3, '0');
        RETURN v_certificate_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. CREATE TRIGGERS FOR AUTO-UPDATES
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_wht_certificate_items_updated_at ON wht_certificate_items;
CREATE TRIGGER update_wht_certificate_items_updated_at
    BEFORE UPDATE ON wht_certificate_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_wht_certificate_templates_updated_at ON wht_certificate_templates;
CREATE TRIGGER update_wht_certificate_templates_updated_at
    BEFORE UPDATE ON wht_certificate_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. INSERT DEFAULT TEMPLATES FOR EXISTING BUSINESSES
-- ============================================================================

-- Insert default URA Form WHT 3 template for each business
INSERT INTO wht_certificate_templates (
    business_id,
    template_name,
    template_type,
    language,
    header_content,
    body_content,
    footer_content,
    styles,
    is_active,
    is_default
)
SELECT 
    b.id as business_id,
    'URA Form WHT 3' as template_name,
    'URA_FORM_WHT3' as template_type,
    'en' as language,
    '<div style="text-align: center; font-family: Arial, sans-serif;">
        <h2>UGANDA REVENUE AUTHORITY</h2>
        <h3>WITHHOLDING TAX CERTIFICATE</h3>
        <h4>FORM WHT 3</h4>
    </div>' as header_content,
    '<div style="font-family: Arial, sans-serif; font-size: 12px;">
        <p><strong>Certificate No:</strong> {{certificate_number}}</p>
        <p><strong>Date of Issue:</strong> {{issued_date}}</p>
        <p><strong>Tax Period:</strong> {{tax_period}}</p>
        
        <h4>WITHHOLDING AGENT DETAILS</h4>
        <p><strong>Name:</strong> {{business_name}}</p>
        <p><strong>TIN:</strong> {{business_tin}}</p>
        <p><strong>Address:</strong> {{business_address}}</p>
        
        <h4>RECIPIENT DETAILS</h4>
        <p><strong>Name:</strong> {{supplier_name}}</p>
        <p><strong>TIN:</strong> {{supplier_tin}}</p>
        <p><strong>Address:</strong> {{supplier_address}}</p>
        
        <h4>TRANSACTION DETAILS</h4>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
            <thead>
                <tr>
                    <th style="border: 1px solid #000; padding: 5px;">Date</th>
                    <th style="border: 1px solid #000; padding: 5px;">Description</th>
                    <th style="border: 1px solid #000; padding: 5px;">Invoice No</th>
                    <th style="border: 1px solid #000; padding: 5px;">Amount (UGX)</th>
                    <th style="border: 1px solid #000; padding: 5px;">WHT Rate (%)</th>
                    <th style="border: 1px solid #000; padding: 5px;">WHT Amount (UGX)</th>
                </tr>
            </thead>
            <tbody>
                {{#items}}
                <tr>
                    <td style="border: 1px solid #000; padding: 5px;">{{transaction_date}}</td>
                    <td style="border: 1px solid #000; padding: 5px;">{{description}}</td>
                    <td style="border: 1px solid #000; padding: 5px;">{{invoice_number}}</td>
                    <td style="border: 1px solid #000; padding: 5px; text-align: right;">{{amount_formatted}}</td>
                    <td style="border: 1px solid #000; padding: 5px; text-align: right;">{{wht_rate}}</td>
                    <td style="border: 1px solid #000; padding: 5px; text-align: right;">{{wht_amount_formatted}}</td>
                </tr>
                {{/items}}
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="3" style="border: 1px solid #000; padding: 5px; text-align: right;"><strong>TOTAL:</strong></td>
                    <td style="border: 1px solid #000; padding: 5px; text-align: right;"><strong>{{total_amount_formatted}}</strong></td>
                    <td style="border: 1px solid #000; padding: 5px;"></td>
                    <td style="border: 1px solid #000; padding: 5px; text-align: right;"><strong>{{total_wht_amount_formatted}}</strong></td>
                </tr>
            </tfoot>
        </table>
        
        <p><strong>Total Service Amount:</strong> {{total_amount_formatted}} UGX</p>
        <p><strong>Total Withholding Tax:</strong> {{total_wht_amount_formatted}} UGX</p>
        <p><strong>Amount in Words:</strong> {{amount_in_words}}</p>
    </div>' as body_content,
    '<div style="font-family: Arial, sans-serif; font-size: 10px; text-align: center; margin-top: 20px;">
        <p style="border-top: 1px solid #000; padding-top: 10px;">
            <strong>Authorized Signatory:</strong> ___________________________<br>
            <strong>Name:</strong> _________________________________________<br>
            <strong>Designation:</strong> _________________________________<br>
            <strong>Stamp & Date:</strong> ________________________________<br>
        </p>
        <p style="margin-top: 10px;">
            <em>This is a computer-generated certificate and does not require a manual signature.</em><br>
            <em>Generated on: {{generated_date}}</em>
        </p>
    </div>' as footer_content,
    '{"fontFamily": "Arial", "fontSize": "12px", "lineHeight": "1.5", "margin": "20px"}'::JSONB as styles,
    true as is_active,
    true as is_default
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1 FROM wht_certificate_templates wt 
    WHERE wt.business_id = b.id AND wt.template_type = 'URA_FORM_WHT3'
);

-- Insert default Customer Certificate template for each business
INSERT INTO wht_certificate_templates (
    business_id,
    template_name,
    template_type,
    language,
    header_content,
    body_content,
    footer_content,
    styles,
    is_active,
    is_default
)
SELECT 
    b.id as business_id,
    'Customer Certificate' as template_name,
    'CUSTOMER_CERTIFICATE' as template_type,
    'en' as language,
    '<div style="text-align: center; font-family: Arial, sans-serif; border-bottom: 2px solid #000; padding-bottom: 10px;">
        <h1 style="color: #2c3e50; margin-bottom: 5px;">{{business_name}}</h1>
        <h2 style="color: #34495e; margin-top: 0;">WITHHOLDING TAX CERTIFICATE</h2>
        <p style="color: #7f8c8d;">Certificate No: <strong>{{certificate_number}}</strong></p>
    </div>' as header_content,
    '<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">
        <p>This is to certify that <strong>{{business_name}}</strong> (TIN: {{business_tin}}) has withheld tax from payments made to:</p>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Recipient:</strong> {{supplier_name}}</p>
            <p><strong>TIN:</strong> {{supplier_tin}}</p>
            <p><strong>Period:</strong> {{tax_period}}</p>
        </div>
        
        <h3 style="color: #2c3e50; border-bottom: 1px solid #ecf0f1; padding-bottom: 5px;">Transaction Details</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <thead style="background: #34495e; color: white;">
                <tr>
                    <th style="padding: 10px; text-align: left;">Date</th>
                    <th style="padding: 10px; text-align: left;">Description</th>
                    <th style="padding: 10px; text-align: right;">Amount</th>
                    <th style="padding: 10px; text-align: right;">WHT Rate</th>
                    <th style="padding: 10px; text-align: right;">WHT Amount</th>
                </tr>
            </thead>
            <tbody>
                {{#items}}
                <tr style="border-bottom: 1px solid #ecf0f1;">
                    <td style="padding: 8px;">{{transaction_date}}</td>
                    <td style="padding: 8px;">{{description}}</td>
                    <td style="padding: 8px; text-align: right;">{{amount_formatted}}</td>
                    <td style="padding: 8px; text-align: right;">{{wht_rate}}%</td>
                    <td style="padding: 8px; text-align: right;">{{wht_amount_formatted}}</td>
                </tr>
                {{/items}}
            </tbody>
            <tfoot style="background: #f8f9fa; font-weight: bold;">
                <tr>
                    <td colspan="2" style="padding: 10px; text-align: right;">TOTAL</td>
                    <td style="padding: 10px; text-align: right;">{{total_amount_formatted}}</td>
                    <td style="padding: 10px; text-align: right;"></td>
                    <td style="padding: 10px; text-align: right;">{{total_wht_amount_formatted}}</td>
                </tr>
            </tfoot>
        </table>
        
        <div style="background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Summary:</strong></p>
            <p>Total Service Amount: <strong>{{total_amount_formatted}}</strong></p>
            <p>Total Withholding Tax Deducted: <strong>{{total_wht_amount_formatted}}</strong></p>
            <p>Tax Period: <strong>{{tax_period}}</strong></p>
        </div>
    </div>' as body_content,
    '<div style="font-family: Arial, sans-serif; font-size: 12px; border-top: 1px solid #bdc3c7; padding-top: 15px; margin-top: 20px;">
        <div style="float: left; width: 60%;">
            <p><strong>Authorized Signatory</strong></p>
            <p>___________________________</p>
            <p>{{business_name}}</p>
        </div>
        <div style="float: right; width: 40%; text-align: right;">
            <p><strong>Date of Issue:</strong></p>
            <p>{{issued_date}}</p>
            <p>Stamp: _______________</p>
        </div>
        <div style="clear: both;"></div>
        <p style="text-align: center; color: #7f8c8d; font-size: 10px; margin-top: 20px;">
            This certificate is generated in accordance with the Uganda Income Tax Act.<br>
            Certificate generated on: {{generated_date}}
        </p>
    </div>' as footer_content,
    '{"fontFamily": "Arial", "fontSize": "14px", "lineHeight": "1.6", "color": "#2c3e50", "margin": "25px"}'::JSONB as styles,
    true as is_active,
    false as is_default
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1 FROM wht_certificate_templates wt 
    WHERE wt.business_id = b.id AND wt.template_type = 'CUSTOMER_CERTIFICATE'
);

COMMIT;

-- ============================================================================
-- 8. VERIFICATION QUERIES
-- ============================================================================

-- Verify tables were created
SELECT 
    table_name,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = table_name) as exists
FROM (VALUES 
    ('wht_certificate_items'),
    ('wht_certificate_status_history'), 
    ('wht_certificate_templates')
) as tables_to_check(table_name);

-- Verify indexes were created
SELECT 
    indexname,
    tablename
FROM pg_indexes 
WHERE tablename IN (
    'wht_certificate_items',
    'wht_certificate_status_history',
    'wht_certificate_templates',
    'withholding_tax_certificates'
)
ORDER BY tablename, indexname;

-- Count default templates inserted
SELECT 
    template_type,
    COUNT(*) as count
FROM wht_certificate_templates
GROUP BY template_type;
