-- ============================================================================
-- WEEK 5 COMPLETION: SEASONAL PRICING & PRICE HISTORY
-- ============================================================================

-- Seasonal pricing rules for date-based pricing adjustments
CREATE TABLE seasonal_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Rule configuration
    name VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Date ranges (inclusive)
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Recurrence pattern
    is_recurring BOOLEAN DEFAULT false,
    recurrence_type VARCHAR(20) CHECK (recurrence_type IN ('yearly', 'monthly', 'weekly')),
    
    -- Pricing adjustments
    adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('percentage', 'fixed', 'override')),
    adjustment_value DECIMAL(10,2) NOT NULL,
    
    -- Target scope
    target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('all_services', 'category', 'specific_service', 'customer_segment')),
    target_id UUID, -- service_id, category_id, or customer_category_id
    target_name VARCHAR(100), -- For display purposes
    
    -- Conditions
    min_order_amount DECIMAL(10,2),
    applies_to_new_customers BOOLEAN DEFAULT true,
    applies_to_existing_customers BOOLEAN DEFAULT true,
    
    -- Status and priority
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 50,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CHECK (end_date >= start_date),
    CHECK (adjustment_value >= 0),
    CHECK (priority BETWEEN 1 AND 100)
);

-- Price history tracking for audit and rollback capabilities
CREATE TABLE price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Entity reference
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('service', 'package')),
    entity_id UUID NOT NULL,
    entity_name VARCHAR(200) NOT NULL,
    
    -- Price details
    old_price DECIMAL(10,2),
    new_price DECIMAL(10,2) NOT NULL,
    change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('manual', 'bulk_update', 'seasonal', 'pricing_rule', 'initial')),
    
    -- Change context
    change_reason TEXT,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    change_source VARCHAR(100), -- 'user', 'system', 'api'
    
    -- Related entities (for tracking what caused the change)
    pricing_rule_id UUID REFERENCES pricing_rules(id),
    seasonal_pricing_id UUID REFERENCES seasonal_pricing(id),
    bulk_update_batch UUID, -- For grouping bulk updates
    
    -- Audit
    changed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Indexed fields for performance
    CONSTRAINT valid_price_change CHECK (new_price >= 0)
);

-- ============================================================================
-- RLS POLICIES (CRITICAL FOR SECURITY)
-- ============================================================================

ALTER TABLE seasonal_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- Business isolation policies
CREATE POLICY seasonal_pricing_business_isolation ON seasonal_pricing 
FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY price_history_business_isolation ON price_history 
FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Seasonal pricing indexes
CREATE INDEX idx_seasonal_pricing_business_dates ON seasonal_pricing(business_id, start_date, end_date);
CREATE INDEX idx_seasonal_pricing_active_dates ON seasonal_pricing(business_id, is_active, start_date, end_date);
CREATE INDEX idx_seasonal_pricing_recurring ON seasonal_pricing(business_id, is_recurring, recurrence_type);
CREATE INDEX idx_seasonal_pricing_target ON seasonal_pricing(business_id, target_type, target_id);

-- Price history indexes
CREATE INDEX idx_price_history_entity ON price_history(business_id, entity_type, entity_id);
CREATE INDEX idx_price_history_dates ON price_history(business_id, effective_from, created_at);
CREATE INDEX idx_price_history_change_type ON price_history(business_id, change_type);
CREATE INDEX idx_price_history_bulk_batch ON price_history(bulk_update_batch);

-- ============================================================================
-- PERMISSIONS FOR NEW FEATURES
-- ============================================================================

-- Add seasonal pricing permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
(NULL, 'seasonal_pricing:create', 'pricing', 'Create seasonal pricing rules', 'seasonal_pricing', 'create', true),
(NULL, 'seasonal_pricing:read', 'pricing', 'View seasonal pricing rules', 'seasonal_pricing', 'read', true),
(NULL, 'seasonal_pricing:update', 'pricing', 'Update seasonal pricing rules', 'seasonal_pricing', 'update', true),
(NULL, 'seasonal_pricing:delete', 'pricing', 'Delete seasonal pricing rules', 'seasonal_pricing', 'delete', true),

-- Price history permissions
(NULL, 'price_history:read', 'pricing', 'View price change history', 'price_history', 'read', true),

-- Bulk pricing permissions
(NULL, 'pricing:bulk_update', 'pricing', 'Perform bulk pricing updates', 'pricing', 'bulk_update', true);

-- ============================================================================
-- FUNCTIONS FOR PRICING MANAGEMENT
-- ============================================================================

-- Function to get current seasonal pricing for a service
CREATE OR REPLACE FUNCTION get_current_seasonal_pricing(
    p_business_id UUID,
    p_service_id UUID,
    p_check_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    seasonal_pricing_id UUID,
    adjustment_type VARCHAR,
    adjustment_value DECIMAL,
    rule_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.id,
        sp.adjustment_type,
        sp.adjustment_value,
        sp.name
    FROM seasonal_pricing sp
    WHERE sp.business_id = p_business_id
        AND sp.is_active = true
        AND p_check_date BETWEEN sp.start_date AND sp.end_date
        AND (
            sp.target_type = 'all_services'
            OR (sp.target_type = 'specific_service' AND sp.target_id = p_service_id)
            OR (sp.target_type = 'category' AND sp.target_id IN (
                SELECT category FROM services WHERE id = p_service_id AND business_id = p_business_id
            ))
        )
    ORDER BY sp.priority DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log price changes automatically
CREATE OR REPLACE FUNCTION log_price_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.base_price != NEW.base_price THEN
        INSERT INTO price_history (
            business_id, entity_type, entity_id, entity_name,
            old_price, new_price, change_type, change_reason,
            changed_by, effective_from
        ) VALUES (
            NEW.business_id, 'service', NEW.id, NEW.name,
            OLD.base_price, NEW.base_price, 'manual',
            'Manual price update', 
            current_setting('app.current_user_id')::UUID,
            CURRENT_DATE
        );
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO price_history (
            business_id, entity_type, entity_id, entity_name,
            old_price, new_price, change_type, change_reason,
            changed_by, effective_from
        ) VALUES (
            NEW.business_id, 'service', NEW.id, NEW.name,
            NULL, NEW.base_price, 'initial',
            'Initial price setting',
            current_setting('app.current_user_id')::UUID,
            CURRENT_DATE
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC PRICE HISTORY
-- ============================================================================

-- Create trigger for services table
CREATE TRIGGER service_price_change_trigger
    AFTER INSERT OR UPDATE OF base_price ON services
    FOR EACH ROW
    EXECUTE FUNCTION log_price_change();

-- Create trigger for packages table  
CREATE TRIGGER package_price_change_trigger
    AFTER INSERT OR UPDATE OF base_price ON service_packages
    FOR EACH ROW
    EXECUTE FUNCTION log_price_change();

-- ============================================================================
-- SAMPLE DATA FOR DEMONSTRATION
-- ============================================================================

-- These will be inserted by the demo data generator
-- Sample seasonal pricing rules for holidays and seasons

