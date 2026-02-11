-- File: ~/Bizzy_Track_pro/backend/database/migrations/711_pos_tax_integration.sql
-- Migration: 711_pos_tax_integration.sql
-- Date: $(date)
-- Purpose: Add tax calculation support to POS system

-- ============================================
-- 1. ADD CUSTOMER_TYPE TO TRANSACTION_TAXES (MISSING COLUMN)
-- ============================================
ALTER TABLE transaction_taxes
ADD COLUMN customer_type VARCHAR(30) DEFAULT 'company',
ADD COLUMN customer_id UUID;

-- Add index for customer type queries
CREATE INDEX idx_transaction_taxes_customer_type 
ON transaction_taxes(customer_type, business_id);

COMMENT ON COLUMN transaction_taxes.customer_type IS 'Customer type for tax calculation: company, individual, government, walk_in';
COMMENT ON COLUMN transaction_taxes.customer_id IS 'Reference to customers table if available';

-- ============================================
-- 2. ADD TAX COLUMNS TO POS_TRANSACTION_ITEMS
-- ============================================
ALTER TABLE pos_transaction_items
ADD COLUMN tax_rate DECIMAL(5,2),
ADD COLUMN tax_amount DECIMAL(15,2),
ADD COLUMN tax_category_code VARCHAR(30);

-- Add foreign key to product_tax_categories
ALTER TABLE pos_transaction_items
ADD CONSTRAINT fk_pos_transaction_items_tax_category
FOREIGN KEY (tax_category_code)
REFERENCES product_tax_categories(category_code)
ON DELETE SET NULL;

-- Add index for tax queries
CREATE INDEX idx_pos_transaction_items_tax 
ON pos_transaction_items(tax_category_code, business_id);

COMMENT ON COLUMN pos_transaction_items.tax_rate IS 'Tax rate applied to this line item (%)';
COMMENT ON COLUMN pos_transaction_items.tax_amount IS 'Tax amount for this line item';
COMMENT ON COLUMN pos_transaction_items.tax_category_code IS 'Tax category code for this item';

-- ============================================
-- 3. ADD AVERAGE TAX RATE TO POS_TRANSACTIONS
-- ============================================
ALTER TABLE pos_transactions
ADD COLUMN tax_rate DECIMAL(5,2);

COMMENT ON COLUMN pos_transactions.tax_rate IS 'Average tax rate for the transaction (%)';

-- ============================================
-- 4. CREATE FUNCTION TO CALCULATE POS TAX
-- ============================================
CREATE OR REPLACE FUNCTION calculate_pos_item_tax(
    p_business_id UUID,
    p_country_code VARCHAR(2),
    p_product_category VARCHAR(30),
    p_amount DECIMAL(15,2),
    p_customer_type VARCHAR(30) DEFAULT 'company',
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    tax_type_id UUID,
    tax_type_code VARCHAR(20),
    tax_rate DECIMAL(5,2),
    tax_amount DECIMAL(15,2),
    is_exempt BOOLEAN,
    is_zero_rated BOOLEAN
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM calculate_item_tax(
        p_business_id,
        p_country_code,
        p_product_category,
        p_amount,
        'sale',  -- POS transactions are always sales
        p_customer_type,
        false,   -- isExport - POS sales are usually domestic
        p_date
    );
END;
$$;

COMMENT ON FUNCTION calculate_pos_item_tax IS 'Wrapper function for POS tax calculations';

-- ============================================
-- 5. UPDATE EXISTING DATA (BACKFILL)
-- ============================================
-- Note: This is optional - only if you want to backfill existing transactions
-- with default tax values. We'll handle it in the application.

-- ============================================
-- 6. CREATE INDEXES FOR PERFORMANCE
-- ============================================
-- Index for tax calculations by business
CREATE INDEX idx_pos_tax_calc_business 
ON transaction_taxes(business_id, transaction_date, tax_type_id);

-- Index for POS tax reporting
CREATE INDEX idx_pos_tax_reporting 
ON pos_transaction_items(pos_transaction_id, tax_category_code, tax_amount);

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
