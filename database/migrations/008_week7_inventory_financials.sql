-- ============================================================================
-- WEEK 7: INVENTORY & FINANCIALS WITH ABAC CONTROLS
-- ============================================================================

-- 1. Inventory Categories
CREATE TABLE inventory_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category_type VARCHAR(50) DEFAULT 'sale' CHECK (category_type IN ('sale', 'internal_use', 'both')),
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(business_id, name)
);

-- 2. Inventory Items
CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    category_id UUID REFERENCES inventory_categories(id),
    
    -- Basic Information
    name VARCHAR(200) NOT NULL,
    description TEXT,
    sku VARCHAR(100) NOT NULL, -- Stock Keeping Unit
    
    -- Pricing
    cost_price DECIMAL(10,2) NOT NULL,
    selling_price DECIMAL(10,2) NOT NULL,
    
    -- Stock Management
    current_stock DECIMAL(10,2) DEFAULT 0,
    min_stock_level DECIMAL(10,2) DEFAULT 0,
    max_stock_level DECIMAL(10,2) DEFAULT 0,
    unit_of_measure VARCHAR(50) DEFAULT 'units',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(business_id, sku)
);

-- 3. Inventory Movements (Stock Tracking)
CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    
    -- Movement Details
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN (
        'purchase', 'sale', 'adjustment', 'transfer', 'return', 'damage', 'internal_use'
    )),
    quantity DECIMAL(10,2) NOT NULL,
    unit_cost DECIMAL(10,2) NOT NULL,
    total_value DECIMAL(10,2) NOT NULL,
    
    -- Reference (links to other transactions)
    reference_type VARCHAR(50), -- 'invoice', 'job', 'expense', etc.
    reference_id UUID,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Money Wallets (Multiple Financial Accounts)
CREATE TABLE money_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Wallet Details
    name VARCHAR(200) NOT NULL,
    wallet_type VARCHAR(50) NOT NULL CHECK (wallet_type IN (
        'cash', 'bank', 'mobile_money', 'credit_card', 'savings', 'petty_cash', 'tithe'
    )),
    current_balance DECIMAL(12,2) DEFAULT 0,
    description TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(business_id, name)
);

-- 5. Wallet Transactions
CREATE TABLE wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    wallet_id UUID REFERENCES money_wallets(id) ON DELETE CASCADE,
    
    -- Transaction Details
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('income', 'expense', 'transfer')),
    amount DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,
    description TEXT NOT NULL,
    
    -- Reference
    reference_type VARCHAR(50), -- 'invoice', 'expense', 'transfer', etc.
    reference_id UUID,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Expense Categories
CREATE TABLE expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    name VARCHAR(200) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(business_id, name)
);

-- 7. Expenses
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    category_id UUID REFERENCES expense_categories(id),
    wallet_id UUID REFERENCES money_wallets(id),
    
    -- Expense Details
    amount DECIMAL(10,2) NOT NULL,
    description TEXT NOT NULL,
    expense_date DATE NOT NULL,
    receipt_url TEXT,
    
    -- Approval Workflow
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies using security context
CREATE POLICY inventory_categories_business_isolation ON inventory_categories FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY inventory_items_business_isolation ON inventory_items FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY inventory_movements_business_isolation ON inventory_movements FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY money_wallets_business_isolation ON money_wallets FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY wallet_transactions_business_isolation ON wallet_transactions FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY expense_categories_business_isolation ON expense_categories FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY expenses_business_isolation ON expenses FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Inventory Indexes
CREATE INDEX idx_inventory_categories_business ON inventory_categories(business_id, is_active);
CREATE INDEX idx_inventory_items_business ON inventory_items(business_id, is_active);
CREATE INDEX idx_inventory_items_category ON inventory_items(category_id);
CREATE INDEX idx_inventory_items_sku ON inventory_items(sku);
CREATE INDEX idx_inventory_movements_item ON inventory_movements(inventory_item_id);
CREATE INDEX idx_inventory_movements_date ON inventory_movements(created_at);
CREATE INDEX idx_inventory_movements_reference ON inventory_movements(reference_type, reference_id);

-- Wallet Indexes
CREATE INDEX idx_money_wallets_business ON money_wallets(business_id, is_active);
CREATE INDEX idx_money_wallets_type ON money_wallets(wallet_type);
CREATE INDEX idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_date ON wallet_transactions(created_at);
CREATE INDEX idx_wallet_transactions_type ON wallet_transactions(transaction_type);

-- Expense Indexes
CREATE INDEX idx_expense_categories_business ON expense_categories(business_id, is_active);
CREATE INDEX idx_expenses_business ON expenses(business_id, status);
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_wallet ON expenses(wallet_id);

-- ============================================================================
-- PERMISSIONS FOR WEEK 7 FEATURES
-- ============================================================================

-- Add inventory and financial permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- Inventory permissions
(NULL, 'inventory:create', 'inventory', 'Create inventory items and categories', 'inventory', 'create', true),
(NULL, 'inventory:read', 'inventory', 'View inventory items and stock levels', 'inventory', 'read', true),
(NULL, 'inventory:update', 'inventory', 'Update inventory details and stock', 'inventory', 'update', true),
(NULL, 'inventory:delete', 'inventory', 'Delete inventory items', 'inventory', 'delete', true),

