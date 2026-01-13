-- ============================================================================
-- MIGRATION 123: ADD PURCHASE ORDER PAYMENT COLUMNS
-- ============================================================================
-- Purpose: Add payment tracking columns to purchase_orders table
-- Date: 2026-01-09
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ADDING PURCHASE ORDER PAYMENT COLUMNS';
    RAISE NOTICE '========================================';
END;
$$;

-- ============================================================================
-- PART 1: ADD COLUMNS WITH IF NOT EXISTS CHECKS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Checking/adding payment columns to purchase_orders...';

    -- Add paid_amount column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'purchase_orders' 
                   AND column_name = 'paid_amount') THEN
        ALTER TABLE purchase_orders 
        ADD COLUMN paid_amount DECIMAL(15,2) DEFAULT 0;
        RAISE NOTICE '  ✅ Added paid_amount column (default: 0)';
    ELSE
        RAISE NOTICE '  ✅ paid_amount column already exists';
    END IF;

    -- Add payment_status column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'purchase_orders' 
                   AND column_name = 'payment_status') THEN
        ALTER TABLE purchase_orders 
        ADD COLUMN payment_status VARCHAR(20) DEFAULT 'unpaid';
        RAISE NOTICE '  ✅ Added payment_status column (default: unpaid)';
    ELSE
        RAISE NOTICE '  ✅ payment_status column already exists';
    END IF;

    -- Add payment_method column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'purchase_orders' 
                   AND column_name = 'payment_method') THEN
        ALTER TABLE purchase_orders 
        ADD COLUMN payment_method VARCHAR(50);
        RAISE NOTICE '  ✅ Added payment_method column';
    ELSE
        RAISE NOTICE '  ✅ payment_method column already exists';
    END IF;

    -- Add last_payment_date column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'purchase_orders' 
                   AND column_name = 'last_payment_date') THEN
        ALTER TABLE purchase_orders 
        ADD COLUMN last_payment_date TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE '  ✅ Added last_payment_date column';
    ELSE
        RAISE NOTICE '  ✅ last_payment_date column already exists';
    END IF;
END $$;

-- ============================================================================
-- PART 2: ADD CONSTRAINTS IF THEY DON'T EXIST
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Adding payment-related constraints...';

    -- Add payment_status check constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'purchase_orders_payment_status_check'
          AND conrelid = 'purchase_orders'::regclass
    ) THEN
        ALTER TABLE purchase_orders 
        ADD CONSTRAINT purchase_orders_payment_status_check 
        CHECK (payment_status IN ('unpaid', 'partial', 'paid'));
        RAISE NOTICE '  ✅ Added payment_status check constraint';
    ELSE
        RAISE NOTICE '  ✅ payment_status check constraint already exists';
    END IF;

    -- Add payment_method check constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'purchase_orders_payment_method_check'
          AND conrelid = 'purchase_orders'::regclass
    ) THEN
        ALTER TABLE purchase_orders 
        ADD CONSTRAINT purchase_orders_payment_method_check 
        CHECK (payment_method IN ('cash', 'bank', 'mobile_money', 'accounts_payable'));
        RAISE NOTICE '  ✅ Added payment_method check constraint';
    ELSE
        RAISE NOTICE '  ✅ payment_method check constraint already exists';
    END IF;
END $$;

-- ============================================================================
-- PART 3: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Creating indexes for payment queries...';

    -- Index for payment_status
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'purchase_orders' 
        AND indexname = 'idx_purchase_orders_payment_status'
    ) THEN
        CREATE INDEX idx_purchase_orders_payment_status 
        ON purchase_orders(payment_status);
        RAISE NOTICE '  ✅ Created idx_purchase_orders_payment_status';
    ELSE
        RAISE NOTICE '  ✅ idx_purchase_orders_payment_status already exists';
    END IF;

    -- Index for payment_method
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'purchase_orders' 
        AND indexname = 'idx_purchase_orders_payment_method'
    ) THEN
        CREATE INDEX idx_purchase_orders_payment_method 
        ON purchase_orders(payment_method);
        RAISE NOTICE '  ✅ Created idx_purchase_orders_payment_method';
    ELSE
        RAISE NOTICE '  ✅ idx_purchase_orders_payment_method already exists';
    END IF;

    -- Index for last_payment_date
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'purchase_orders' 
        AND indexname = 'idx_purchase_orders_last_payment_date'
    ) THEN
        CREATE INDEX idx_purchase_orders_last_payment_date 
        ON purchase_orders(last_payment_date);
        RAISE NOTICE '  ✅ Created idx_purchase_orders_last_payment_date';
    ELSE
        RAISE NOTICE '  ✅ idx_purchase_orders_last_payment_date already exists';
    END IF;
END $$;

-- ============================================================================
-- PART 4: VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_column_count INTEGER;
    v_constraint_count INTEGER;
    v_index_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Verifying changes...';

    -- Count columns
    SELECT COUNT(*) INTO v_column_count
    FROM information_schema.columns
    WHERE table_name = 'purchase_orders'
      AND column_name IN ('paid_amount', 'payment_status', 'payment_method', 'last_payment_date');

    -- Count constraints
    SELECT COUNT(*) INTO v_constraint_count
    FROM pg_constraint
    WHERE conrelid = 'purchase_orders'::regclass
      AND conname IN ('purchase_orders_payment_status_check', 'purchase_orders_payment_method_check');

    -- Count indexes
    SELECT COUNT(*) INTO v_index_count
    FROM pg_indexes
    WHERE tablename = 'purchase_orders'
      AND indexname IN ('idx_purchase_orders_payment_status', 'idx_purchase_orders_payment_method', 'idx_purchase_orders_last_payment_date');

    RAISE NOTICE 'Added columns: %', v_column_count;
    RAISE NOTICE 'Added constraints: %', v_constraint_count;
    RAISE NOTICE 'Added indexes: %', v_index_count;

    IF v_column_count >= 4 THEN
        RAISE NOTICE '✅ All columns added successfully';
    ELSE
        RAISE NOTICE '⚠️ Some columns may be missing';
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
    RAISE NOTICE 'MIGRATION 123 COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Added payment tracking to purchase_orders table';
    RAISE NOTICE '';
    RAISE NOTICE 'Columns added:';
    RAISE NOTICE '  • paid_amount - Tracks how much has been paid (default: 0)';
    RAISE NOTICE '  • payment_status - unpaid/partial/paid (default: unpaid)';
    RAISE NOTICE '  • payment_method - cash/bank/mobile_money/accounts_payable';
    RAISE NOTICE '  • last_payment_date - Timestamp of most recent payment';
    RAISE NOTICE '';
    RAISE NOTICE 'Next migration: Create vendor_payments table';
    RAISE NOTICE '========================================';
END $$;
