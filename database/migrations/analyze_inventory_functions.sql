-- ============================================================================
-- ANALYZE THE INVENTORY UPDATE FUNCTIONS
-- ============================================================================

DO $$
DECLARE
    rec_record RECORD;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ANALYZING INVENTORY UPDATE FUNCTIONS';
    RAISE NOTICE '========================================';
    
    -- ========================================================================
    -- Check update_inventory_stock function
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '1. update_inventory_stock function:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT prosrc 
        FROM pg_proc 
        WHERE proname = 'update_inventory_stock'
    ) LOOP
        RAISE NOTICE '%', rec_record.prosrc;
    END LOOP;
    
    -- ========================================================================
    -- Check update_inventory_for_pos_transaction function
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '2. update_inventory_for_pos_transaction function:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT prosrc 
        FROM pg_proc 
        WHERE proname = 'update_inventory_for_pos_transaction'
    ) LOOP
        RAISE NOTICE '%', rec_record.prosrc;
    END LOOP;
    
    -- ========================================================================
    -- Check process_pos_sale function
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '3. process_pos_sale function:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT prosrc 
        FROM pg_proc 
        WHERE proname = 'process_pos_sale'
    ) LOOP
        RAISE NOTICE '%', rec_record.prosrc;
    END LOOP;
    
    -- ========================================================================
    -- Check sync_inventory_on_pos_sale trigger function again
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '4. Current trigger function (sync_inventory_on_pos_sale):';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT prosrc 
        FROM pg_proc 
        WHERE proname = 'sync_inventory_on_pos_sale'
    ) LOOP
        RAISE NOTICE '%', rec_record.prosrc;
    END LOOP;
    
END $$;
