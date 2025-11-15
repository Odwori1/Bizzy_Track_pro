-- ============================================================================
-- WEEK 6: COMPREHENSIVE ASSET MANAGEMENT & EQUIPMENT HIRE
-- ============================================================================

-- 1. Fixed Assets Master Table
CREATE TABLE fixed_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

    -- Asset Identification
    asset_code VARCHAR(50) NOT NULL, -- Internal asset code (e.g., ASSET-001)
    asset_name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL CHECK (category IN (
        'property', 'vehicle', 'furniture', 'electronics', 
        'machinery', 'equipment', 'intangible', 'other'
    )),
    description TEXT,
    
    -- Purchase Details
    purchase_date DATE NOT NULL,
    purchase_price DECIMAL(12,2) NOT NULL,
    supplier VARCHAR(255),
    invoice_reference VARCHAR(100),
    
    -- Financial Details
    current_value DECIMAL(12,2) NOT NULL,
    depreciation_method VARCHAR(20) DEFAULT 'straight_line' CHECK (depreciation_method IN ('straight_line', 'reducing_balance')),
    depreciation_rate DECIMAL(5,2) DEFAULT 0, -- Annual depreciation rate
    useful_life_years INTEGER DEFAULT 5,
    salvage_value DECIMAL(12,2) DEFAULT 0,
    
    -- Physical Details
    location VARCHAR(255),
    condition_status VARCHAR(20) DEFAULT 'excellent' CHECK (condition_status IN ('excellent', 'good', 'fair', 'poor', 'broken')),
    serial_number VARCHAR(100),
    model VARCHAR(100),
    
    -- Insurance & Maintenance
    insurance_details JSONB, -- {provider: '', policy_number: '', coverage_amount: '', renewal_date: ''}
    maintenance_schedule VARCHAR(20) DEFAULT 'none' CHECK (maintenance_schedule IN ('none', 'monthly', 'quarterly', 'biannual', 'annual')),
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    disposal_date DATE,
    disposal_reason TEXT,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(business_id, asset_code)
);

-- 2. Asset Depreciation History
CREATE TABLE asset_depreciation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES fixed_assets(id) ON DELETE CASCADE,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Depreciation Period
    period_date DATE NOT NULL, -- End of depreciation period (e.g., end of month)
    period_type VARCHAR(20) DEFAULT 'monthly' CHECK (period_type IN ('monthly', 'quarterly', 'annual')),
    
    -- Depreciation Calculations
    depreciation_amount DECIMAL(12,2) NOT NULL,
    accumulated_depreciation DECIMAL(12,2) NOT NULL,
    remaining_value DECIMAL(12,2) NOT NULL,
    
    -- Audit
    calculated_by UUID REFERENCES users(id),
    calculated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(asset_id, period_date)
);

-- 3. Asset Maintenance Log
CREATE TABLE asset_maintenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES fixed_assets(id) ON DELETE CASCADE,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Maintenance Details
    maintenance_type VARCHAR(50) NOT NULL CHECK (maintenance_type IN ('routine', 'repair', 'overhaul', 'inspection', 'calibration')),
    maintenance_date DATE NOT NULL,
    cost DECIMAL(10,2) DEFAULT 0,
    description TEXT NOT NULL,
    performed_by VARCHAR(255), -- Internal staff or external vendor
    
    -- Parts Used
    parts_used JSONB, -- {part_name: '', quantity: '', cost: ''}
    
    -- Next Maintenance
    next_maintenance_date DATE,
    next_maintenance_notes TEXT,
    
    -- Status
    is_completed BOOLEAN DEFAULT true,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CHECK (next_maintenance_date IS NULL OR next_maintenance_date >= maintenance_date)
);

-- 4. Equipment Hire Assets (Specialized fixed assets for hiring)
CREATE TABLE equipment_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES fixed_assets(id) ON DELETE CASCADE, -- Link to main asset record
    
    -- Hire Configuration
    hire_rate_per_day DECIMAL(10,2) NOT NULL,
    hire_rate_per_week DECIMAL(10,2),
    hire_rate_per_month DECIMAL(10,2),
    minimum_hire_period INTEGER DEFAULT 1, -- Minimum days
    deposit_amount DECIMAL(10,2) DEFAULT 0,
    
    -- Availability & Status
    is_available BOOLEAN DEFAULT true,
    is_hireable BOOLEAN DEFAULT true,
    current_location VARCHAR(255),
    
    -- Equipment Specifications
    specifications JSONB, -- {brand: '', model: '', weight: '', dimensions: '', power_requirements: ''}
    photos JSONB, -- Array of photo URLs
    condition_notes TEXT,
    operational_instructions TEXT,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Equipment Hire Bookings
