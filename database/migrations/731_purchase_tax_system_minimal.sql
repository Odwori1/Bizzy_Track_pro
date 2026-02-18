-- 731_purchase_tax_system_minimal.sql
-- Phase 7: Purchase Tax Integration - MINIMAL PROVEN VERSION
-- Created: February 15, 2026

BEGIN;

-- ============================================================================
-- PART 1: ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 Add tax columns to purchase_orders (NO GENERATED COLUMNS YET)
-- ----------------------------------------------------------------------------
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 20.00,
ADD COLUMN IF NOT EXISTS wht_applicable BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS wht_rate DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS wht_amount DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS tax_calculation JSONB;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_purchase_orders_wht_applicable ON purchase_orders(wht_applicable) WHERE wht_applicable = true;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tax_amount ON purchase_orders(tax_amount) WHERE tax_amount > 0;

-- ----------------------------------------------------------------------------
-- 1.2 Add compliance fields to suppliers
-- ----------------------------------------------------------------------------
ALTER TABLE suppliers 
ADD COLUMN IF NOT EXISTS tin_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tin_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tin_verification_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS compliance_score DECIMAL(5,2) DEFAULT 100,
ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) DEFAULT 'low',
ADD COLUMN IF NOT EXISTS last_compliance_check TIMESTAMPTZ;

-- Add check constraints (safe to add)
ALTER TABLE suppliers ADD CONSTRAINT IF NOT EXISTS suppliers_risk_level_check 
    CHECK (risk_level IN ('low', 'medium', 'high'));

ALTER TABLE suppliers ADD CONSTRAINT IF NOT EXISTS suppliers_tin_verification_status_check 
    CHECK (tin_verification_status IN ('pending', 'verified', 'failed', 'expired'));

-- Create indexes for supplier compliance
CREATE INDEX IF NOT EXISTS idx_suppliers_tin_verified ON suppliers(tin_verified) WHERE tin_verified = false;
CREATE INDEX IF NOT EXISTS idx_suppliers_compliance_score ON suppliers(compliance_score);
CREATE INDEX IF NOT EXISTS idx_suppliers_risk_level ON suppliers(risk_level);

-- ----------------------------------------------------------------------------
-- 1.3 Add purchase_order_id to transaction_taxes
-- ----------------------------------------------------------------------------
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'transaction_taxes' AND column_name = 'purchase_order_id'
    ) THEN
        ALTER TABLE transaction_taxes ADD COLUMN purchase_order_id UUID REFERENCES purchase_orders(id);
        CREATE INDEX idx_transaction_taxes_purchase_order ON transaction_taxes(purchase_order_id);
    END IF;
END $$;

-- ============================================================================
-- PART 2: CREATE NEW TABLES (NONE OF THESE EXIST)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 PURCHASE TAX CREDITS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_tax_credits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Links
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    transaction_tax_id UUID REFERENCES transaction_taxes(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    
    -- Credit details
    credit_amount DECIMAL(15,2) NOT NULL,
    utilized_amount DECIMAL(15,2) DEFAULT 0,
    remaining_amount DECIMAL(15,2) GENERATED ALWAYS AS (credit_amount - utilized_amount) STORED,
    
    -- Tax type
    tax_type_id UUID REFERENCES tax_types(id),
    tax_type_code VARCHAR(20),
    
    -- Period tracking
    tax_period DATE NOT NULL,
    expiry_date DATE NOT NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'partially_utilized', 'fully_utilized', 'expired')),
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    CONSTRAINT positive_credit CHECK (credit_amount > 0),
    CONSTRAINT valid_expiry CHECK (expiry_date > tax_period)
);

