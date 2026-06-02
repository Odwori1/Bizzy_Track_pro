-- ============================================================================
-- MIGRATION: Discount System Fixes for Volume Auto-Apply & Completeness
-- Date: 2026-05-31
-- ============================================================================

-- 1. Add temporal validity fields to volume_discount_tiers
ALTER TABLE volume_discount_tiers 
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE;

-- Update existing tiers to have default start_date (backward compatible)
UPDATE volume_discount_tiers 
SET start_date = created_at::date 
WHERE start_date IS NULL;

-- 2. Add volume discount reference to discount_allocations
-- Check if column exists first
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discount_allocations' 
                   AND column_name = 'volume_discount_tier_id') THEN
        ALTER TABLE discount_allocations 
        ADD COLUMN volume_discount_tier_id UUID REFERENCES volume_discount_tiers(id);
    END IF;
END $$;

-- 3. Add category discount reference to discount_allocations
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discount_allocations' 
                   AND column_name = 'category_discount_rule_id') THEN
        ALTER TABLE discount_allocations 
        ADD COLUMN category_discount_rule_id UUID REFERENCES category_discount_rules(id);
    END IF;
END $$;

-- 4. Add early payment reference to discount_allocations
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discount_allocations' 
                   AND column_name = 'early_payment_term_id') THEN
        ALTER TABLE discount_allocations 
        ADD COLUMN early_payment_term_id UUID REFERENCES early_payment_terms(id);
    END IF;
END $$;

-- 5. Add stacking configuration to discount_settings
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discount_settings' 
                   AND column_name = 'allow_volume_promo_stacking') THEN
        ALTER TABLE discount_settings 
        ADD COLUMN allow_volume_promo_stacking BOOLEAN DEFAULT true;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discount_settings' 
                   AND column_name = 'allow_category_volume_stacking') THEN
        ALTER TABLE discount_settings 
        ADD COLUMN allow_category_volume_stacking BOOLEAN DEFAULT true;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discount_settings' 
                   AND column_name = 'max_stack_depth') THEN
        ALTER TABLE discount_settings 
        ADD COLUMN max_stack_depth INTEGER DEFAULT 2;
    END IF;
END $$;

-- 6. Add index for volume discount tier lookups by business + active
CREATE INDEX IF NOT EXISTS idx_volume_tiers_business_active 
ON volume_discount_tiers(business_id, is_active);

-- 7. Add index for allocation lookups by volume tier
CREATE INDEX IF NOT EXISTS idx_allocations_volume_tier 
ON discount_allocations(volume_discount_tier_id) 
WHERE volume_discount_tier_id IS NOT NULL;

-- 8. Verify the migration
SELECT 'Migration complete' as status,
       COUNT(*) as total_volume_tiers,
       COUNT(start_date) as tiers_with_start_date
FROM volume_discount_tiers;
