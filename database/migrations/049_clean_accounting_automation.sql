-- database/migrations/049_clean_accounting_automation.sql
-- ============================================================================
-- CLEANUP: Remove all accounting automation triggers and functions
-- ============================================================================

-- 1. Drop all accounting automation triggers
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    FOR trigger_record IN 
        SELECT tgname, relname 
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        WHERE tgname LIKE '%accounting%' 
           OR tgname LIKE '%auto_account%'
           OR tgname LIKE '%trigger_accounting%'
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || trigger_record.tgname || ' ON ' || trigger_record.relname;
        RAISE NOTICE 'Dropped trigger: % on table %', trigger_record.tgname, trigger_record.relname;
    END LOOP;
END $$;

-- 2. Drop all accounting automation functions
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT proname, pg_get_function_identity_arguments(oid) as args
        FROM pg_proc
        WHERE proname IN (
            'auto_accounting_trigger',
            'auto_account_pos_transaction',
            'create_accounting_on_transaction',
            'create_accounting_on_transaction_fixed',
            'route_to_accounting',
            'eval_trigger_condition',
            'setup_default_accounting_events',
            'process_pos_sale_fixed',
            'create_simple_expense_accounting',
            'create_simple_invoice_accounting',
            'universal_accounting_trigger'
        )
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.proname || '(' || func_record.args || ') CASCADE';
        RAISE NOTICE 'Dropped function: %(%)', func_record.proname, func_record.args;
    END LOOP;
END $$;

-- 3. Drop accounting event registry table if exists
DROP TABLE IF EXISTS accounting_event_registry;

-- 4. Verify cleanup
DO $$
DECLARE
    trigger_count INTEGER;
    func_count INTEGER;
BEGIN
    -- Count remaining triggers
    SELECT COUNT(*) INTO trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE tgname LIKE '%accounting%' 
       OR tgname LIKE '%auto_account%'
       OR tgname LIKE '%trigger_accounting%';
    
    -- Count remaining functions
    SELECT COUNT(*) INTO func_count
    FROM pg_proc
    WHERE proname IN (
        'auto_accounting_trigger',
        'auto_account_pos_transaction',
        'create_accounting_on_transaction',
        'create_accounting_on_transaction_fixed',
        'route_to_accounting',
        'eval_trigger_condition',
        'setup_default_accounting_events',
        'process_pos_sale_fixed',
        'create_simple_expense_accounting',
        'create_simple_invoice_accounting',
        'universal_accounting_trigger'
    );
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CLEANUP COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Remaining accounting triggers: %', trigger_count;
    RAISE NOTICE 'Remaining accounting functions: %', func_count;
    
    IF trigger_count = 0 AND func_count = 0 THEN
        RAISE NOTICE '✅ All accounting automation removed';
    ELSE
        RAISE NOTICE '⚠️ Some items remain, check manually';
    END IF;
    
    RAISE NOTICE '========================================';
END $$;