-- ----------------------------------------------------------------------------
-- 2.2 IMPORT DUTY CALCULATIONS TABLE (NO CHAINED GENERATED COLUMNS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_duty_calculations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    
    -- Import details
    hs_code VARCHAR(20),
    country_of_origin VARCHAR(2),
    customs_value DECIMAL(15,2) NOT NULL,
    freight_charges DECIMAL(15,2) DEFAULT 0,
    insurance_charges DECIMAL(15,2) DEFAULT 0,
    -- NO GENERATED COLUMN for cif_value - calculate in application
    
    -- Duty calculation (store all values, calculate in app)
    duty_rate DECIMAL(5,2) NOT NULL,
    duty_amount DECIMAL(15,2) NOT NULL,
    excise_duty_rate DECIMAL(5,2) DEFAULT 0,
    excise_duty_amount DECIMAL(15,2) DEFAULT 0,
    vat_rate DECIMAL(5,2) DEFAULT 20.00,
    vat_amount DECIMAL(15,2) NOT NULL,
    -- NO GENERATED COLUMN for total_import_cost - calculate in app
    
    -- Supporting documents
    import_declaration_number VARCHAR(50),
    entry_number VARCHAR(50),
    customs_branch VARCHAR(100),
    
    -- Audit
    calculation_date TIMESTAMPTZ DEFAULT NOW(),
    calculated_by UUID REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2.3 SUPPLIER TIN VERIFICATION LOG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_tin_verification_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    
    -- Verification details
    tin VARCHAR(50) NOT NULL,
    verification_request JSONB,
    verification_response JSONB,
    verification_result VARCHAR(20) CHECK (verification_result IN ('valid', 'invalid', 'pending', 'error')),
    error_message TEXT,
    
    -- Who performed
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    verified_by UUID REFERENCES users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2.4 PURCHASE WHT CERTIFICATES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_wht_certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Links
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    payment_id UUID REFERENCES vendor_payments(id),
    transaction_tax_id UUID REFERENCES transaction_taxes(id),
    
    -- Certificate details
    certificate_number VARCHAR(50) UNIQUE NOT NULL,
    payment_amount DECIMAL(15,2) NOT NULL,
    wht_rate DECIMAL(5,2) NOT NULL,
    wht_amount DECIMAL(15,2) NOT NULL,
    transaction_date DATE NOT NULL,
    
    -- URA format
    ura_certificate_number VARCHAR(50),
    submitted_to_ura BOOLEAN DEFAULT false,
    submitted_at TIMESTAMPTZ,
    ura_response JSONB,
    
    -- Status
    status VARCHAR(20) DEFAULT 'generated' CHECK (status IN ('generated', 'sent', 'acknowledged', 'cancelled')),
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    notes TEXT
);

-- ============================================================================
-- PART 3: CREATE INDEXES FOR NEW TABLES
-- ============================================================================

