-- Migration: 707_production_tax_integration.sql
-- Description: Production-grade tax integration for invoices
-- Features: Idempotent, handles existing data, supports multiple businesses

BEGIN;

-- ============================================
-- PART 1: ADD TAX CATEGORY SUPPORT TO INVOICE LINE ITEMS
-- ============================================

-- 1. Add tax_category_code with proper constraints
DO $$
BEGIN
    -- Check if column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoice_line_items' 
                   AND column_name = 'tax_category_code') THEN
        -- Add column with DEFAULT for existing businesses
        ALTER TABLE invoice_line_items 
        ADD COLUMN tax_category_code VARCHAR(30) DEFAULT 'STANDARD_GOODS';
        
        RAISE NOTICE 'Added tax_category_code column to invoice_line_items';
    ELSE
        RAISE NOTICE 'tax_category_code column already exists';
    END IF;
END $$;

-- 2. Add foreign key constraint (DEFERRABLE for data integrity)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE table_name = 'invoice_line_items' 
                   AND constraint_name = 'fk_invoice_items_tax_category') THEN
        ALTER TABLE invoice_line_items
        ADD CONSTRAINT fk_invoice_items_tax_category
        FOREIGN KEY (tax_category_code)
        REFERENCES product_tax_categories(category_code)
        DEFERRABLE INITIALLY DEFERRED;
        
        RAISE NOTICE 'Added foreign key constraint for tax_category_code';
    ELSE
        RAISE NOTICE 'Foreign key constraint already exists';
    END IF;
END $$;

-- 3. Add product_id column for linking to products
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoice_line_items' 
                   AND column_name = 'product_id') THEN
        ALTER TABLE invoice_line_items 
        ADD COLUMN product_id UUID REFERENCES products(id);
        
        RAISE NOTICE 'Added product_id column to invoice_line_items';
    ELSE
        RAISE NOTICE 'product_id column already exists';
    END IF;
END $$;

-- ============================================
-- PART 2: ADD INDEXES FOR PERFORMANCE
-- ============================================

-- 4. Create indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_invoice_items_tax_category 
ON invoice_line_items(tax_category_code);

CREATE INDEX IF NOT EXISTS idx_invoice_items_product 
ON invoice_line_items(product_id);

CREATE INDEX IF NOT EXISTS idx_invoice_items_service 
ON invoice_line_items(service_id);

-- 5. Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_invoice_items_lookup 
ON invoice_line_items(invoice_id, product_id, service_id);

-- ============================================
-- PART 3: ENHANCE TRANSACTION_TAXES FOR BETTER REPORTING
-- ============================================

-- 6. Add business_id index for RLS performance
CREATE INDEX IF NOT EXISTS idx_transaction_taxes_business 
ON transaction_taxes(business_id);

-- 7. Add period index for tax return queries
CREATE INDEX IF NOT EXISTS idx_transaction_taxes_period 
ON transaction_taxes(tax_period, business_id);

-- ============================================
-- PART 4: CREATE HELPER FUNCTIONS FOR TAX CALCULATION
-- ============================================

-- 8. Function to get product tax category
CREATE OR REPLACE FUNCTION get_product_tax_category(p_product_id UUID)
RETURNS VARCHAR(30) AS $$
DECLARE
    v_tax_category VARCHAR(30);
BEGIN
    SELECT tax_category_code INTO v_tax_category
    FROM products 
    WHERE id = p_product_id;
    
    RETURN COALESCE(v_tax_category, 'STANDARD_GOODS');
EXCEPTION WHEN OTHERS THEN
    RETURN 'STANDARD_GOODS';
END;
$$ LANGUAGE plpgsql STABLE;

-- 9. Function to calculate invoice line tax
CREATE OR REPLACE FUNCTION calculate_line_item_tax(
    p_business_id UUID,
    p_product_id UUID,
    p_product_category VARCHAR(30),
    p_amount DECIMAL,
    p_transaction_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    tax_rate DECIMAL(5,2),
    tax_amount DECIMAL(15,2),
    tax_code VARCHAR(20),
    tax_name VARCHAR(100)
) AS $$
BEGIN
    -- Use the existing calculate_item_tax function
    RETURN QUERY
    SELECT 
        ti.tax_rate,
        ti.tax_amount,
        ti.tax_type_code,
        ti.tax_type_name
    FROM calculate_item_tax(
        p_business_id,
        'UG', -- Default to Uganda, can be extended
        p_product_category,
        p_amount,
        'sale',
        'company',
        false,
        p_transaction_date
    ) ti;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- PART 5: UPDATE EXISTING DATA (IF ANY)
-- ============================================

-- 10. Update any existing invoice_line_items (though we have none)
DO $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE invoice_line_items ili
    SET tax_category_code = 'STANDARD_GOODS'
    WHERE tax_category_code IS NULL;
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    IF v_updated_count > 0 THEN
        RAISE NOTICE 'Updated % existing invoice line items with default tax category', v_updated_count;
    ELSE
        RAISE NOTICE 'No existing invoice line items to update';
    END IF;
END $$;

-- ============================================
-- PART 6: VERIFICATION AND REPORTING
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'PRODUCTION TAX INTEGRATION MIGRATION COMPLETE';
    RAISE NOTICE '============================================';
    RAISE NOTICE '✅ Added tax_category_code to invoice_line_items';
    RAISE NOTICE '✅ Added product_id for product linking';
    RAISE NOTICE '✅ Created helper functions for tax calculation';
    RAISE NOTICE '✅ Added performance indexes';
    RAISE NOTICE '✅ Ready for multi-business support';
    RAISE NOTICE '============================================';
END $$;

COMMIT;
