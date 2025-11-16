-- ============================================================================
-- WEEK 8: POS & BUSINESS OPERATIONS MIGRATION
-- ============================================================================

-- 1. Products table with variants support
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    -- Basic Information
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sku VARCHAR(100) UNIQUE,
    barcode VARCHAR(100),

    -- Categorization
    category_id UUID REFERENCES inventory_categories(id),

    -- Pricing
    cost_price DECIMAL(15,2) NOT NULL DEFAULT 0,
    selling_price DECIMAL(15,2) NOT NULL DEFAULT 0,

    -- Stock Management
    current_stock INTEGER NOT NULL DEFAULT 0,
    min_stock_level INTEGER DEFAULT 0,
    max_stock_level INTEGER DEFAULT 1000,
    unit_of_measure VARCHAR(50) DEFAULT 'pieces',

    -- Product Configuration
    is_active BOOLEAN DEFAULT true,
    has_variants BOOLEAN DEFAULT false,
    variant_data JSONB, -- For sizes, colors, etc.
    image_urls TEXT[], -- Array of image URLs
    tags TEXT[], -- Product tags for search

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(business_id, sku)
);

-- 2. Product variants table
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    -- Variant Information
    variant_name VARCHAR(255) NOT NULL, -- "Size: Large", "Color: Red"
    sku VARCHAR(100) UNIQUE,
    barcode VARCHAR(100),

    -- Pricing
    cost_price DECIMAL(15,2) NOT NULL DEFAULT 0,
    selling_price DECIMAL(15,2) NOT NULL DEFAULT 0,

    -- Stock
    current_stock INTEGER NOT NULL DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Suppliers table
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    -- Supplier Information
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    tax_id VARCHAR(100),

    -- Business Terms
    payment_terms VARCHAR(100), -- "Net 30", "Net 60"

    -- Performance Tracking
    rating INTEGER DEFAULT 5, -- 1-5 rating
    performance_metrics JSONB, -- Delivery time, quality rating, etc.

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Purchase orders table
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),

    -- Order Information
    po_number VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'confirmed', 'received', 'cancelled')),
    order_date DATE NOT NULL,
    expected_delivery_date DATE,
    total_amount DECIMAL(15,2) DEFAULT 0,
    notes TEXT,

    -- Approval Workflow
    created_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Purchase order items
CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,

    -- Item Reference (can be product or inventory item)
    product_id UUID REFERENCES products(id),
    inventory_item_id UUID REFERENCES inventory_items(id),
    item_name VARCHAR(255) NOT NULL,

    -- Order Details
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(15,2) NOT NULL,
    total_cost DECIMAL(15,2) NOT NULL,

    -- Receipt Tracking
    received_quantity INTEGER DEFAULT 0,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. POS transactions table
CREATE TABLE pos_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    -- Transaction Information
    transaction_number VARCHAR(100) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id),
    transaction_date TIMESTAMPTZ DEFAULT NOW(),

    -- Financial Details
    total_amount DECIMAL(15,2) NOT NULL,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    final_amount DECIMAL(15,2) NOT NULL,

    -- Payment Information
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'card', 'mobile_money', 'credit', 'multiple')),
    payment_status VARCHAR(50) DEFAULT 'completed' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),

    -- Transaction Status
    status VARCHAR(50) DEFAULT 'completed' CHECK (status IN ('active', 'void', 'refunded')),
    notes TEXT,

    -- Audit
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. POS transaction items
CREATE TABLE pos_transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    pos_transaction_id UUID NOT NULL REFERENCES pos_transactions(id) ON DELETE CASCADE,

    -- Item Reference (can be product, inventory item, or service)
    product_id UUID REFERENCES products(id),
    inventory_item_id UUID REFERENCES inventory_items(id),
    service_id UUID REFERENCES services(id),
    item_type VARCHAR(50) NOT NULL CHECK (item_type IN ('product', 'service')),

    -- Item Details
    item_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(15,2) NOT NULL,
    total_price DECIMAL(15,2) NOT NULL,
    discount_amount DECIMAL(15,2) DEFAULT 0,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Customer loyalty system
CREATE TABLE customer_loyalty (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

    -- Loyalty Points
    total_points DECIMAL(15,2) DEFAULT 0,
    current_points DECIMAL(15,2) DEFAULT 0,

    -- Customer Tier
    loyalty_tier VARCHAR(50) DEFAULT 'standard' CHECK (loyalty_tier IN ('standard', 'bronze', 'silver', 'gold', 'platinum')),

    -- Purchase History
    total_spent DECIMAL(15,2) DEFAULT 0,
    visit_count INTEGER DEFAULT 0,
    last_visit_date TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(business_id, customer_id)
);