-- Purchase Tax Credits indexes
CREATE INDEX IF NOT EXISTS idx_purchase_tax_credits_business ON purchase_tax_credits(business_id);
CREATE INDEX IF NOT EXISTS idx_purchase_tax_credits_purchase ON purchase_tax_credits(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_tax_credits_supplier ON purchase_tax_credits(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_tax_credits_expiry ON purchase_tax_credits(expiry_date);
CREATE INDEX IF NOT EXISTS idx_purchase_tax_credits_status ON purchase_tax_credits(status);

-- Import Duty indexes
CREATE INDEX IF NOT EXISTS idx_import_duty_business ON import_duty_calculations(business_id);
CREATE INDEX IF NOT EXISTS idx_import_duty_purchase ON import_duty_calculations(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_import_duty_supplier ON import_duty_calculations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_import_duty_hs_code ON import_duty_calculations(hs_code);

-- TIN Verification Log indexes
CREATE INDEX IF NOT EXISTS idx_supplier_tin_log_business ON supplier_tin_verification_log(business_id);
CREATE INDEX IF NOT EXISTS idx_supplier_tin_log_supplier ON supplier_tin_verification_log(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_tin_log_result ON supplier_tin_verification_log(verification_result);

-- Purchase WHT Certificates indexes
CREATE INDEX IF NOT EXISTS idx_purchase_wht_business ON purchase_wht_certificates(business_id);
CREATE INDEX IF NOT EXISTS idx_purchase_wht_purchase ON purchase_wht_certificates(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_wht_supplier ON purchase_wht_certificates(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_wht_cert_number ON purchase_wht_certificates(certificate_number);
CREATE INDEX IF NOT EXISTS idx_purchase_wht_status ON purchase_wht_certificates(status);

-- ============================================================================
-- PART 4: ENABLE ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE purchase_tax_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_duty_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_tin_verification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_wht_certificates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY purchase_tax_credits_isolation ON purchase_tax_credits
    USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY import_duty_calculations_isolation ON import_duty_calculations
    USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY supplier_tin_verification_log_isolation ON supplier_tin_verification_log
    USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY purchase_wht_certificates_isolation ON purchase_wht_certificates
    USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- PART 5: FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to generate purchase WHT certificate number
CREATE OR REPLACE FUNCTION generate_purchase_wht_certificate_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix TEXT;
    month_prefix TEXT;
    sequence_num INTEGER;
BEGIN
    year_prefix := TO_CHAR(NOW(), 'YYYY');
    month_prefix := TO_CHAR(NOW(), 'MM');
    
    SELECT COUNT(*) + 1 INTO sequence_num
    FROM purchase_wht_certificates
    WHERE business_id = NEW.business_id
    AND TO_CHAR(created_at, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM');
    
    NEW.certificate_number := 'P-WHT/' || year_prefix || '/' || month_prefix || '/' || LPAD(sequence_num::TEXT, 3, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update supplier compliance score
CREATE OR REPLACE FUNCTION update_supplier_compliance_score()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.compliance_score >= 80 THEN
        NEW.risk_level = 'low';
    ELSIF NEW.compliance_score >= 50 THEN
        NEW.risk_level = 'medium';
    ELSE
        NEW.risk_level = 'high';
    END IF;
    
    NEW.last_compliance_check = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update tax credit status
CREATE OR REPLACE FUNCTION update_tax_credit_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.remaining_amount <= 0 THEN
        NEW.status = 'fully_utilized';
    ELSIF NEW.utilized_amount > 0 THEN
        NEW.status = 'partially_utilized';
    ELSE
        NEW.status = 'active';
    END IF;
    
    IF NEW.expiry_date < CURRENT_DATE THEN
        NEW.status = 'expired';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS set_purchase_wht_certificate_number ON purchase_wht_certificates;
CREATE TRIGGER set_purchase_wht_certificate_number
    BEFORE INSERT ON purchase_wht_certificates
    FOR EACH ROW
    WHEN (NEW.certificate_number IS NULL)
    EXECUTE FUNCTION generate_purchase_wht_certificate_number();

DROP TRIGGER IF EXISTS update_supplier_compliance_on_score_change ON suppliers;
CREATE TRIGGER update_supplier_compliance_on_score_change
    BEFORE INSERT OR UPDATE OF compliance_score ON suppliers
    FOR EACH ROW
    EXECUTE FUNCTION update_supplier_compliance_score();

DROP TRIGGER IF EXISTS update_tax_credit_status_on_change ON purchase_tax_credits;
CREATE TRIGGER update_tax_credit_status_on_change
    BEFORE INSERT OR UPDATE OF utilized_amount, expiry_date ON purchase_tax_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_tax_credit_status();

-- Update triggers for timestamps
DROP TRIGGER IF EXISTS update_purchase_tax_credits_updated_at ON purchase_tax_credits;
CREATE TRIGGER update_purchase_tax_credits_updated_at
    BEFORE UPDATE ON purchase_tax_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_import_duty_calculations_updated_at ON import_duty_calculations;
CREATE TRIGGER update_import_duty_calculations_updated_at
    BEFORE UPDATE ON import_duty_calculations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_wht_certificates_updated_at ON purchase_wht_certificates;
CREATE TRIGGER update_purchase_wht_certificates_updated_at
    BEFORE UPDATE ON purchase_wht_certificates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 6: ADD SUBTOTAL AS REGULAR COLUMN (NOT GENERATED)
-- ============================================================================
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15,2) DEFAULT 0;

-- Update existing records (will be calculated by application)
COMMENT ON COLUMN purchase_orders.subtotal IS 'Calculated by application as total_amount - tax_amount';

COMMIT;
