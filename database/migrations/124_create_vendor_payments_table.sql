-- ============================================================================
-- MIGRATION 124: CREATE VENDOR PAYMENTS TABLE (SIMPLIFIED)
-- ============================================================================
-- Purpose: Create vendor_payments table for tracking PO payments
-- Date: 2026-01-09
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CREATING VENDOR PAYMENTS TABLE';
    RAISE NOTICE '========================================';
END;
$$;

-- ============================================================================
-- PART 1: CLEAN UP IF EXISTS
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_schema = 'public' 
               AND table_name = 'vendor_payments') THEN
        RAISE NOTICE 'Clearing existing vendor_payments table...';
        DROP TABLE IF EXISTS vendor_payments CASCADE;
        RAISE NOTICE '✅ Cleared existing table';
    END IF;
END $$;

-- ============================================================================
-- PART 2: CREATE TABLE AND ALL OBJECTS IN ONE DO BLOCK
-- ============================================================================

DO $$
BEGIN
    -- Create the table
    CREATE TABLE vendor_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        supplier_id UUID NOT NULL REFERENCES suppliers(id),
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
        payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'bank', 'mobile_money', 'accounts_payable')),
        wallet_id UUID REFERENCES money_wallets(id),
        reference_number VARCHAR(100),
        notes TEXT,
        journal_entry_id UUID REFERENCES journal_entries(id),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    RAISE NOTICE '✅ Created vendor_payments table';
    
    -- Create indexes
    CREATE INDEX idx_vendor_payments_business ON vendor_payments(business_id);
    CREATE INDEX idx_vendor_payments_purchase_order ON vendor_payments(purchase_order_id);
    CREATE INDEX idx_vendor_payments_supplier ON vendor_payments(supplier_id);
    CREATE INDEX idx_vendor_payments_date ON vendor_payments(payment_date);
    CREATE INDEX idx_vendor_payments_payment_method ON vendor_payments(payment_method);
    CREATE INDEX idx_vendor_payments_journal_entry ON vendor_payments(journal_entry_id);
    
    RAISE NOTICE '✅ Created indexes for vendor_payments table';
    
    -- Enable RLS
    ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;
    
    -- Create RLS policy
    CREATE POLICY vendor_payments_business_isolation ON vendor_payments
        USING (business_id = current_setting('app.current_business_id')::UUID);
    
    RAISE NOTICE '✅ Created RLS policy for vendor_payments';
    
    -- Create trigger for updated_at
    CREATE TRIGGER set_vendor_payments_updated_at
        BEFORE UPDATE ON vendor_payments
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    
    RAISE NOTICE '✅ Created updated_at trigger for vendor_payments';
END $$;

-- ============================================================================
-- PART 3: VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_table_exists BOOLEAN;
    v_column_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Verifying table creation...';
    
    -- Check if table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'vendor_payments'
    ) INTO v_table_exists;
    
    IF v_table_exists THEN
        -- Count columns
        SELECT COUNT(*) INTO v_column_count
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vendor_payments';
        
        RAISE NOTICE '✅ vendor_payments table created successfully';
        RAISE NOTICE '  Total columns: %', v_column_count;
        
        IF v_column_count >= 14 THEN
            RAISE NOTICE '✅ All expected columns present';
        END IF;
    ELSE
        RAISE NOTICE '❌ vendor_payments table not created';
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- POST-MIGRATION SUMMARY
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 124 COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Database schema ready for Phase 2!';
    RAISE NOTICE 'Next: Implement payment endpoints and logic';
    RAISE NOTICE '========================================';
END $$;