-- 9. Loyalty transactions
CREATE TABLE loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

    -- Transaction Details
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('earn', 'redeem', 'expire', 'adjust')),
    points DECIMAL(15,2) NOT NULL,
    balance_after DECIMAL(15,2) NOT NULL,

    -- Reference
    reference_type VARCHAR(50) CHECK (reference_type IN ('pos_transaction', 'manual_adjustment')),
    reference_id UUID,
    description TEXT,

    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ENHANCE EXISTING TABLES FOR WEEK 8 FEATURES
-- ============================================================================

-- Add barcode and supplier support to inventory items
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_loyalty ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies using security context (following Week 7 pattern)
CREATE POLICY products_business_isolation ON products FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY product_variants_business_isolation ON product_variants FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY suppliers_business_isolation ON suppliers FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY purchase_orders_business_isolation ON purchase_orders FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY purchase_order_items_business_isolation ON purchase_order_items FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY pos_transactions_business_isolation ON pos_transactions FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY pos_transaction_items_business_isolation ON pos_transaction_items FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY customer_loyalty_business_isolation ON customer_loyalty FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY loyalty_transactions_business_isolation ON loyalty_transactions FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- INDEXES FOR PERFORMANCE (following Week 7 pattern)
-- ============================================================================

-- Products Indexes
CREATE INDEX idx_products_business_id ON products(business_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);

-- Product Variants Indexes
CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(sku);

-- Suppliers Indexes
CREATE INDEX idx_suppliers_business_id ON suppliers(business_id);
CREATE INDEX idx_suppliers_active ON suppliers(is_active);

-- Purchase Orders Indexes
CREATE INDEX idx_purchase_orders_business_id ON purchase_orders(business_id);
CREATE INDEX idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_purchase_orders_date ON purchase_orders(order_date);

-- POS Transactions Indexes
CREATE INDEX idx_pos_transactions_business_id ON pos_transactions(business_id);
CREATE INDEX idx_pos_transactions_customer_id ON pos_transactions(customer_id);
CREATE INDEX idx_pos_transactions_date ON pos_transactions(transaction_date);
CREATE INDEX idx_pos_transactions_number ON pos_transactions(transaction_number);

-- Customer Loyalty Indexes
CREATE INDEX idx_customer_loyalty_business_customer ON customer_loyalty(business_id, customer_id);
CREATE INDEX idx_customer_loyalty_tier ON customer_loyalty(loyalty_tier);

-- Loyalty Transactions Indexes
CREATE INDEX idx_loyalty_transactions_customer ON loyalty_transactions(customer_id);
CREATE INDEX idx_loyalty_transactions_date ON loyalty_transactions(created_at);

-- ============================================================================
-- HELPER FUNCTIONS FOR POS & BUSINESS OPERATIONS
-- ============================================================================

-- Function to generate unique POS transaction number
CREATE OR REPLACE FUNCTION generate_pos_transaction_number(p_business_id UUID)
RETURNS VARCHAR(100) AS $$
DECLARE
    v_prefix VARCHAR(10);
    v_sequence INTEGER;
    v_transaction_number VARCHAR(100);