-- Wallet permissions
(NULL, 'wallet:create', 'financial', 'Create money wallets', 'wallet', 'create', true),
(NULL, 'wallet:read', 'financial', 'View wallet balances and transactions', 'wallet', 'read', true),
(NULL, 'wallet:update', 'financial', 'Update wallet details', 'wallet', 'update', true),

-- Expense permissions
(NULL, 'expense:create', 'financial', 'Create expense records', 'expense', 'create', true),
(NULL, 'expense:read', 'financial', 'View expense records', 'expense', 'read', true),
(NULL, 'expense:update', 'financial', 'Update expense records', 'expense', 'update', true),
(NULL, 'expense:approve', 'financial', 'Approve expense requests', 'expense', 'approve', true),

-- Financial reporting permissions
(NULL, 'financial:reports:view', 'financial', 'View financial reports', 'financial_reports', 'view', true),
(NULL, 'tithe:manage', 'financial', 'Manage tithe calculations and tracking', 'tithe', 'manage', true);

-- ============================================================================
-- HELPER FUNCTIONS FOR INVENTORY & FINANCIALS
-- ============================================================================

-- Function to update inventory stock levels
CREATE OR REPLACE FUNCTION update_inventory_stock(
    p_inventory_item_id UUID,
    p_quantity_change DECIMAL(10,2),
    p_movement_type VARCHAR(50)
) RETURNS DECIMAL(10,2) AS $$
DECLARE
    v_new_stock DECIMAL(10,2);
    v_current_stock DECIMAL(10,2);
BEGIN
    -- Get current stock
    SELECT current_stock INTO v_current_stock
    FROM inventory_items
    WHERE id = p_inventory_item_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Calculate new stock based on movement type
    CASE p_movement_type
        WHEN 'purchase' THEN
            v_new_stock := v_current_stock + p_quantity_change;
        WHEN 'sale' THEN
            v_new_stock := v_current_stock - p_quantity_change;
        WHEN 'adjustment' THEN
            v_new_stock := p_quantity_change; -- Direct set
        WHEN 'return' THEN
            v_new_stock := v_current_stock + p_quantity_change;
        WHEN 'damage' THEN
            v_new_stock := v_current_stock - p_quantity_change;
        WHEN 'internal_use' THEN
            v_new_stock := v_current_stock - p_quantity_change;
        ELSE
            v_new_stock := v_current_stock;
    END CASE;

    -- Ensure stock doesn't go negative
    IF v_new_stock < 0 THEN
        v_new_stock := 0;
    END IF;

    -- Update inventory item
    UPDATE inventory_items
    SET current_stock = v_new_stock, updated_at = NOW()
    WHERE id = p_inventory_item_id;

    RETURN v_new_stock;
END;
$$ LANGUAGE plpgsql;

-- Function to update wallet balance
CREATE OR REPLACE FUNCTION update_wallet_balance(
    p_wallet_id UUID,
    p_amount DECIMAL(12,2),
    p_transaction_type VARCHAR(50)
) RETURNS DECIMAL(12,2) AS $$
DECLARE
    v_new_balance DECIMAL(12,2);
    v_current_balance DECIMAL(12,2);
BEGIN
    -- Get current balance
    SELECT current_balance INTO v_current_balance
    FROM money_wallets
    WHERE id = p_wallet_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Calculate new balance
    CASE p_transaction_type
        WHEN 'income' THEN
            v_new_balance := v_current_balance + p_amount;
        WHEN 'expense' THEN
            v_new_balance := v_current_balance - p_amount;
        WHEN 'transfer' THEN
            v_new_balance := v_current_balance; -- Transfers handled separately
        ELSE
            v_new_balance := v_current_balance;
    END CASE;

    -- Update wallet
    UPDATE money_wallets
    SET current_balance = v_new_balance, updated_at = NOW()
    WHERE id = p_wallet_id;

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- Function to check low stock items
CREATE OR REPLACE FUNCTION get_low_stock_items(p_business_id UUID)
RETURNS TABLE(
    item_id UUID,
    item_name VARCHAR(200),
    current_stock DECIMAL(10,2),
    min_stock_level DECIMAL(10,2),
    difference DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ii.id,
        ii.name,
        ii.current_stock,
        ii.min_stock_level,
        (ii.current_stock - ii.min_stock_level) as difference
    FROM inventory_items ii
    WHERE ii.business_id = p_business_id
      AND ii.is_active = true
      AND ii.current_stock <= ii.min_stock_level
      AND ii.min_stock_level > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate tithe amount
CREATE OR REPLACE FUNCTION calculate_tithe_amount(
    p_business_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS DECIMAL(12,2) AS $$
DECLARE
    v_total_income DECIMAL(12,2);
    v_tithe_amount DECIMAL(12,2);
BEGIN
    -- Calculate total income from wallet transactions
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_income
    FROM wallet_transactions wt
    INNER JOIN money_wallets mw ON wt.wallet_id = mw.id
    WHERE mw.business_id = p_business_id
      AND wt.transaction_type = 'income'
      AND wt.created_at BETWEEN p_start_date AND p_end_date;

    -- Calculate tithe (10% of income)
    v_tithe_amount := v_total_income * 0.1;

    RETURN v_tithe_amount;
END;
$$ LANGUAGE plpgsql;
