-- Diagnostic script to check table structures
DO $$
DECLARE
    rec_record RECORD;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TABLE STRUCTURE DIAGNOSTIC';
    RAISE NOTICE '========================================';
    
    -- Check products table
    RAISE NOTICE '';
    RAISE NOTICE '1. Products Table Structure:';
    RAISE NOTICE '----------------------------------------';
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'products'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
    -- Check services table
    RAISE NOTICE '';
    RAISE NOTICE '2. Services Table Structure:';
    RAISE NOTICE '----------------------------------------';
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'services'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
    -- Check inventory_items table
    RAISE NOTICE '';
    RAISE NOTICE '3. Inventory Items Table Structure:';
    RAISE NOTICE '----------------------------------------';
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'inventory_items'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
    -- Check pos_transactions table
    RAISE NOTICE '';
    RAISE NOTICE '4. POS Transactions Table Structure:';
    RAISE NOTICE '----------------------------------------';
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'pos_transactions'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
    -- Check pos_transaction_items table
    RAISE NOTICE '';
    RAISE NOTICE '5. POS Transaction Items Table Structure:';
    RAISE NOTICE '----------------------------------------';
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'pos_transaction_items'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
    -- Check refunds table
    RAISE NOTICE '';
    RAISE NOTICE '6. Refunds Table Structure:';
    RAISE NOTICE '----------------------------------------';
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'refunds'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
    -- Check refund_items table
    RAISE NOTICE '';
    RAISE NOTICE '7. Refund Items Table Structure:';
    RAISE NOTICE '----------------------------------------';
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'refund_items'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
    -- Check inventory_transactions table
    RAISE NOTICE '';
    RAISE NOTICE '8. Inventory Transactions Table Structure:';
    RAISE NOTICE '----------------------------------------';
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'inventory_transactions'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
    -- Check journal_entries table
    RAISE NOTICE '';
    RAISE NOTICE '9. Journal Entries Table Structure:';
    RAISE NOTICE '----------------------------------------';
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'journal_entries'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
    -- Check journal_entry_lines table
    RAISE NOTICE '';
    RAISE NOTICE '10. Journal Entry Lines Table Structure:';
    RAISE NOTICE '----------------------------------------';
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'journal_entry_lines'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
    -- Check chart_of_accounts table
    RAISE NOTICE '';
    RAISE NOTICE '11. Chart of Accounts Table Structure:';
    RAISE NOTICE '----------------------------------------';
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'chart_of_accounts'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
    -- Check discount_allocations table
    RAISE NOTICE '';
    RAISE NOTICE '12. Discount Allocations Table Structure:';
    RAISE NOTICE '----------------------------------------';
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'discount_allocations'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%) - Nullable: %', rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
END $$;
