-- ============================================================================
-- MIGRATION: Production Discount System Fixes
-- Date: 2026-06-02
-- Business: 0eb7d105-d6cb-43c1-b497-41a710d37b4b
-- ============================================================================

-- 1. Add temporal validity fields to volume_discount_tiers
ALTER TABLE volume_discount_tiers 
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE;

UPDATE volume_discount_tiers 
SET start_date = created_at::date 
WHERE start_date IS NULL;

-- 2. Add stacking configuration to discount_settings
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discount_settings' 
                   AND column_name = 'stacking_mode') THEN
        ALTER TABLE discount_settings 
        ADD COLUMN stacking_mode VARCHAR(20) DEFAULT 'best_only';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discount_settings' 
                   AND column_name = 'allow_volume_promo_stack') THEN
        ALTER TABLE discount_settings 
        ADD COLUMN allow_volume_promo_stack BOOLEAN DEFAULT false;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discount_settings' 
                   AND column_name = 'allow_auto_promo_stack') THEN
        ALTER TABLE discount_settings 
        ADD COLUMN allow_auto_promo_stack BOOLEAN DEFAULT false;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discount_settings' 
                   AND column_name = 'max_stack_depth') THEN
        ALTER TABLE discount_settings 
        ADD COLUMN max_stack_depth INTEGER DEFAULT 1;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discount_settings' 
                   AND column_name = 'max_discount_percentage') THEN
        ALTER TABLE discount_settings 
        ADD COLUMN max_discount_percentage NUMERIC(5,2) DEFAULT 50.00;
    END IF;
END $$;

-- 3. Add volume discount reference to discount_allocations
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discount_allocations' 
                   AND column_name = 'volume_discount_tier_id') THEN
        ALTER TABLE discount_allocations 
        ADD COLUMN volume_discount_tier_id UUID REFERENCES volume_discount_tiers(id);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discount_allocations' 
                   AND column_name = 'category_discount_rule_id') THEN
        ALTER TABLE discount_allocations 
        ADD COLUMN category_discount_rule_id UUID REFERENCES category_discount_rules(id);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discount_allocations' 
                   AND column_name = 'early_payment_term_id') THEN
        ALTER TABLE discount_allocations 
        ADD COLUMN early_payment_term_id UUID REFERENCES early_payment_terms(id);
    END IF;
END $$;

-- 4. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_volume_tiers_business_active 
ON volume_discount_tiers(business_id, is_active);

CREATE INDEX IF NOT EXISTS idx_allocations_volume_tier 
ON discount_allocations(volume_discount_tier_id) 
WHERE volume_discount_tier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discount_settings_business 
ON discount_settings(business_id);

-- 5. Update existing settings to safe defaults
UPDATE discount_settings 
SET stacking_mode = 'best_only',
    allow_volume_promo_stack = false,
    allow_auto_promo_stack = false,
    max_stack_depth = 1,
    max_discount_percentage = 50.00
WHERE stacking_mode IS NULL;

-- 6. Verify migration
SELECT 'Migration complete' as status,
       COUNT(*) as total_volume_tiers,
       COUNT(start_date) as tiers_with_dates,
       (SELECT COUNT(*) FROM discount_settings) as settings_count
FROM volume_discount_tiers;
