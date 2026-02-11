-- 1. Fix schema mismatch in country_product_tax_mappings
ALTER TABLE country_product_tax_mappings 
RENAME COLUMN product_tax_category_id TO product_category_code;

-- 2. Add WHT-specific tables
CREATE TABLE withholding_tax_certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    certificate_number VARCHAR(50) UNIQUE NOT NULL, -- WHT 3 format: WHT3-YYYY-XXXXXX
    supplier_id UUID REFERENCES customers(id),
    supplier_name VARCHAR(255) NOT NULL,
    supplier_tin VARCHAR(20),
    invoice_id UUID REFERENCES invoices(id),
    transaction_id UUID, -- Could be invoice or purchase
    transaction_type VARCHAR(20) NOT NULL, -- 'invoice', 'purchase'
    transaction_date DATE NOT NULL,
    service_amount DECIMAL(15,2) NOT NULL CHECK (service_amount >= 0),
    withholding_rate DECIMAL(5,2) NOT NULL CHECK (withholding_rate >= 0 AND withholding_rate <= 100),
    withholding_amount DECIMAL(15,2) NOT NULL CHECK (withholding_amount >= 0),
    tax_period DATE NOT NULL, -- YYYY-MM-01
    status VARCHAR(20) DEFAULT 'generated', -- generated, issued, cancelled
    issued_date DATE,
    issued_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE wht_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    return_period DATE NOT NULL, -- YYYY-MM-01
    return_type VARCHAR(20) DEFAULT 'monthly', -- monthly, quarterly
    total_withheld DECIMAL(15,2) DEFAULT 0,
    certificates_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft', -- draft, calculated, submitted, approved
    submitted_at TIMESTAMPTZ,
    approval_reference VARCHAR(100), -- URA reference number
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(business_id, return_period)
);

CREATE TABLE wht_thresholds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    threshold_amount DECIMAL(15,2) NOT NULL DEFAULT 1000000,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE wht_exemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES customers(id),
    supplier_tin VARCHAR(20),
    exemption_type VARCHAR(50) NOT NULL, -- government, diplomatic, specific_agreement
    certificate_number VARCHAR(100),
    valid_from DATE NOT NULL,
    valid_to DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
