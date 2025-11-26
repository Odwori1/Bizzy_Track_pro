-- ============================================================================
-- MIGRATION: Remove expense_categories unique constraint entirely
-- ============================================================================

-- Drop the existing unique constraint
ALTER TABLE expense_categories 
DROP CONSTRAINT IF EXISTS expense_categories_business_id_name_key;

-- Also drop the new one if it exists
ALTER TABLE expense_categories 
DROP CONSTRAINT IF EXISTS expense_categories_business_id_name_active_key;
