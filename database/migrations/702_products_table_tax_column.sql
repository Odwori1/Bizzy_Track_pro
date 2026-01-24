-- Check if tax_category_code column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products' 
    AND table_schema = 'public'
    AND column_name = 'tax_category_code';

-- Add column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'tax_category_code') THEN
        ALTER TABLE products ADD COLUMN tax_category_code VARCHAR(30) DEFAULT 'STANDARD_GOODS';
        
        -- Add foreign key constraint
        ALTER TABLE products 
        ADD CONSTRAINT fk_products_tax_category 
        FOREIGN KEY (tax_category_code) 
        REFERENCES product_tax_categories(category_code);
        
        RAISE NOTICE 'Added tax_category_code column to products table';
    ELSE
        RAISE NOTICE 'tax_category_code column already exists';
    END IF;
END $$;

-- Update existing products
UPDATE products 
SET tax_category_code = 'STANDARD_GOODS' 
WHERE tax_category_code IS NULL 
    AND business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';

-- Verify
SELECT COUNT(*) as updated_count FROM products 
WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256' 
    AND tax_category_code = 'STANDARD_GOODS';

-- Show sample products with tax categories
SELECT 
    p.name,
    p.tax_category_code,
    ptc.category_name,
    ptc.global_treatment
FROM products p
LEFT JOIN product_tax_categories ptc ON ptc.category_code = p.tax_category_code
WHERE p.business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
LIMIT 5;