CREATE TABLE equipment_hire_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Booking Details
    booking_number VARCHAR(50) NOT NULL,
    equipment_asset_id UUID REFERENCES equipment_assets(id),
    customer_id UUID REFERENCES customers(id),
    job_id UUID REFERENCES jobs(id), -- Optional link to a job
    
    -- Hire Period
    hire_start_date TIMESTAMPTZ NOT NULL,
    hire_end_date TIMESTAMPTZ NOT NULL,
    actual_return_date TIMESTAMPTZ,
    
    -- Financials
    hire_rate DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    deposit_paid DECIMAL(10,2) DEFAULT 0,
    deposit_returned DECIMAL(10,2) DEFAULT 0,
    additional_charges DECIMAL(10,2) DEFAULT 0,
    final_amount DECIMAL(10,2),
    
    -- Status
    status VARCHAR(20) DEFAULT 'reserved' CHECK (status IN ('reserved', 'active', 'completed', 'cancelled', 'overdue')),
    
    -- Condition Tracking
    pre_hire_condition TEXT,
    post_hire_condition TEXT,
    damage_notes TEXT,
    damage_charges DECIMAL(10,2) DEFAULT 0,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(business_id, booking_number),
    CHECK (hire_end_date > hire_start_date),
    CHECK (actual_return_date IS NULL OR actual_return_date >= hire_start_date)
);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_depreciation ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_hire_bookings ENABLE ROW LEVEL SECURITY;

-- RLS Policies using security context
CREATE POLICY fixed_assets_business_isolation ON fixed_assets FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY asset_depreciation_business_isolation ON asset_depreciation FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY asset_maintenance_business_isolation ON asset_maintenance FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY equipment_assets_business_isolation ON equipment_assets FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY equipment_hire_bookings_business_isolation ON equipment_hire_bookings FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Fixed Assets Indexes
CREATE INDEX idx_fixed_assets_business ON fixed_assets(business_id, is_active);
CREATE INDEX idx_fixed_assets_category ON fixed_assets(category);
CREATE INDEX idx_fixed_assets_condition ON fixed_assets(condition_status);
CREATE INDEX idx_fixed_assets_code ON fixed_assets(asset_code);

-- Asset Depreciation Indexes
CREATE INDEX idx_asset_depreciation_asset ON asset_depreciation(asset_id);
CREATE INDEX idx_asset_depreciation_period ON asset_depreciation(period_date);
CREATE INDEX idx_asset_depreciation_business ON asset_depreciation(business_id);

-- Asset Maintenance Indexes
CREATE INDEX idx_asset_maintenance_asset ON asset_maintenance(asset_id);
CREATE INDEX idx_asset_maintenance_date ON asset_maintenance(maintenance_date);
CREATE INDEX idx_asset_maintenance_next ON asset_maintenance(next_maintenance_date) WHERE next_maintenance_date IS NOT NULL;

-- Equipment Assets Indexes
CREATE INDEX idx_equipment_assets_available ON equipment_assets(business_id, is_available, is_hireable);
CREATE INDEX idx_equipment_assets_asset ON equipment_assets(asset_id);

-- Equipment Hire Bookings Indexes
CREATE INDEX idx_equipment_bookings_status ON equipment_hire_bookings(business_id, status);
CREATE INDEX idx_equipment_bookings_dates ON equipment_hire_bookings(hire_start_date, hire_end_date);
CREATE INDEX idx_equipment_bookings_customer ON equipment_hire_bookings(customer_id);
CREATE INDEX idx_equipment_bookings_equipment ON equipment_hire_bookings(equipment_asset_id);

-- ============================================================================
-- PERMISSIONS FOR ASSET MANAGEMENT
-- ============================================================================

