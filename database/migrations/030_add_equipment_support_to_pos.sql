-- ============================================================================
-- MIGRATION: Add Equipment Support to POS Transaction Items
-- ============================================================================
-- Purpose: Enable unified transaction tracking for equipment hire
-- Date: $(date +%Y-%m-%d)
-- Priority: CRITICAL - Unblocks equipment hire revenue processing
-- ============================================================================

-- 1. Add equipment support columns to pos_transaction_items
ALTER TABLE pos_transaction_items 
ADD COLUMN equipment_id UUID REFERENCES equipment_assets(id),
ADD COLUMN booking_id UUID REFERENCES equipment_hire_bookings(id);

-- 2. Create indexes for performance
CREATE INDEX idx_pos_transaction_items_equipment ON pos_transaction_items(equipment_id) WHERE equipment_id IS NOT NULL;
CREATE INDEX idx_pos_transaction_items_booking ON pos_transaction_items(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_pos_transaction_items_type ON pos_transaction_items(item_type);

-- 3. Update process_pos_sale function to handle equipment hire (if exists)
DO $$
BEGIN
    -- Check if function exists, create or update as needed
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'process_pos_sale') THEN
        -- Note: We may need to update this function later
        RAISE NOTICE 'Function process_pos_sale exists. May need manual update for equipment support.';
    END IF;
END $$;

-- ============================================================================
-- ROLLBACK SQL (for safety)
-- ============================================================================
-- To rollback this migration:
-- DROP INDEX IF EXISTS idx_pos_transaction_items_equipment;
-- DROP INDEX IF EXISTS idx_pos_transaction_items_booking;
-- DROP INDEX IF EXISTS idx_pos_transaction_items_type;
-- ALTER TABLE pos_transaction_items 
--   DROP COLUMN IF EXISTS equipment_id,
--   DROP COLUMN IF EXISTS booking_id;
-- ============================================================================
