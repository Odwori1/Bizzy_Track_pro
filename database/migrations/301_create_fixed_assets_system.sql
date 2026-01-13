-- Migration 301: Create Fixed Assets System
-- Date: 2026-01-11
-- Purpose: Add fixed assets tracking with depreciation
-- Dependencies: All previous migrations applied
-- Production-Ready: Dynamic business support

BEGIN;

-- ============================================================================
-- SECTION 1: CREATE ASSETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    asset_code VARCHAR(50) NOT NULL,
    asset_name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(50) NOT NULL CHECK (asset_type IN ('tangible', 'intangible', 'investment')),
    category VARCHAR(100) NOT NULL CHECK (category IN ('land', 'building', 'vehicle', 'equipment', 'furniture', 'computer', 'software', 'other')),
    
    -- Purchase details
    purchase_date DATE NOT NULL,
    purchase_cost DECIMAL(15,2) NOT NULL CHECK (purchase_cost > 0),
    supplier_id UUID REFERENCES suppliers(id),
    purchase_order_id UUID REFERENCES purchase_orders(id),
    
    -- Depreciation details
    salvage_value DECIMAL(15,2) DEFAULT 0 CHECK (salvage_value >= 0),
    useful_life_months INTEGER NOT NULL CHECK (useful_life_months > 0),
    depreciation_method VARCHAR(50) DEFAULT 'straight_line' CHECK (depreciation_method IN ('straight_line', 'declining_balance')),
    
    -- Financial tracking
    current_book_value DECIMAL(15,2) DEFAULT 0,
    accumulated_depreciation DECIMAL(15,2) DEFAULT 0,
    depreciation_rate DECIMAL(5,2), -- Annual rate in percentage
    
    -- Physical details
    serial_number VARCHAR(100),
    model VARCHAR(100),
    manufacturer VARCHAR(100),
    location VARCHAR(255),
    department_id UUID REFERENCES departments(id),
    
    -- Status tracking
    is_active BOOLEAN DEFAULT true,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'idle', 'under_maintenance', 'disposed', 'sold', 'scrapped')),
    
    -- Disposal details (if applicable)
    disposal_date DATE,
    disposal_method VARCHAR(50) CHECK (disposal_method IN ('sale', 'scrap', 'donation', 'transfer', 'lost')),
    disposal_amount DECIMAL(15,2),
    disposal_notes TEXT,
    
    -- Audit fields
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Business-specific asset code must be unique
    UNIQUE(business_id, asset_code),
    
    -- Constraint: Salvage value cannot exceed purchase cost
    CONSTRAINT salvage_less_than_cost CHECK (salvage_value <= purchase_cost),
    
    -- Constraint: Disposal date must be after purchase date if set
    CONSTRAINT valid_disposal_date CHECK (
        disposal_date IS NULL OR disposal_date >= purchase_date
    )
);

-- Create indexes for performance
CREATE INDEX idx_assets_business_id ON assets(business_id);
CREATE INDEX idx_assets_asset_code ON assets(business_id, asset_code);
CREATE INDEX idx_assets_category ON assets(category);
CREATE INDEX idx_assets_is_active ON assets(is_active);
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_purchase_date ON assets(purchase_date);
CREATE INDEX idx_assets_created_at ON assets(created_at);

-- ============================================================================
-- SECTION 2: CREATE ASSET DEPRECIATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_depreciations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    
    -- Depreciation period
    depreciation_date DATE NOT NULL,
    period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
    period_year INTEGER NOT NULL,
    
    -- Financial details
    depreciation_amount DECIMAL(15,2) NOT NULL CHECK (depreciation_amount >= 0),
    accumulated_depreciation_before DECIMAL(15,2) NOT NULL,
    accumulated_depreciation_after DECIMAL(15,2) NOT NULL,
    book_value_before DECIMAL(15,2) NOT NULL,
    book_value_after DECIMAL(15,2) NOT NULL,
    
    -- Accounting integration
    journal_entry_id UUID REFERENCES journal_entries(id),
    is_posted BOOLEAN DEFAULT false,
    posted_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit fields
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: One depreciation per asset per month/year
    UNIQUE(asset_id, period_month, period_year),
    
    -- Constraint: Ensure proper accumulation
    CONSTRAINT valid_accumulation CHECK (
        accumulated_depreciation_after = accumulated_depreciation_before + depreciation_amount
    ),
    
    -- Constraint: Ensure book value calculation
    CONSTRAINT valid_book_value CHECK (
        book_value_after = book_value_before - depreciation_amount
    )
);