-- Add asset management permissions to system permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- Fixed Asset permissions
(NULL, 'asset:create', 'asset', 'Create new fixed assets', 'asset', 'create', true),
(NULL, 'asset:read', 'asset', 'View fixed assets', 'asset', 'read', true),
(NULL, 'asset:update', 'asset', 'Update asset details', 'asset', 'update', true),
(NULL, 'asset:delete', 'asset', 'Delete assets', 'asset', 'delete', true),
(NULL, 'asset:depreciate', 'asset', 'Calculate asset depreciation', 'asset', 'depreciate', true),
(NULL, 'asset:maintenance:create', 'asset', 'Record maintenance activities', 'asset', 'maintenance_create', true),
(NULL, 'asset:maintenance:read', 'asset', 'View maintenance history', 'asset', 'maintenance_read', true),

-- Equipment Hire permissions
(NULL, 'equipment:create', 'equipment', 'Add equipment for hire', 'equipment', 'create', true),
(NULL, 'equipment:read', 'equipment', 'View equipment inventory', 'equipment', 'read', true),
(NULL, 'equipment:update', 'equipment', 'Update equipment details', 'equipment', 'update', true),
(NULL, 'equipment:delete', 'equipment', 'Remove equipment', 'equipment', 'delete', true),
(NULL, 'equipment:hire:create', 'equipment', 'Create hire bookings', 'equipment', 'hire_create', true),
(NULL, 'equipment:hire:read', 'equipment', 'View hire bookings', 'equipment', 'hire_read', true),
(NULL, 'equipment:hire:update', 'equipment', 'Update hire bookings', 'equipment', 'hire_update', true),
(NULL, 'equipment:condition:update', 'equipment', 'Update equipment condition', 'equipment', 'condition_update', true),

-- Business Valuation permissions
(NULL, 'valuation:view', 'financial', 'View business valuation reports', 'valuation', 'view', true),
(NULL, 'valuation:export', 'financial', 'Export valuation reports', 'valuation', 'export', true);

-- ============================================================================
-- HELPER FUNCTIONS FOR ASSET MANAGEMENT
-- ============================================================================

-- Function to calculate asset current value
CREATE OR REPLACE FUNCTION calculate_asset_current_value(
    p_asset_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
) RETURNS DECIMAL(12,2) AS $$
DECLARE
    v_purchase_price DECIMAL(12,2);
    v_depreciation_rate DECIMAL(5,2);
    v_useful_life INTEGER;
    v_salvage_value DECIMAL(12,2);
    v_purchase_date DATE;
    v_months_owned INTEGER;
    v_depreciation_amount DECIMAL(12,2);
    v_accumulated_depreciation DECIMAL(12,2);
BEGIN
    -- Get asset details
    SELECT purchase_price, depreciation_rate, useful_life_years, salvage_value, purchase_date
    INTO v_purchase_price, v_depreciation_rate, v_useful_life, v_salvage_value, v_purchase_date
    FROM fixed_assets 
    WHERE id = p_asset_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Calculate months owned
    v_months_owned := EXTRACT(YEAR FROM AGE(p_as_of_date, v_purchase_date)) * 12 
                     + EXTRACT(MONTH FROM AGE(p_as_of_date, v_purchase_date));

    -- Ensure months owned is not negative
    IF v_months_owned < 0 THEN
        v_months_owned := 0;
    END IF;

    -- Calculate accumulated depreciation
    SELECT COALESCE(SUM(depreciation_amount), 0)
    INTO v_accumulated_depreciation
    FROM asset_depreciation 
    WHERE asset_id = p_asset_id 
    AND period_date <= p_as_of_date;

    -- If no depreciation records, calculate it
    IF v_accumulated_depreciation = 0 THEN
        -- Straight-line depreciation calculation
        v_depreciation_amount := (v_purchase_price - v_salvage_value) / (v_useful_life * 12);
        v_accumulated_depreciation := v_depreciation_amount * v_months_owned;
    END IF;

    -- Ensure value doesn't go below salvage value
    RETURN GREATEST(v_purchase_price - v_accumulated_depreciation, v_salvage_value);
END;
$$ LANGUAGE plpgsql;

-- Function to get business total asset value
CREATE OR REPLACE FUNCTION get_business_total_asset_value(
    p_business_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
) RETURNS DECIMAL(12,2) AS $$
DECLARE
    v_total_value DECIMAL(12,2) := 0;
BEGIN
    SELECT COALESCE(SUM(calculate_asset_current_value(id, p_as_of_date)), 0)
    INTO v_total_value
    FROM fixed_assets 
    WHERE business_id = p_business_id 
    AND is_active = true 
    AND disposal_date IS NULL;

    RETURN v_total_value;
END;
$$ LANGUAGE plpgsql;
