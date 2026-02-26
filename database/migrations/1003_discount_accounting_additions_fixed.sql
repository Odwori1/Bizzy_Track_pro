-- 1003_discount_accounting_additions_fixed.sql
-- COMPLETE DISCOUNT ACCOUNTING SYSTEM ADDITIONS (FIXED VERSION)

BEGIN;

-- =====================================================
-- PART 1: ENHANCE EXISTING TABLES WITH MISSING COLUMNS
-- =====================================================

-- 1.1 Add updated_at to category_discount_rules
DO $$
BEGIN
   IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'category_discount_rules' AND column_name = 'updated_at'
   ) THEN
      ALTER TABLE category_discount_rules 
      ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
      
      RAISE NOTICE 'Added updated_at to category_discount_rules';
   END IF;
END $$;

-- 1.2 Add pos_transaction_id to discount_approvals
DO $$
BEGIN
   IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'discount_approvals' AND column_name = 'pos_transaction_id'
   ) THEN
      ALTER TABLE discount_approvals 
      ADD COLUMN pos_transaction_id UUID REFERENCES pos_transactions(id),
      ADD COLUMN rejection_reason TEXT;
      
      RAISE NOTICE 'Added pos_transaction_id to discount_approvals';
   END IF;
END $$;

-- 1.3 Add discount columns to invoice_line_items
DO $$
BEGIN
   IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'invoice_line_items' AND column_name = 'discount_amount'
   ) THEN
      ALTER TABLE invoice_line_items 
      ADD COLUMN original_unit_price DECIMAL(15,2),
      ADD COLUMN discount_rule_id UUID,
      ADD COLUMN discount_amount DECIMAL(15,2) DEFAULT 0,
      ADD COLUMN discount_percentage DECIMAL(5,2),
      ADD COLUMN discount_approval_id UUID REFERENCES discount_approvals(id);
      
      RAISE NOTICE 'Added discount columns to invoice_line_items';
   END IF;
END $$;

-- 1.4 Add discount tracking to invoices
DO $$
BEGIN
   IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'invoices' AND column_name = 'total_discount'
   ) THEN
      ALTER TABLE invoices 
      ADD COLUMN total_discount DECIMAL(15,2) DEFAULT 0,
      ADD COLUMN discount_breakdown JSONB;
      
      RAISE NOTICE 'Added discount columns to invoices';
   END IF;
END $$;

-- 1.5 Enhance pos_transactions discount tracking
DO $$
BEGIN
   IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'pos_transactions' AND column_name = 'total_discount'
   ) THEN
      ALTER TABLE pos_transactions 
      ADD COLUMN total_discount DECIMAL(15,2) DEFAULT 0,
      ADD COLUMN discount_breakdown JSONB;
      
      -- Migrate existing discount_amount to total_discount
      UPDATE pos_transactions 
      SET total_discount = COALESCE(discount_amount, 0)
      WHERE discount_amount IS NOT NULL;
      
      RAISE NOTICE 'Added discount columns to pos_transactions';
   END IF;
END $$;

-- =====================================================
-- PART 2: CREATE NEW DISCOUNT ACCOUNTING TABLES
-- =====================================================