-- Create indexes for performance
CREATE INDEX idx_asset_depreciations_business_id ON asset_depreciations(business_id);
CREATE INDEX idx_asset_depreciations_asset_id ON asset_depreciations(asset_id);
CREATE INDEX idx_asset_depreciations_date ON asset_depreciations(depreciation_date);
CREATE INDEX idx_asset_depreciations_period ON asset_depreciations(period_year, period_month);
CREATE INDEX idx_asset_depreciations_is_posted ON asset_depreciations(is_posted);

-- ============================================================================
-- SECTION 3: ADD FIXED ASSET ACCOUNTS TO CHART OF ACCOUNTS
-- ============================================================================

-- Function to add missing fixed asset accounts for a business
CREATE OR REPLACE FUNCTION ensure_fixed_asset_accounts(p_business_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Add fixed asset cost accounts (1400-1499 series)
    INSERT INTO chart_of_accounts (business_id, account_code, account_name, account_type, is_active)
    SELECT p_business_id, account_code, account_name, account_type, true
    FROM (VALUES
        ('1410', 'Land', 'asset'),
        ('1420', 'Buildings', 'asset'),
        ('1430', 'Vehicles', 'asset'),
        ('1440', 'Equipment', 'asset'),
        ('1450', 'Furniture and Fixtures', 'asset'),
        ('1460', 'Computers and Software', 'asset'),
        ('1470', 'Leasehold Improvements', 'asset'),
        ('1480', 'Other Fixed Assets', 'asset'),
        
        -- Accumulated Depreciation accounts (contra-asset accounts)
        ('1490', 'Accumulated Depreciation - Buildings', 'asset'),
        ('1491', 'Accumulated Depreciation - Vehicles', 'asset'),
        ('1492', 'Accumulated Depreciation - Equipment', 'asset'),
        ('1493', 'Accumulated Depreciation - Furniture', 'asset'),
        ('1494', 'Accumulated Depreciation - Computers', 'asset'),
        ('1495', 'Accumulated Depreciation - Other Assets', 'asset'),
        
        -- Asset disposal accounts
        ('1496', 'Gain on Disposal of Assets', 'revenue'),
        ('1497', 'Loss on Disposal of Assets', 'expense')
    ) AS new_accounts(account_code, account_name, account_type)
    WHERE NOT EXISTS (
        SELECT 1 FROM chart_of_accounts 
        WHERE business_id = p_business_id 
        AND account_code = new_accounts.account_code
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 4: CREATE ASSET ACCOUNTING FUNCTIONS
-- ============================================================================

-- Function to create journal entry for asset purchase
CREATE OR REPLACE FUNCTION create_asset_purchase_journal(
    p_business_id UUID,
    p_asset_id UUID,
    p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_asset RECORD;
    v_asset_account_id UUID;
    v_payment_account_id UUID;
    v_journal_entry_id UUID;
    v_reference_number VARCHAR(100);
BEGIN
    -- Get asset details
    SELECT * INTO v_asset
    FROM assets
    WHERE id = p_asset_id AND business_id = p_business_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asset not found: %', p_asset_id;
    END IF;
    
    -- Determine asset account based on category
    SELECT id INTO v_asset_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_code = CASE v_asset.category
        WHEN 'land' THEN '1410'
        WHEN 'building' THEN '1420'
        WHEN 'vehicle' THEN '1430'
        WHEN 'equipment' THEN '1440'
        WHEN 'furniture' THEN '1450'
        WHEN 'computer' THEN '1460'
        WHEN 'software' THEN '1460'
        ELSE '1480' -- Other Fixed Assets
      END
      AND is_active = true;
    
    IF v_asset_account_id IS NULL THEN
        RAISE EXCEPTION 'Asset account not found for category: %', v_asset.category;
    END IF;
    
    -- Generate reference number
    v_reference_number := 'ASSET-' || v_asset.asset_code || '-' || 
        TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
        (EXTRACT(EPOCH FROM NOW())::BIGINT % 1000)::TEXT;
    
    -- Create journal entry
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
        p_business_id,
        v_asset.purchase_date,
        v_reference_number,
        'asset_purchase',
        p_asset_id::TEXT,
        'Asset Purchase: ' || v_asset.asset_name || ' (' || v_asset.asset_code || ')',
        v_asset.purchase_cost,
        'posted',
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;
    
    -- Debit: Fixed Asset account
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        p_business_id,
        v_journal_entry_id,
        v_asset_account_id,
        'debit',
        v_asset.purchase_cost,
        'Asset purchase: ' || v_asset.asset_name
    );
    
    -- Credit: Payment account (Cash/Bank/AP)
    -- Determine payment account based on how asset was purchased
    IF v_asset.purchase_order_id IS NOT NULL THEN
        -- If purchased via PO, use Accounts Payable
        SELECT id INTO v_payment_account_id
        FROM chart_of_accounts
        WHERE business_id = p_business_id
          AND account_code = '2100'
          AND is_active = true;
    ELSE
        -- Assume cash purchase
        SELECT id INTO v_payment_account_id
        FROM chart_of_accounts
        WHERE business_id = p_business_id
          AND account_code = '1110'
          AND is_active = true;
    END IF;
    
    IF v_payment_account_id IS NULL THEN
        RAISE EXCEPTION 'Payment account not found';
    END IF;
    
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        p_business_id,
        v_journal_entry_id,
        v_payment_account_id,
        'credit',
        v_asset.purchase_cost,
        'Payment for asset: ' || v_asset.asset_name
    );
    
    -- Update asset with journal entry reference
    UPDATE assets
    SET updated_at = NOW()
    WHERE id = p_asset_id;
    
    RETURN v_journal_entry_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate monthly depreciation
CREATE OR REPLACE FUNCTION calculate_monthly_depreciation(
    p_asset_id UUID,
    p_month INTEGER,
    p_year INTEGER
)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    v_asset RECORD;
    v_months_passed INTEGER;
    v_depreciation_amount DECIMAL(15,2);
    v_book_value DECIMAL(15,2);
    v_remaining_months INTEGER;
BEGIN
    -- Get asset details
    SELECT * INTO v_asset
    FROM assets
    WHERE id = p_asset_id
      AND is_active = true
      AND status IN ('active', 'idle');
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- Check if asset is fully depreciated
    IF v_asset.current_book_value <= v_asset.salvage_value THEN
        RETURN 0;
    END IF;
    
    -- Calculate months passed since purchase
    v_months_passed := (p_year - EXTRACT(YEAR FROM v_asset.purchase_date)) * 12
                       + (p_month - EXTRACT(MONTH FROM v_asset.purchase_date));
    
    IF v_months_passed < 1 THEN
        RETURN 0; -- Not yet time for depreciation
    END IF;
    
    -- Get current book value (from last depreciation or purchase)
    SELECT COALESCE(book_value_after, v_asset.purchase_cost)
    INTO v_book_value
    FROM asset_depreciations
    WHERE asset_id = p_asset_id
      AND period_year = CASE 
        WHEN p_month = 1 THEN p_year - 1 
        ELSE p_year 
      END
      AND period_month = CASE 
        WHEN p_month = 1 THEN 12 
        ELSE p_month - 1 
      END
    ORDER BY period_year DESC, period_month DESC
    LIMIT 1;
    
    IF v_book_value IS NULL THEN
        v_book_value := v_asset.purchase_cost;
    END IF;
    
    -- Calculate depreciation based on method
    IF v_asset.depreciation_method = 'straight_line' THEN
        -- Straight-line depreciation
        v_depreciation_amount := (v_asset.purchase_cost - v_asset.salvage_value) 
                               / v_asset.useful_life_months;
        
        -- Don't depreciate below salvage value
        IF v_book_value - v_depreciation_amount < v_asset.salvage_value THEN
            v_depreciation_amount := v_book_value - v_asset.salvage_value;
        END IF;
        
    ELSE -- Declining balance method
        -- Calculate declining balance rate if not set
        IF v_asset.depreciation_rate IS NULL THEN
            -- Double declining balance: 2 / useful life in years
            v_asset.depreciation_rate := (2.0 / (v_asset.useful_life_months / 12.0)) * 100;
        END IF;
        
        -- Monthly depreciation
        v_depreciation_amount := v_book_value * (v_asset.depreciation_rate / 100 / 12);
        
        -- Don't depreciate below salvage value
        IF v_book_value - v_depreciation_amount < v_asset.salvage_value THEN
            v_depreciation_amount := v_book_value - v_asset.salvage_value;
        END IF;
    END IF;
    
    -- Ensure non-negative
    v_depreciation_amount := GREATEST(v_depreciation_amount, 0);
    
    RETURN v_depreciation_amount;
END;
$$ LANGUAGE plpgsql;

-- Function to post monthly depreciation
CREATE OR REPLACE FUNCTION post_monthly_depreciation(
    p_business_id UUID,
    p_month INTEGER,
    p_year INTEGER,
    p_user_id UUID
)
RETURNS TABLE(
    asset_id UUID,
    asset_code VARCHAR,
    asset_name VARCHAR,
    depreciation_amount DECIMAL(15,2),
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_asset RECORD;
    v_depreciation_amount DECIMAL(15,2);
    v_accumulated_before DECIMAL(15,2);
    v_accumulated_after DECIMAL(15,2);
    v_book_value_before DECIMAL(15,2);
    v_book_value_after DECIMAL(15,2);
    v_depreciation_account_id UUID;
    v_accumulated_account_id UUID;
    v_journal_entry_id UUID;
    v_reference_number VARCHAR(100);
    v_has_depreciation BOOLEAN;
BEGIN
    -- Check if month/year is valid
    IF p_month < 1 OR p_month > 12 OR p_year < 2000 OR p_year > 2100 THEN
        RAISE EXCEPTION 'Invalid month/year: %/%', p_month, p_year;
    END IF;
    
    -- Check if depreciation already posted for this period
    SELECT EXISTS (
        SELECT 1 FROM asset_depreciations
        WHERE business_id = p_business_id
          AND period_month = p_month
          AND period_year = p_year
          AND is_posted = true
    ) INTO v_has_depreciation;
    
    IF v_has_depreciation THEN
        RAISE EXCEPTION 'Depreciation already posted for %/%', p_month, p_year;
    END IF;
    
    -- Get depreciation expense account
    SELECT id INTO v_depreciation_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_code = '5600' -- Depreciation Expense
      AND is_active = true;
    
    IF v_depreciation_account_id IS NULL THEN
        RAISE EXCEPTION 'Depreciation Expense account (5600) not found';
    END IF;
    
    -- Loop through all active assets
    FOR v_asset IN 
        SELECT * FROM assets
        WHERE business_id = p_business_id
          AND is_active = true
          AND status IN ('active', 'idle')
          AND purchase_cost > 0
          AND useful_life_months > 0
        ORDER BY asset_code
    LOOP
        -- Calculate depreciation for this asset
        v_depreciation_amount := calculate_monthly_depreciation(
            v_asset.id,
            p_month,
            p_year
        );
        
        IF v_depreciation_amount > 0 THEN
            -- Get previous accumulated depreciation
            SELECT COALESCE(MAX(accumulated_depreciation_after), 0)
            INTO v_accumulated_before
            FROM asset_depreciations
            WHERE asset_id = v_asset.id
              AND is_posted = true
            ORDER BY period_year DESC, period_month DESC
            LIMIT 1;
            
            IF v_accumulated_before IS NULL THEN
                v_accumulated_before := 0;
            END IF;
            
            v_accumulated_after := v_accumulated_before + v_depreciation_amount;
            
            -- Calculate book values
            v_book_value_before := v_asset.purchase_cost - v_accumulated_before;
            v_book_value_after := v_book_value_before - v_depreciation_amount;
            
            -- Get appropriate accumulated depreciation account
            SELECT id INTO v_accumulated_account_id
            FROM chart_of_accounts
            WHERE business_id = p_business_id
              AND account_code = CASE v_asset.category
                WHEN 'building' THEN '1490'
                WHEN 'vehicle' THEN '1491'
                WHEN 'equipment' THEN '1492'
                WHEN 'furniture' THEN '1493'
                WHEN 'computer' THEN '1494'
                WHEN 'software' THEN '1494'
                ELSE '1495'
              END
              AND is_active = true;
            
            IF v_accumulated_account_id IS NULL THEN
                -- Fallback to general accumulated depreciation
                SELECT id INTO v_accumulated_account_id
                FROM chart_of_accounts
                WHERE business_id = p_business_id
                  AND account_code = '1495'
                  AND is_active = true;
            END IF;
            
            IF v_accumulated_account_id IS NULL THEN
                RAISE EXCEPTION 'Accumulated Depreciation account not found for category: %', v_asset.category;
            END IF;
            
            -- Generate reference number
            v_reference_number := 'DEPR-' || v_asset.asset_code || '-' ||
                LPAD(p_year::TEXT, 4, '0') || '-' || 
                LPAD(p_month::TEXT, 2, '0');
            
            -- Create journal entry for depreciation
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
                p_business_id,
                MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day',
                v_reference_number,
                'asset_depreciation',
                v_asset.id::TEXT,
                'Depreciation: ' || v_asset.asset_name || ' (' || v_asset.asset_code || ')',
                v_depreciation_amount,
                'posted',
                p_user_id,
                NOW()
            ) RETURNING id INTO v_journal_entry_id;
            
            -- Debit: Depreciation Expense
            INSERT INTO journal_entry_lines (
                business_id,
                journal_entry_id,
                account_id,
                line_type,
                amount,
                description
            ) VALUES (
                p_business_id,
                v_journal_entry_id,
                v_depreciation_account_id,
                'debit',
                v_depreciation_amount,
                'Depreciation expense: ' || v_asset.asset_name
            );
            
            -- Credit: Accumulated Depreciation
            INSERT INTO journal_entry_lines (
                business_id,
                journal_entry_id,
                account_id,
                line_type,
                amount,
                description
            ) VALUES (
                p_business_id,
                v_journal_entry_id,
                v_accumulated_account_id,
                'credit',
                v_depreciation_amount,
                'Accumulated depreciation: ' || v_asset.asset_name
            );
            
            -- Record depreciation in asset_depreciations table
            INSERT INTO asset_depreciations (
                business_id,
                asset_id,
                depreciation_date,
                period_month,
                period_year,
                depreciation_amount,
                accumulated_depreciation_before,
                accumulated_depreciation_after,
                book_value_before,
                book_value_after,
                journal_entry_id,
                is_posted,
                posted_at
            ) VALUES (
                p_business_id,
                v_asset.id,
                MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day',
                p_month,
                p_year,
                v_depreciation_amount,
                v_accumulated_before,
                v_accumulated_after,
                v_book_value_before,
                v_book_value_after,
                v_journal_entry_id,
                true,
                NOW()
            );
            
            -- Update asset's current book value and accumulated depreciation
            UPDATE assets
            SET 
                current_book_value = v_book_value_after,
                accumulated_depreciation = v_accumulated_after,
                updated_at = NOW()
            WHERE id = v_asset.id;
            
            -- Return success
            RETURN QUERY SELECT 
                v_asset.id,
                v_asset.asset_code,
                v_asset.asset_name,
                v_depreciation_amount,
                true,
                'Depreciation posted successfully';
        ELSE
            -- Return no depreciation needed
            RETURN QUERY SELECT 
                v_asset.id,
                v_asset.asset_code,
                v_asset.asset_name,
                0::DECIMAL(15,2),
                true,
                'No depreciation calculated (below salvage or not started)';
        END IF;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 5: CREATE RLS POLICIES
-- ============================================================================

-- Enable Row Level Security
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_depreciations ENABLE ROW LEVEL SECURITY;

-- Assets RLS Policy: Users can only see assets for their business
CREATE POLICY assets_business_policy ON assets
    FOR ALL
    USING (business_id = current_setting('app.current_business_id', true)::UUID);

-- Asset Depreciations RLS Policy
CREATE POLICY asset_depreciations_business_policy ON asset_depreciations
    FOR ALL
    USING (business_id = current_setting('app.current_business_id', true)::UUID);

-- ============================================================================
-- SECTION 6: CREATE TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to assets table
CREATE TRIGGER update_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to asset_depreciations table
CREATE TRIGGER update_asset_depreciations_updated_at
    BEFORE UPDATE ON asset_depreciations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to generate asset code on insert
CREATE OR REPLACE FUNCTION generate_asset_code()
RETURNS TRIGGER AS $$
DECLARE
    v_prefix VARCHAR(10);
    v_next_number INTEGER;
BEGIN
    -- Get business prefix from business name
    SELECT SUBSTRING(name FROM 1 FOR 3) INTO v_prefix
    FROM businesses
    WHERE id = NEW.business_id;
    
    -- Default prefix if business name is too short
    IF LENGTH(v_prefix) < 3 THEN
        v_prefix := 'AST';
    END IF;
    
    -- Get next sequence number for this business
    SELECT COALESCE(MAX(CAST(SUBSTRING(asset_code FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_next_number
    FROM assets
    WHERE business_id = NEW.business_id
      AND asset_code ~ ('^' || v_prefix || '-[0-9]+$');
    
    -- Set asset code
    NEW.asset_code := v_prefix || '-' || LPAD(v_next_number::TEXT, 4, '0');
    
    -- Calculate depreciation rate for declining balance method
    IF NEW.depreciation_method = 'declining_balance' AND NEW.useful_life_months > 0 THEN
        -- Default to double declining balance (200% / useful life)
        NEW.depreciation_rate := (200.0 / (NEW.useful_life_months / 12.0));
    END IF;
    
    -- Set initial book value to purchase cost
    NEW.current_book_value := NEW.purchase_cost;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to assets table
CREATE TRIGGER set_asset_code_before_insert
    BEFORE INSERT ON assets
    FOR EACH ROW
    EXECUTE FUNCTION generate_asset_code();

-- ============================================================================
-- SECTION 7: CREATE VIEWS FOR REPORTING
-- ============================================================================

-- View: Asset Register with all details
CREATE OR REPLACE VIEW asset_register AS
SELECT 
    a.id,
    a.business_id,
    a.asset_code,
    a.asset_name,
    a.asset_type,
    a.category,
    a.purchase_date,
    a.purchase_cost,
    a.salvage_value,
    a.useful_life_months,
    a.depreciation_method,
    a.depreciation_rate,
    a.current_book_value,
    a.accumulated_depreciation,
    a.serial_number,
    a.model,
    a.manufacturer,
    a.location,
    d.name as department_name,
    a.status,
    a.is_active,
    a.created_at,
    a.updated_at,
    
    -- Calculated fields
    (a.purchase_cost - a.salvage_value) as depreciable_cost,
    CASE 
        WHEN a.useful_life_months > 0 
        THEN (a.purchase_cost - a.salvage_value) / a.useful_life_months
        ELSE 0 
    END as monthly_depreciation,
    
    CASE 
        WHEN a.useful_life_months > 0 
        THEN (a.accumulated_depreciation / (a.purchase_cost - a.salvage_value)) * 100
        ELSE 0 
    END as percent_depreciated,
    
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, a.purchase_date)) * 12 
    + EXTRACT(MONTH FROM AGE(CURRENT_DATE, a.purchase_date)) as months_since_purchase
    
FROM assets a
LEFT JOIN departments d ON a.department_id = d.id
WHERE a.is_active = true;

-- View: Monthly Depreciation Schedule
CREATE OR REPLACE VIEW depreciation_schedule AS
SELECT 
    ad.business_id,
    ad.asset_id,
    a.asset_code,
    a.asset_name,
    ad.period_year,
    ad.period_month,
    ad.depreciation_date,
    ad.depreciation_amount,
    ad.accumulated_depreciation_before,
    ad.accumulated_depreciation_after,
    ad.book_value_before,
    ad.book_value_after,
    ad.is_posted,
    ad.posted_at,
    ad.journal_entry_id,
    je.reference_number as journal_reference
FROM asset_depreciations ad
JOIN assets a ON ad.asset_id = a.id
LEFT JOIN journal_entries je ON ad.journal_entry_id = je.id
ORDER BY ad.period_year DESC, ad.period_month DESC, a.asset_code;

-- View: Assets by Category Summary
CREATE OR REPLACE VIEW assets_by_category AS
SELECT 
    business_id,
    category,
    COUNT(*) as asset_count,
    SUM(purchase_cost) as total_cost,
    SUM(current_book_value) as total_book_value,
    SUM(accumulated_depreciation) as total_depreciation,
    AVG(purchase_cost) as avg_cost,
    MIN(purchase_date) as oldest_purchase,
    MAX(purchase_date) as newest_purchase
FROM assets
WHERE is_active = true
GROUP BY business_id, category
ORDER BY total_cost DESC;

-- ============================================================================
-- SECTION 8: INITIAL DATA FOR TEST BUSINESS
-- ============================================================================

-- Run for the existing test business
SELECT ensure_fixed_asset_accounts('ac7de9dd-7cc8-41c9-94f7-611a4ade5256');

-- ============================================================================
-- SECTION 9: MIGRATION COMPLETION
-- ============================================================================

COMMENT ON TABLE assets IS 'Fixed assets tracking with depreciation';
COMMENT ON TABLE asset_depreciations IS 'Monthly depreciation records for assets';
COMMENT ON FUNCTION ensure_fixed_asset_accounts(UUID) IS 'Ensures fixed asset accounts exist for a business';
COMMENT ON FUNCTION create_asset_purchase_journal(UUID, UUID, UUID) IS 'Creates accounting entries for asset purchases';
COMMENT ON FUNCTION calculate_monthly_depreciation(UUID, INTEGER, INTEGER) IS 'Calculates depreciation for an asset for a given month/year';
COMMENT ON FUNCTION post_monthly_depreciation(UUID, INTEGER, INTEGER, UUID) IS 'Posts depreciation for all assets for a given month/year';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMIT;

-- Optional: Verify migration success
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 301: Fixed Assets System created successfully';
    RAISE NOTICE '   Tables created: assets, asset_depreciations';
    RAISE NOTICE '   Views created: asset_register, depreciation_schedule, assets_by_category';
    RAISE NOTICE '   Functions created: ensure_fixed_asset_accounts, create_asset_purchase_journal, calculate_monthly_depreciation, post_monthly_depreciation';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '   1. Create ~/backend/app/services/assetService.js';
    RAISE NOTICE '   2. Create ~/backend/app/controllers/assetController.js';
    RAISE NOTICE '   3. Create ~/backend/app/routes/assetRoutes.js';
    RAISE NOTICE '   4. Add routes to app.js';
    RAISE NOTICE '   5. Test with sample assets';
END $$;
