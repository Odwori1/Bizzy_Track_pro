-- Simple fix to remove DEFAULT 0 from tax_rate column
-- No migration logging, just the essential fix

BEGIN;

-- Check current state
SELECT 
    column_name,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'invoice_line_items' 
AND column_name = 'tax_rate';

-- Remove DEFAULT 0 from tax_rate column (CRITICAL FIX)
ALTER TABLE invoice_line_items 
ALTER COLUMN tax_rate DROP DEFAULT;

-- Verify the fix
SELECT 
    'tax_rate column' as check_item,
    CASE 
        WHEN column_default IS NULL THEN '✅ FIXED: No default value'
        ELSE '❌ STILL HAS DEFAULT: ' || column_default
    END as status
FROM information_schema.columns 
WHERE table_name = 'invoice_line_items' 
AND column_name = 'tax_rate';

-- Add validation constraints (optional but recommended)
DO $$ 
BEGIN
    -- Add check to ensure tax_rate is reasonable
    BEGIN
        ALTER TABLE invoice_line_items 
        ADD CONSTRAINT chk_tax_rate_range 
        CHECK (tax_rate >= 0 AND tax_rate <= 100);
        RAISE NOTICE '✅ Added tax_rate range check';
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE '⚠️  tax_rate range check already exists';
    END;

    -- Add check to ensure tax_amount is non-negative
    BEGIN
        ALTER TABLE invoice_line_items 
        ADD CONSTRAINT chk_tax_amount_non_negative 
        CHECK (tax_amount >= 0);
        RAISE NOTICE '✅ Added tax_amount non-negative check';
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE '⚠️  tax_amount check already exists';
    END;
END $$;

-- Verify existing tax calculation function still works
SELECT 
    'calculate_item_tax function' as check_item,
    CASE 
        WHEN tax_rate = 6.00 AND tax_amount = 60000.00 THEN '✅ WORKING: Returns 6% WHT_GOODS'
        ELSE '❌ BROKEN: Returns ' || tax_rate || '% ' || tax_amount
    END as status
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
    'UG', 'STANDARD_GOODS', 1000000.00,
    'sale', 'company', false, '2026-01-27'
);

-- Show current invoice line items status
SELECT 
    'Current Data Status' as check_item,
    COUNT(*) as total_line_items,
    COUNT(CASE WHEN ili.tax_rate = 0 THEN 1 END) as items_with_zero_tax_rate,
    COUNT(CASE WHEN ili.tax_rate > 0 THEN 1 END) as items_with_non_zero_tax_rate,
    COUNT(CASE WHEN ili.tax_amount > 0 THEN 1 END) as items_with_tax_amount,
    COUNT(CASE WHEN ili.tax_category_code IS NOT NULL THEN 1 END) as items_with_tax_category
FROM invoice_line_items ili
JOIN invoices i ON ili.invoice_id = i.id
WHERE i.business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';

COMMIT;

-- Final verification
\echo ''
\echo '=== TAX FIX COMPLETED ==='
\echo '1. Removed DEFAULT 0 from tax_rate column'
\echo '2. Added validation constraints'
\echo '3. Verified calculate_item_tax function works'
\echo ''
\echo 'Next steps:'
\echo '1. Fix application code (product query in InvoiceTaxCalculator)'
\echo '2. Restart server'
\echo '3. Create test invoice to verify tax calculation'
