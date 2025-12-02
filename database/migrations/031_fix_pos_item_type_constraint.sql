-- ============================================================================
-- MIGRATION: Fix POS Transaction Item Type Constraint
-- ============================================================================
-- Purpose: Allow 'equipment_hire' in pos_transaction_items.item_type
-- Date: $(date +%Y-%m-%d)
-- Priority: CRITICAL - Unblocks equipment hire transactions
-- ============================================================================

-- 1. Drop the existing check constraint
ALTER TABLE pos_transaction_items 
DROP CONSTRAINT IF EXISTS pos_transaction_items_item_type_check;

-- 2. Create new constraint with all allowed item types
ALTER TABLE pos_transaction_items 
ADD CONSTRAINT pos_transaction_items_item_type_check 
CHECK (item_type IN ('product', 'service', 'equipment_hire'));

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- To verify: SELECT * FROM information_schema.check_constraints 
-- WHERE constraint_name = 'pos_transaction_items_item_type_check';

-- ============================================================================
-- ROLLBACK SQL (for safety)
-- ============================================================================
-- ALTER TABLE pos_transaction_items 
-- DROP CONSTRAINT IF EXISTS pos_transaction_items_item_type_check;
-- 
-- ALTER TABLE pos_transaction_items 
-- ADD CONSTRAINT pos_transaction_items_item_type_check 
-- CHECK (item_type IN ('product', 'service'));
-- ============================================================================