-- 2.1 Promotional Discounts
CREATE TABLE IF NOT EXISTS promotional_discounts (
   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
   business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
   promo_code VARCHAR(50) UNIQUE NOT NULL,
   description TEXT,
   discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
   discount_value DECIMAL(15,2) NOT NULL CHECK (discount_value > 0),
   min_purchase DECIMAL(15,2),
   max_uses INTEGER CHECK (max_uses > 0),
   times_used INTEGER DEFAULT 0,
   per_customer_limit INTEGER CHECK (per_customer_limit > 0),
   valid_from TIMESTAMPTZ NOT NULL,
   valid_to TIMESTAMPTZ NOT NULL CHECK (valid_to > valid_from),
   is_active BOOLEAN DEFAULT true,
   created_by UUID REFERENCES users(id),
   created_at TIMESTAMPTZ DEFAULT NOW(),
   updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 Early Payment Terms
CREATE TABLE IF NOT EXISTS early_payment_terms (
   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
   business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
   term_name VARCHAR(50) NOT NULL,
   discount_percentage DECIMAL(5,2) NOT NULL CHECK (discount_percentage BETWEEN 0 AND 100),
   discount_days INTEGER NOT NULL CHECK (discount_days >= 0),
   net_days INTEGER NOT NULL CHECK (net_days > 0),
   is_active BOOLEAN DEFAULT true,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.3 Volume Discount Tiers
CREATE TABLE IF NOT EXISTS volume_discount_tiers (
   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
   business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
   tier_name VARCHAR(50) NOT NULL,
   min_quantity INTEGER CHECK (min_quantity > 0),
   min_amount DECIMAL(15,2) CHECK (min_amount > 0),
   discount_percentage DECIMAL(5,2) NOT NULL CHECK (discount_percentage BETWEEN 0 AND 100),
   applies_to VARCHAR(20) DEFAULT 'ALL' CHECK (applies_to IN ('ALL', 'PRODUCTS', 'SERVICES', 'CATEGORY')),
   target_category_id UUID REFERENCES inventory_categories(id),
   is_active BOOLEAN DEFAULT true,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   updated_at TIMESTAMPTZ DEFAULT NOW(),
   CHECK (
      (min_quantity IS NOT NULL OR min_amount IS NOT NULL)
   )
);

-- 2.4 Discount Allocations
CREATE TABLE IF NOT EXISTS discount_allocations (
   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
   business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
   discount_rule_id UUID,
   promotional_discount_id UUID REFERENCES promotional_discounts(id),
   invoice_id UUID REFERENCES invoices(id),
   pos_transaction_id UUID REFERENCES pos_transactions(id),
   journal_entry_id UUID,
   allocation_number VARCHAR(50) UNIQUE NOT NULL,
   total_discount_amount DECIMAL(15,2) NOT NULL CHECK (total_discount_amount > 0),
   allocation_method VARCHAR(20) NOT NULL CHECK (allocation_method IN ('PRO_RATA_AMOUNT', 'PRO_RATA_QUANTITY', 'MANUAL')),
   status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPLIED', 'VOID')),
   applied_at TIMESTAMPTZ,
   created_by UUID REFERENCES users(id),
   created_at TIMESTAMPTZ DEFAULT NOW(),
   updated_at TIMESTAMPTZ DEFAULT NOW(),
   CHECK (
      (discount_rule_id IS NOT NULL OR promotional_discount_id IS NOT NULL)
   )
);

-- 2.5 Discount Allocation Lines
CREATE TABLE IF NOT EXISTS discount_allocation_lines (
   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
   allocation_id UUID NOT NULL REFERENCES discount_allocations(id) ON DELETE CASCADE,
   pos_transaction_item_id UUID REFERENCES pos_transaction_items(id),
   invoice_line_item_id UUID REFERENCES invoice_line_items(id),
   line_amount DECIMAL(15,2) NOT NULL,
   discount_amount DECIMAL(15,2) NOT NULL,
   allocation_weight DECIMAL(10,4),
   created_at TIMESTAMPTZ DEFAULT NOW(),
   CHECK (
      (pos_transaction_item_id IS NOT NULL OR invoice_line_item_id IS NOT NULL)
   )
);

-- 2.6 Discount Analytics (FIXED VERSION)
CREATE TABLE IF NOT EXISTS discount_analytics (
   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
   business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
   analysis_date DATE NOT NULL,
   discount_rule_id UUID,
   promotional_discount_id UUID REFERENCES promotional_discounts(id),
   times_used INTEGER DEFAULT 0,
   total_discount_amount DECIMAL(15,2) DEFAULT 0,
   total_invoice_amount DECIMAL(15,2) DEFAULT 0,
   unique_customers INTEGER DEFAULT 0,
   created_at TIMESTAMPTZ DEFAULT NOW(),
   -- SIMPLIFIED UNIQUE CONSTRAINT
   UNIQUE(business_id, analysis_date, discount_rule_id, promotional_discount_id)
);

-- =====================================================
-- PART 3: ADD DISCOUNT ACCOUNTS TO CHART OF ACCOUNTS
-- =====================================================

DO $$
DECLARE
   biz RECORD;
BEGIN
   FOR biz IN SELECT id FROM businesses LOOP
      -- 4110 - Sales Discounts
      IF NOT EXISTS (
         SELECT 1 FROM chart_of_accounts 
         WHERE business_id = biz.id AND account_code = '4110'
      ) THEN
         INSERT INTO chart_of_accounts (
            business_id, account_code, account_name, account_type, 
            description, is_active, created_at
         ) VALUES (
            biz.id, '4110', 'Sales Discounts', 'revenue',
            'Contra-revenue account for all sales discounts', true, NOW()
         );
      END IF;

      -- 4111 - Volume Discounts
      IF NOT EXISTS (
         SELECT 1 FROM chart_of_accounts 
         WHERE business_id = biz.id AND account_code = '4111'
      ) THEN
         INSERT INTO chart_of_accounts (
            business_id, account_code, account_name, account_type, 
            description, is_active, created_at
         ) VALUES (
            biz.id, '4111', 'Volume Discounts', 'revenue',
            'Volume-based quantity discounts', true, NOW()
         );
      END IF;

      -- 4112 - Early Payment Discounts
      IF NOT EXISTS (
         SELECT 1 FROM chart_of_accounts 
         WHERE business_id = biz.id AND account_code = '4112'
      ) THEN
         INSERT INTO chart_of_accounts (
            business_id, account_code, account_name, account_type, 
            description, is_active, created_at
         ) VALUES (
            biz.id, '4112', 'Early Payment Discounts', 'revenue',
            'Discounts for early invoice payment (2/10, n/30)', true, NOW()
         );
      END IF;

      -- 4113 - Promotional Discounts
      IF NOT EXISTS (
         SELECT 1 FROM chart_of_accounts 
         WHERE business_id = biz.id AND account_code = '4113'
      ) THEN
         INSERT INTO chart_of_accounts (
            business_id, account_code, account_name, account_type, 
            description, is_active, created_at
         ) VALUES (
            biz.id, '4113', 'Promotional Discounts', 'revenue',
            'Campaign and promo code discounts', true, NOW()
         );
      END IF;
   END LOOP;
   
   RAISE NOTICE 'Added discount accounts to chart_of_accounts';
END $$;

-- =====================================================
-- PART 4: CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Promotional discounts indexes
CREATE INDEX IF NOT EXISTS idx_promotional_business_id ON promotional_discounts(business_id);
CREATE INDEX IF NOT EXISTS idx_promotional_promo_code ON promotional_discounts(promo_code);
CREATE INDEX IF NOT EXISTS idx_promotional_valid_dates ON promotional_discounts(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_promotional_is_active ON promotional_discounts(is_active);

-- Early payment terms indexes
CREATE INDEX IF NOT EXISTS idx_early_payment_business_id ON early_payment_terms(business_id);
CREATE INDEX IF NOT EXISTS idx_early_payment_is_active ON early_payment_terms(is_active);

-- Volume discount tiers indexes
CREATE INDEX IF NOT EXISTS idx_volume_tiers_business_id ON volume_discount_tiers(business_id);
CREATE INDEX IF NOT EXISTS idx_volume_tiers_category ON volume_discount_tiers(target_category_id) WHERE target_category_id IS NOT NULL;

-- Discount approvals indexes
CREATE INDEX IF NOT EXISTS idx_discount_approvals_transaction_id ON discount_approvals(pos_transaction_id) WHERE pos_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discount_approvals_status ON discount_approvals(status);

-- Discount allocations indexes
CREATE INDEX IF NOT EXISTS idx_discount_allocations_business_id ON discount_allocations(business_id);
CREATE INDEX IF NOT EXISTS idx_discount_allocations_invoice_id ON discount_allocations(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discount_allocations_transaction_id ON discount_allocations(pos_transaction_id) WHERE pos_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discount_allocations_status ON discount_allocations(status);
CREATE INDEX IF NOT EXISTS idx_discount_allocations_rule_id ON discount_allocations(discount_rule_id) WHERE discount_rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discount_allocations_promo_id ON discount_allocations(promotional_discount_id) WHERE promotional_discount_id IS NOT NULL;

-- Discount allocation lines indexes
CREATE INDEX IF NOT EXISTS idx_discount_lines_allocation_id ON discount_allocation_lines(allocation_id);
CREATE INDEX IF NOT EXISTS idx_discount_lines_pos_item_id ON discount_allocation_lines(pos_transaction_item_id) WHERE pos_transaction_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discount_lines_invoice_item_id ON discount_allocation_lines(invoice_line_item_id) WHERE invoice_line_item_id IS NOT NULL;

-- Discount analytics indexes
CREATE INDEX IF NOT EXISTS idx_discount_analytics_business_date ON discount_analytics(business_id, analysis_date);
CREATE INDEX IF NOT EXISTS idx_discount_analytics_rule_id ON discount_analytics(discount_rule_id) WHERE discount_rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discount_analytics_promo_id ON discount_analytics(promotional_discount_id) WHERE promotional_discount_id IS NOT NULL;

-- =====================================================
-- PART 5: HELPER FUNCTIONS
-- =====================================================

-- 5.1 Function to generate allocation number
CREATE OR REPLACE FUNCTION generate_discount_allocation_number(p_business_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
   v_year VARCHAR(4);
   v_month VARCHAR(2);
   v_sequence INTEGER;
   v_result VARCHAR(50);
BEGIN
   v_year := EXTRACT(YEAR FROM CURRENT_DATE)::VARCHAR;
   v_month := LPAD(EXTRACT(MONTH FROM CURRENT_DATE)::VARCHAR, 2, '0');
   
   SELECT COALESCE(MAX(SUBSTRING(allocation_number FROM '[0-9]+$')::INTEGER), 0) + 1
   INTO v_sequence
   FROM discount_allocations
   WHERE business_id = p_business_id
     AND allocation_number LIKE 'DA-' || v_year || '-' || v_month || '-%';
   
   v_result := 'DA-' || v_year || '-' || v_month || '-' || LPAD(v_sequence::VARCHAR, 4, '0');
   RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 5.2 Function to determine discount account based on rule type
CREATE OR REPLACE FUNCTION get_discount_account_code(p_rule_type VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
   RETURN CASE UPPER(p_rule_type)
      WHEN 'VOLUME' THEN '4111'
      WHEN 'EARLY_PAYMENT' THEN '4112'
      WHEN 'PROMOTIONAL' THEN '4113'
      WHEN 'PROMO' THEN '4113'
      ELSE '4110'
   END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5.3 Function to calculate pro-rata discount allocation
CREATE OR REPLACE FUNCTION calculate_pro_rata_discount(
   p_total_discount DECIMAL,
   p_line_amounts DECIMAL[],
   p_method VARCHAR DEFAULT 'amount'
) RETURNS DECIMAL[] AS $$
DECLARE
   v_total_amount DECIMAL := 0;
   v_allocations DECIMAL[];
   v_i INTEGER;
BEGIN
   -- Calculate total
   FOR v_i IN 1..array_length(p_line_amounts, 1) LOOP
      v_total_amount := v_total_amount + p_line_amounts[v_i];
   END LOOP;
   
   -- Allocate proportionally
   FOR v_i IN 1..array_length(p_line_amounts, 1) LOOP
      IF p_method = 'amount' THEN
         v_allocations[v_i] := ROUND((p_line_amounts[v_i] / v_total_amount) * p_total_discount, 2);
      ELSIF p_method = 'quantity' THEN
         v_allocations[v_i] := ROUND(p_total_discount / array_length(p_line_amounts, 1), 2);
      END IF;
   END LOOP;
   
   RETURN v_allocations;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 6: TRIGGERS FOR UPDATED_AT
-- =====================================================

-- Create trigger function if not exists
CREATE OR REPLACE FUNCTION update_discount_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for each table with updated_at
DROP TRIGGER IF EXISTS update_promotional_discounts_updated_at ON promotional_discounts;
CREATE TRIGGER update_promotional_discounts_updated_at
   BEFORE UPDATE ON promotional_discounts
   FOR EACH ROW
   EXECUTE FUNCTION update_discount_updated_at();

DROP TRIGGER IF EXISTS update_early_payment_terms_updated_at ON early_payment_terms;
CREATE TRIGGER update_early_payment_terms_updated_at
   BEFORE UPDATE ON early_payment_terms
   FOR EACH ROW
   EXECUTE FUNCTION update_discount_updated_at();

DROP TRIGGER IF EXISTS update_volume_discount_tiers_updated_at ON volume_discount_tiers;
CREATE TRIGGER update_volume_discount_tiers_updated_at
   BEFORE UPDATE ON volume_discount_tiers
   FOR EACH ROW
   EXECUTE FUNCTION update_discount_updated_at();

DROP TRIGGER IF EXISTS update_discount_allocations_updated_at ON discount_allocations;
CREATE TRIGGER update_discount_allocations_updated_at
   BEFORE UPDATE ON discount_allocations
   FOR EACH ROW
   EXECUTE FUNCTION update_discount_updated_at();

DROP TRIGGER IF EXISTS update_category_discount_rules_updated_at ON category_discount_rules;
CREATE TRIGGER update_category_discount_rules_updated_at
   BEFORE UPDATE ON category_discount_rules
   FOR EACH ROW
   EXECUTE FUNCTION update_discount_updated_at();

-- =====================================================
-- PART 7: ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE promotional_discounts IS 'Customer-facing promotional codes and campaigns';
COMMENT ON TABLE early_payment_terms IS 'Accounting terms like 2/10, n/30 for early payment discounts';
COMMENT ON TABLE volume_discount_tiers IS 'Quantity or amount-based discount tiers';
COMMENT ON TABLE discount_allocations IS 'Links discounts to invoices or POS transactions';
COMMENT ON TABLE discount_allocation_lines IS 'Line-item level discount allocations for accounting';
COMMENT ON TABLE discount_analytics IS 'Discount usage and effectiveness tracking';

COMMIT;
