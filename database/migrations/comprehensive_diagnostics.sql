-- ============================================================================
-- COMPREHENSIVE SYSTEM DIAGNOSTIC
-- This will reveal all triggers, functions, and processes that affect refunds
-- ============================================================================

DO $$
DECLARE
    rec_record RECORD;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SYSTEM DIAGNOSTIC - REFUND MECHANISMS';
    RAISE NOTICE '========================================';
    
    -- 1. Check all triggers on key tables
    RAISE NOTICE '';
    RAISE NOTICE '1. TRIGGERS ON KEY TABLES:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT 
            tgname as trigger_name,
            tgrelid::regclass as table_name,
            tgfoid::regproc as function_name,
            CASE tgtype & 1 WHEN 1 THEN 'ROW ' ELSE 'STATEMENT ' END ||
            CASE tgtype & 2 WHEN 2 THEN 'BEFORE ' ELSE '' END ||
            CASE tgtype & 4 WHEN 4 THEN 'AFTER ' ELSE '' END ||
            CASE tgtype & 64 WHEN 64 THEN 'INSERT ' ELSE '' END ||
            CASE tgtype & 128 WHEN 128 THEN 'DELETE ' ELSE '' END ||
            CASE tgtype & 256 WHEN 256 THEN 'UPDATE ' ELSE '' END as timing_event
        FROM pg_trigger
        WHERE tgrelid IN (
            'pos_transactions'::regclass,
            'pos_transaction_items'::regclass,
            'refunds'::regclass,
            'refund_items'::regclass,
            'inventory_items'::regclass,
            'inventory_transactions'::regclass,
            'discount_allocations'::regclass
        )
        AND tgname NOT LIKE 'pg_%'
        ORDER BY table_name, trigger_name
    ) LOOP
        RAISE NOTICE '   % on %: % (%)', 
            rec_record.trigger_name, 
            rec_record.table_name,
            rec_record.function_name,
            rec_record.timing_event;
    END LOOP;
    
    -- 2. Check discount allocation triggers and functions
    RAISE NOTICE '';
    RAISE NOTICE '2. DISCOUNT ALLOCATION FUNCTIONS:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT 
            proname as function_name,
            pg_get_functiondef(oid) as function_definition
        FROM pg_proc
        WHERE proname LIKE '%discount%allocation%'
           OR proname LIKE '%discount%distribute%'
           OR proname LIKE '%allocate%discount%'
        ORDER BY proname
    ) LOOP
        RAISE NOTICE '   Function: %', rec_record.function_name;
        RAISE NOTICE '   Definition: %', left(rec_record.function_definition, 200);
        RAISE NOTICE '   ---';
    END LOOP;
    
    -- 3. Check inventory management functions
    RAISE NOTICE '';
    RAISE NOTICE '3. INVENTORY MANAGEMENT FUNCTIONS:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT 
            proname as function_name,
            pg_get_functiondef(oid) as function_definition
        FROM pg_proc
        WHERE proname LIKE '%inventory%update%'
           OR proname LIKE '%stock%adjust%'
           OR proname LIKE '%cogs%'
           OR proname LIKE '%reverse%inventory%'
        ORDER BY proname
    ) LOOP
        RAISE NOTICE '   Function: %', rec_record.function_name;
        RAISE NOTICE '   Definition: %', left(rec_record.function_definition, 200);
        RAISE NOTICE '   ---';
    END LOOP;
    
    -- 4. Check POS processing functions
    RAISE NOTICE '';
    RAISE NOTICE '4. POS PROCESSING FUNCTIONS:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT 
            proname as function_name,
            pg_get_functiondef(oid) as function_definition
        FROM pg_proc
        WHERE proname LIKE '%process%pos%'
           OR proname LIKE '%complete%transaction%'
           OR proname LIKE '%pos%journal%'
        ORDER BY proname
    ) LOOP
        RAISE NOTICE '   Function: %', rec_record.function_name;
        RAISE NOTICE '   Definition: %', left(rec_record.function_definition, 200);
        RAISE NOTICE '   ---';
    END LOOP;
    
    -- 5. Check refund processing functions
    RAISE NOTICE '';
    RAISE NOTICE '5. REFUND PROCESSING FUNCTIONS:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT 
            proname as function_name,
            pg_get_functiondef(oid) as function_definition
        FROM pg_proc
        WHERE proname LIKE '%process%refund%'
           OR proname LIKE '%refund%approve%'
           OR proname LIKE '%reverse%transaction%'
        ORDER BY proname
    ) LOOP
        RAISE NOTICE '   Function: %', rec_record.function_name;
        RAISE NOTICE '   Definition: %', left(rec_record.function_definition, 200);
        RAISE NOTICE '   ---';
    END LOOP;
    
    -- 6. Check actual discount allocations in database
    RAISE NOTICE '';
    RAISE NOTICE '6. DISCOUNT ALLOCATION SCHEMA:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT 
            column_name,
            data_type,
            is_nullable
        FROM information_schema.columns
        WHERE table_name = 'discount_allocations'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', 
            rec_record.column_name, 
            rec_record.data_type, 
            rec_record.is_nullable;
    END LOOP;
    
    -- 7. Check how discounts are stored in POS transactions
    RAISE NOTICE '';
    RAISE NOTICE '7. POS TRANSACTION DISCOUNT FIELDS:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT 
            column_name,
            data_type,
            is_nullable
        FROM information_schema.columns
        WHERE table_name = 'pos_transactions'
          AND column_name LIKE '%discount%'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', 
            rec_record.column_name, 
            rec_record.data_type, 
            rec_record.is_nullable;
    END LOOP;
    
    -- 8. Check if there's a discount allocation trigger on POS transaction insert/update
    RAISE NOTICE '';
    RAISE NOTICE '8. TRIGGERS ON POS_TRANSACTIONS FOR DISCOUNTS:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT 
            tgname as trigger_name,
            tgfoid::regproc as function_name,
            CASE tgtype & 1 WHEN 1 THEN 'ROW ' ELSE 'STATEMENT ' END ||
            CASE tgtype & 2 WHEN 2 THEN 'BEFORE ' ELSE '' END ||
            CASE tgtype & 4 WHEN 4 THEN 'AFTER ' ELSE '' END ||
            CASE tgtype & 64 WHEN 64 THEN 'INSERT ' ELSE '' END ||
            CASE tgtype & 128 WHEN 128 THEN 'DELETE ' ELSE '' END ||
            CASE tgtype & 256 WHEN 256 THEN 'UPDATE ' ELSE '' END as timing_event
        FROM pg_trigger
        WHERE tgrelid = 'pos_transactions'::regclass
          AND tgname LIKE '%discount%'
        ORDER BY trigger_name
    ) LOOP
        RAISE NOTICE '   %: % (%)', 
            rec_record.trigger_name,
            rec_record.function_name,
            rec_record.timing_event;
    END LOOP;
    
    -- 9. Check how inventory is tracked in pos_transaction_items
    RAISE NOTICE '';
    RAISE NOTICE '9. INVENTORY-RELATED COLUMNS IN POS_TRANSACTION_ITEMS:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT 
            column_name,
            data_type,
            is_nullable
        FROM information_schema.columns
        WHERE table_name = 'pos_transaction_items'
          AND (column_name LIKE '%inventory%' 
               OR column_name LIKE '%stock%'
               OR column_name = 'product_id'
               OR column_name = 'service_id')
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', 
            rec_record.column_name, 
            rec_record.data_type, 
            rec_record.is_nullable;
    END LOOP;
    
    -- 10. Check if there's an automatic inventory deduction on sale
    RAISE NOTICE '';
    RAISE NOTICE '10. TRIGGERS ON POS_TRANSACTION_ITEMS FOR INVENTORY:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT 
            tgname as trigger_name,
            tgfoid::regproc as function_name,
            CASE tgtype & 1 WHEN 1 THEN 'ROW ' ELSE 'STATEMENT ' END ||
            CASE tgtype & 2 WHEN 2 THEN 'BEFORE ' ELSE '' END ||
            CASE tgtype & 4 WHEN 4 THEN 'AFTER ' ELSE '' END ||
            CASE tgtype & 64 WHEN 64 THEN 'INSERT ' ELSE '' END ||
            CASE tgtype & 128 WHEN 128 THEN 'DELETE ' ELSE '' END ||
            CASE tgtype & 256 WHEN 256 THEN 'UPDATE ' ELSE '' END as timing_event
        FROM pg_trigger
        WHERE tgrelid = 'pos_transaction_items'::regclass
          AND (tgname LIKE '%inventory%' OR tgname LIKE '%stock%')
        ORDER BY trigger_name
    ) LOOP
        RAISE NOTICE '   %: % (%)', 
            rec_record.trigger_name,
            rec_record.function_name,
            rec_record.timing_event;
    END LOOP;
    
    -- 11. Check if refund approval trigger exists
    RAISE NOTICE '';
    RAISE NOTICE '11. REFUND APPROVAL TRIGGERS:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT 
            tgname as trigger_name,
            tgfoid::regproc as function_name,
            tgrelid::regclass as table_name,
            CASE tgtype & 1 WHEN 1 THEN 'ROW ' ELSE 'STATEMENT ' END ||
            CASE tgtype & 2 WHEN 2 THEN 'BEFORE ' ELSE '' END ||
            CASE tgtype & 4 WHEN 4 THEN 'AFTER ' ELSE '' END ||
            CASE tgtype & 64 WHEN 64 THEN 'INSERT ' ELSE '' END ||
            CASE tgtype & 128 WHEN 128 THEN 'DELETE ' ELSE '' END ||
            CASE tgtype & 256 WHEN 256 THEN 'UPDATE ' ELSE '' END as timing_event
        FROM pg_trigger
        WHERE tgrelid = 'refunds'::regclass
        ORDER BY trigger_name
    ) LOOP
        RAISE NOTICE '   % on %: % (%)', 
            rec_record.trigger_name,
            rec_record.table_name,
            rec_record.function_name,
            rec_record.timing_event;
    END LOOP;
    
    -- 12. Check if there are any custom types for item_type
    RAISE NOTICE '';
    RAISE NOTICE '12. CUSTOM TYPES USED:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT 
            t.typname as type_name,
            string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) as enum_values
        FROM pg_type t
        LEFT JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typtype = 'e'
          AND t.typname IN ('item_type', 'refund_type', 'refund_status', 'transaction_status')
        GROUP BY t.typname
        ORDER BY t.typname
    ) LOOP
        RAISE NOTICE '   %: %', 
            rec_record.type_name,
            COALESCE(rec_record.enum_values, 'Not an enum type');
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'DIAGNOSTIC COMPLETE';
    RAISE NOTICE '========================================';
    
END $$;