BEGIN
    -- Get business prefix (first 3 letters of business name)
    SELECT UPPER(SUBSTRING(name FROM 1 FOR 3)) INTO v_prefix
    FROM businesses WHERE id = p_business_id;
    
    IF v_prefix IS NULL THEN
        v_prefix := 'POS';
    END IF;
    
    -- Get next sequence for this business
    SELECT COALESCE(MAX(CAST(SUBSTRING(transaction_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_sequence
    FROM pos_transactions
    WHERE business_id = p_business_id
    AND transaction_number ~ ('^' || v_prefix || '-[0-9]+$');
    
    -- Format: BUS-000001
    v_transaction_number := v_prefix || '-' || LPAD(v_sequence::TEXT, 6, '0');
    
    RETURN v_transaction_number;
END;
$$ LANGUAGE plpgsql;

-- Function to process POS sale and update stock
CREATE OR REPLACE FUNCTION process_pos_sale(p_pos_transaction_id UUID)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
    v_business_id UUID;
    v_item RECORD;
BEGIN
    -- Get business ID from transaction
    SELECT business_id INTO v_business_id
    FROM pos_transactions WHERE id = p_pos_transaction_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'POS transaction not found';
        RETURN;
    END IF;
    
    -- Update stock for each product in the transaction
    FOR v_item IN (
        SELECT pti.product_id, pti.quantity, pti.inventory_item_id
        FROM pos_transaction_items pti
        WHERE pti.pos_transaction_id = p_pos_transaction_id
        AND (pti.product_id IS NOT NULL OR pti.inventory_item_id IS NOT NULL)
    ) LOOP
        IF v_item.product_id IS NOT NULL THEN
            -- Update product stock
            UPDATE products 
            SET current_stock = current_stock - v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.product_id
            AND business_id = v_business_id;
            
            -- Record inventory movement for product
            INSERT INTO inventory_movements (
                business_id, inventory_item_id, movement_type, quantity,
                unit_cost, total_value, reference_type, reference_id, created_by
            )
            SELECT 
                v_business_id,
                NULL, -- No direct inventory item link for products
                'sale',
                v_item.quantity,
                p.cost_price,
                p.cost_price * v_item.quantity,
                'pos_transaction',
                p_pos_transaction_id,
                pt.created_by
            FROM products p
            JOIN pos_transactions pt ON pt.id = p_pos_transaction_id
            WHERE p.id = v_item.product_id;
                
        ELSIF v_item.inventory_item_id IS NOT NULL THEN
            -- Update inventory item stock using existing function
            PERFORM update_inventory_stock(
                v_item.inventory_item_id,
                v_item.quantity,
                'sale'
            );
        END IF;
    END LOOP;
    
    -- Update customer loyalty points (1 point per 100 currency units spent)
    UPDATE customer_loyalty cl
    SET 
        total_points = total_points + (pt.final_amount / 100),
        current_points = current_points + (pt.final_amount / 100),
        total_spent = total_spent + pt.final_amount,
        visit_count = visit_count + 1,
        last_visit_date = NOW(),
        updated_at = NOW()
    FROM pos_transactions pt
    WHERE pt.id = p_pos_transaction_id
    AND cl.customer_id = pt.customer_id
    AND cl.business_id = v_business_id;
    
    -- Record loyalty transaction if customer exists
    INSERT INTO loyalty_transactions (
        business_id, customer_id, transaction_type, points,
        balance_after, reference_type, reference_id, description
    )
    SELECT 
        v_business_id,
        pt.customer_id,
        'earn',
        pt.final_amount / 100,
        cl.current_points + (pt.final_amount / 100),
        'pos_transaction',
        p_pos_transaction_id,
        'Points earned from purchase'
    FROM pos_transactions pt
    LEFT JOIN customer_loyalty cl ON cl.customer_id = pt.customer_id AND cl.business_id = v_business_id
    WHERE pt.id = p_pos_transaction_id
    AND pt.customer_id IS NOT NULL;
    
    RETURN QUERY SELECT true, 'POS sale processed successfully';
END;
$$ LANGUAGE plpgsql;

-- Function to get sales analytics
CREATE OR REPLACE FUNCTION get_sales_analytics(
    p_business_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
) RETURNS TABLE(
    total_sales DECIMAL(15,2),
    total_transactions INTEGER,
    average_transaction DECIMAL(15,2),
    best_selling_product VARCHAR(255),
    best_selling_count INTEGER
) AS $$
BEGIN
    -- Set default date range to last 30 days if not provided
    IF p_start_date IS NULL THEN
        p_start_date := CURRENT_DATE - INTERVAL '30 days';
    END IF;
    
    IF p_end_date IS NULL THEN
        p_end_date := CURRENT_DATE;
    END IF;
    
    RETURN QUERY
    WITH sales_data AS (
        SELECT 
            COALESCE(SUM(final_amount), 0) as total_sales,
            COUNT(*) as total_transactions,
            CASE 
                WHEN COUNT(*) > 0 THEN COALESCE(SUM(final_amount), 0) / COUNT(*)
                ELSE 0 
            END as average_transaction
        FROM pos_transactions
        WHERE business_id = p_business_id
        AND status = 'completed'
        AND transaction_date BETWEEN p_start_date AND p_end_date
    ),
    product_sales AS (
        SELECT 
            pti.item_name,
            SUM(pti.quantity) as total_quantity,
            ROW_NUMBER() OVER (ORDER BY SUM(pti.quantity) DESC) as rank
        FROM pos_transaction_items pti
        JOIN pos_transactions pt ON pt.id = pti.pos_transaction_id
        WHERE pt.business_id = p_business_id
        AND pt.status = 'completed'
        AND pt.transaction_date BETWEEN p_start_date AND p_end_date
        AND pti.item_type = 'product'
        GROUP BY pti.item_name
    )
    SELECT 
        sd.total_sales,
        sd.total_transactions,
        sd.average_transaction,
        ps.item_name as best_selling_product,
        ps.total_quantity as best_selling_count
    FROM sales_data sd
    CROSS JOIN LATERAL (
        SELECT item_name, total_quantity
        FROM product_sales
        WHERE rank = 1
        LIMIT 1
    ) ps;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PERMISSIONS FOR WEEK 8 FEATURES
-- ============================================================================

-- Add POS and business operations permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- Product Management Permissions
(NULL, 'products:create', 'products', 'Create new products', 'products', 'create', true),
(NULL, 'products:read', 'products', 'View products', 'products', 'read', true),
(NULL, 'products:update', 'products', 'Update products', 'products', 'update', true),
(NULL, 'products:delete', 'products', 'Delete products', 'products', 'delete', true),
(NULL, 'products:manage_variants', 'products', 'Manage product variants', 'products', 'manage', true),
(NULL, 'products:import_export', 'products', 'Import/export products', 'products', 'import_export', true),

-- Supplier Management Permissions  
(NULL, 'suppliers:create', 'suppliers', 'Create new suppliers', 'suppliers', 'create', true),
(NULL, 'suppliers:read', 'suppliers', 'View suppliers', 'suppliers', 'read', true),
(NULL, 'suppliers:update', 'suppliers', 'Update suppliers', 'suppliers', 'update', true),
(NULL, 'suppliers:delete', 'suppliers', 'Delete suppliers', 'suppliers', 'delete', true),

-- Purchase Order Permissions
(NULL, 'purchase_orders:create', 'purchase_orders', 'Create purchase orders', 'purchase_orders', 'create', true),
(NULL, 'purchase_orders:read', 'purchase_orders', 'View purchase orders', 'purchase_orders', 'read', true),
(NULL, 'purchase_orders:update', 'purchase_orders', 'Update purchase orders', 'purchase_orders', 'update', true),
(NULL, 'purchase_orders:delete', 'purchase_orders', 'Delete purchase orders', 'purchase_orders', 'delete', true),
(NULL, 'purchase_orders:approve', 'purchase_orders', 'Approve purchase orders', 'purchase_orders', 'approve', true),

-- POS System Permissions
(NULL, 'pos:create', 'pos', 'Create POS transactions', 'pos', 'create', true),
(NULL, 'pos:read', 'pos', 'View POS transactions', 'pos', 'read', true),
(NULL, 'pos:update', 'pos', 'Update POS transactions', 'pos', 'update', true),
(NULL, 'pos:void', 'pos', 'Void POS transactions', 'pos', 'void', true),
(NULL, 'pos:refund', 'pos', 'Process refunds', 'pos', 'refund', true),

-- Customer Loyalty Permissions
(NULL, 'loyalty:manage', 'loyalty', 'Manage customer loyalty', 'loyalty', 'manage', true),
(NULL, 'loyalty:view', 'loyalty', 'View loyalty points', 'loyalty', 'read', true),
(NULL, 'loyalty:adjust', 'loyalty', 'Adjust loyalty points', 'loyalty', 'update', true),

-- Advanced Permission Management
(NULL, 'permissions:ui_manage', 'permissions', 'Use permission management UI', 'permissions', 'manage', true),
(NULL, 'permissions:temporary_grants', 'permissions', 'Grant temporary permissions', 'permissions', 'grant', true),
(NULL, 'permissions:inheritance_view', 'permissions', 'View permission inheritance', 'permissions', 'read', true);

-- ============================================================================
-- DEFAULT DATA FOR NEW BUSINESSES
-- ============================================================================

-- Create default product categories for new businesses
INSERT INTO inventory_categories (business_id, name, description, category_type)
SELECT 
    id as business_id,
    'General Products' as name,
    'Default product category' as description,
    'sale' as category_type
FROM businesses
WHERE id NOT IN (SELECT DISTINCT business_id FROM inventory_categories);

-- Create default suppliers for new businesses
INSERT INTO suppliers (business_id, name, contact_person, email, phone, payment_terms)
SELECT 
    id as business_id,
    'Main Supplier' as name,
    'Supplier Contact' as contact_person,
    'supplier@example.com' as email,
    '+256700000000' as phone,
    'Net 30' as payment_terms
FROM businesses
WHERE id NOT IN (SELECT DISTINCT business_id FROM suppliers);
