-- Check the constraint on pos_transaction_items
DO $$
DECLARE
    rec_record RECORD;
    enum_rec RECORD;
BEGIN
    RAISE NOTICE 'Checking pos_transaction_items constraints...';
    
    -- Check the check constraint details
    FOR rec_record IN (
        SELECT 
            conname as constraint_name,
            pg_get_constraintdef(oid) as constraint_definition
        FROM pg_constraint 
        WHERE conrelid = 'pos_transaction_items'::regclass
          AND contype = 'c'
    ) LOOP
        RAISE NOTICE 'Constraint: % - %', rec_record.constraint_name, rec_record.constraint_definition;
    END LOOP;
    
    -- Also check the actual enum or allowed values if it's an enum type
    RAISE NOTICE '';
    RAISE NOTICE 'Checking column data type for item_type...';
    
    FOR rec_record IN (
        SELECT 
            data_type,
            udt_name
        FROM information_schema.columns
        WHERE table_name = 'pos_transaction_items'
          AND column_name = 'item_type'
    ) LOOP
        RAISE NOTICE 'item_type data_type: %, udt_name: %', rec_record.data_type, rec_record.udt_name;
        
        -- If it's an enum, get the enum values
        IF rec_record.data_type = 'USER-DEFINED' THEN
            FOR enum_rec IN (
                SELECT enumlabel
                FROM pg_enum
                WHERE enumtypid = (SELECT udt_name::regtype::oid 
                                   FROM information_schema.columns 
                                   WHERE table_name = 'pos_transaction_items' 
                                     AND column_name = 'item_type' 
                                   LIMIT 1)
                ORDER BY enumsortorder
            ) LOOP
                RAISE NOTICE '  Allowed value: %', enum_rec.enumlabel;
            END LOOP;
        END IF;
    END LOOP;
    
    -- Also check if there are any other required fields we might be missing
    RAISE NOTICE '';
    RAISE NOTICE 'Checking other NOT NULL constraints...';
    FOR rec_record IN (
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'pos_transaction_items'
          AND is_nullable = 'NO'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE 'Required column: % (%)', rec_record.column_name, rec_record.data_type;
    END LOOP;
    
END $$;
