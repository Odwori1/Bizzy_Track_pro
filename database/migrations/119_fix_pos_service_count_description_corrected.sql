BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXING POS SERVICE COUNT BUG - CORRECTED';
    RAISE NOTICE '========================================';
END;
$$;

-- ============================================================================
-- PART 1: CREATE CORRECTED FUNCTION (Same as before - this worked)
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE 'Creating corrected POS accounting function...';
END $$;

-- Drop and recreate the function with proper item counting
DROP FUNCTION IF EXISTS create_journal_entry_for_pos_transaction_fixed(UUID, UUID);

CREATE OR REPLACE FUNCTION create_journal_entry_for_pos_transaction_fixed(
    p_transaction_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_business_id UUID;
    v_final_amount DECIMAL(15,2);
    v_created_by UUID;
    v_transaction_number VARCHAR(100);
    v_payment_method VARCHAR(50);
    v_receiving_account_id UUID;
    v_revenue_account_id UUID;
    v_cogs_account_id UUID;
    v_inventory_account_id UUID;
    v_journal_entry_id UUID;
    v_total_cogs DECIMAL(15,2) := 0;
    v_item_count INTEGER := 0;
    v_service_count INTEGER := 0;
    v_product_count INTEGER := 0;
    v_existing_entry_id UUID;
    v_description TEXT;
BEGIN
    -- Get transaction details
    SELECT 
        business_id,
        final_amount,
        created_by,
        transaction_number,
        payment_method
    INTO 
        v_business_id,
        v_final_amount,
        v_created_by,
        v_transaction_number,
        v_payment_method
    FROM pos_transactions
    WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'POS transaction not found: %', p_transaction_id;
    END IF;

    -- ========================================================================
    -- FIRST: ALWAYS UPDATE INVENTORY (SEPARATE CONCERN)
    -- ========================================================================
    PERFORM update_inventory_for_pos_transaction(p_transaction_id, p_user_id);

    -- ========================================================================
    -- SECOND: HANDLE JOURNAL ENTRIES
    -- ========================================================================

    -- Check for existing journal entry
    SELECT id INTO v_existing_entry_id
    FROM journal_entries
    WHERE business_id = v_business_id
      AND reference_type = 'pos_transaction'
      AND reference_id = p_transaction_id::TEXT
    LIMIT 1;

    IF v_existing_entry_id IS NOT NULL THEN
        RAISE NOTICE 'Journal entry already exists: %', v_existing_entry_id;
        RETURN v_existing_entry_id;
    END IF;

    -- ✅ FIX 1: Count ALL items properly (products + services)
    SELECT 
        COALESCE(SUM(CASE WHEN pti.item_type = 'product' THEN pti.quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pti.item_type = 'service' THEN pti.quantity ELSE 0 END), 0)
    INTO v_product_count, v_service_count
    FROM pos_transaction_items pti
    WHERE pti.pos_transaction_id = p_transaction_id;

    v_item_count := v_product_count + v_service_count;

    -- Get DYNAMIC receiving account based on payment method
    v_receiving_account_id := get_account_id_by_payment_method(v_business_id, v_payment_method);

    -- Get other account IDs
    SELECT id INTO v_revenue_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '4100'
    LIMIT 1;

    SELECT id INTO v_cogs_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '5100'
    LIMIT 1;

    SELECT id INTO v_inventory_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '1300'
    LIMIT 1;

    -- Validate all accounts exist
    IF v_receiving_account_id IS NULL THEN
        RAISE EXCEPTION 'Receiving account for payment method % not found', v_payment_method;
    END IF;
    IF v_revenue_account_id IS NULL THEN
        RAISE EXCEPTION 'Sales Revenue account (4100) not found';
    END IF;
    IF v_cogs_account_id IS NULL THEN
        RAISE EXCEPTION 'COGS account (5100) not found';
    END IF;
    IF v_inventory_account_id IS NULL THEN
        RAISE EXCEPTION 'Inventory account (1300) not found';
    END IF;

    -- ✅ FIX 2: Calculate total COGS only from PRODUCTS (not services)
    SELECT COALESCE(SUM(pti.quantity * ii.cost_price), 0)
    INTO v_total_cogs
    FROM pos_transaction_items pti
    JOIN inventory_items ii ON pti.inventory_item_id = ii.id
    WHERE pti.pos_transaction_id = p_transaction_id
      AND pti.item_type = 'product';

    -- ✅ FIX 3: Create appropriate description based on item types
    IF v_item_count = 0 THEN
        v_description := 'POS Sale: ' || COALESCE(v_transaction_number, '') || 
                        ' (' || v_payment_method || ', 0 items)';
    ELSIF v_service_count > 0 AND v_product_count = 0 THEN
        -- Only services
        v_description := 'POS Sale: ' || COALESCE(v_transaction_number, '') || 
                        ' (' || v_payment_method || ', ' || 
                        v_service_count || ' service' || 
                        CASE WHEN v_service_count != 1 THEN 's' ELSE '' END || ')';
    ELSIF v_product_count > 0 AND v_service_count = 0 THEN
        -- Only products
        v_description := 'POS Sale: ' || COALESCE(v_transaction_number, '') || 
                        ' (' || v_payment_method || ', ' || 
                        v_product_count || ' item' || 
                        CASE WHEN v_product_count != 1 THEN 's' ELSE '' END || ')';
    ELSE
        -- Mixed (products + services)
        v_description := 'POS Sale: ' || COALESCE(v_transaction_number, '') || 
                        ' (' || v_payment_method || ', ' || 
                        v_item_count || ' items)';
    END IF;

    RAISE NOTICE 'Creating POS journal entry: % (Products: %, Services: %, COGS: %)', 
        v_description, v_product_count, v_service_count, v_total_cogs;

    -- Create journal entry
    INSERT INTO journal_entries (
        business_id,
        journal_date,
        reference_number,
        reference_type,
        reference_id,
        description,
        total_amount,
        created_by,
        posted_at
    ) VALUES (
        v_business_id,
        CURRENT_DATE,
        'JE-' || COALESCE(v_transaction_number, EXTRACT(EPOCH FROM NOW())::TEXT),
        'pos_transaction',
        p_transaction_id::TEXT,
        v_description,  -- ✅ Now uses correct description
        v_final_amount,
        COALESCE(p_user_id, v_created_by),
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- LINE 1: Debit receiving account
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        v_business_id,
        v_journal_entry_id,
        v_receiving_account_id,
        'debit',
        v_final_amount,
        'Received from POS sale via ' || v_payment_method
    );

    -- LINE 2: Credit sales revenue
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        v_business_id,
        v_journal_entry_id,
        v_revenue_account_id,
        'credit',
        v_final_amount,
        'Sales revenue from POS'
    );

    -- Only create COGS entries if there's actual COGS (from products)
    IF v_total_cogs > 0 THEN
        -- LINE 3: Debit COGS
        INSERT INTO journal_entry_lines (
            business_id,
            journal_entry_id,
            account_id,
            line_type,
            amount,
            description
        ) VALUES (
            v_business_id,
            v_journal_entry_id,
            v_cogs_account_id,
            'debit',
            v_total_cogs,
            'Cost of goods sold (' || v_product_count || ' items)'
        );

        -- LINE 4: Credit inventory
        INSERT INTO journal_entry_lines (
            business_id,
            journal_entry_id,
            account_id,
            line_type,
            amount,
            description
        ) VALUES (
            v_business_id,
            v_journal_entry_id,
            v_inventory_account_id,
            'credit',
            v_total_cogs,
            'Inventory reduction from sale'
        );

        -- Link inventory transactions to journal entries
        UPDATE inventory_transactions it
        SET
            journal_entry_id = v_journal_entry_id,
            cogs_entry_id = (
                SELECT jel.id
                FROM journal_entry_lines jel
                WHERE jel.journal_entry_id = v_journal_entry_id
                  AND jel.account_id = v_cogs_account_id
                  AND jel.line_type = 'debit'
                LIMIT 1
            ),
            updated_at = NOW()
        WHERE it.reference_id = p_transaction_id
          AND it.reference_type = 'pos_transaction'
          AND it.journal_entry_id IS NULL;
    END IF;

    -- Audit log
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        old_values, new_values, metadata, created_at
    ) VALUES (
        v_business_id,
        COALESCE(p_user_id, v_created_by),
        'accounting.pos.created.with_inventory',
        'pos_transaction',
        p_transaction_id,
        '{}'::jsonb,
        jsonb_build_object(
            'amount', v_final_amount,
            'payment_method', v_payment_method,
            'receiving_account', (SELECT account_code FROM chart_of_accounts WHERE id = v_receiving_account_id),
            'cogs_amount', v_total_cogs,
            'product_count', v_product_count,
            'service_count', v_service_count,
            'total_items', v_item_count
        ),
        jsonb_build_object('function', 'create_journal_entry_for_pos_transaction_fixed'),
        NOW()
    );

    RETURN v_journal_entry_id;

EXCEPTION WHEN OTHERS THEN
    -- Error log
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        old_values, new_values, metadata, created_at
    ) VALUES (
        COALESCE(v_business_id, '00000000-0000-0000-0000-000000000000'::UUID),
        COALESCE(p_user_id, v_created_by),
        'accounting.pos.error',
        'pos_transaction',
        p_transaction_id,
        '{}'::jsonb,
        jsonb_build_object('error', SQLERRM, 'payment_method', v_payment_method),
        jsonb_build_object('function', 'create_journal_entry_for_pos_transaction_fixed'),
        NOW()
    );

    RAISE;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    RAISE NOTICE '✅ Created corrected function';
    RAISE NOTICE '   - Properly counts services AND products';
    RAISE NOTICE '   - Shows "services" for service-only transactions';
    RAISE NOTICE '   - Calculates COGS only for products';
END $$;

-- ============================================================================
-- PART 2: SIMPLER FIX FOR EXISTING DESCRIPTIONS
-- ============================================================================
DO $$
DECLARE
    v_fixed_count INTEGER := 0;
    v_record RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Fixing existing wrong descriptions...';
    
    -- Use a cursor to fix each journal entry individually
    FOR v_record IN (
        SELECT 
            je.id as journal_id,
            pt.transaction_number,
            pt.payment_method,
            COALESCE(SUM(CASE WHEN pti.item_type = 'product' THEN pti.quantity ELSE 0 END), 0) as product_count,
            COALESCE(SUM(CASE WHEN pti.item_type = 'service' THEN pti.quantity ELSE 0 END), 0) as service_count
        FROM journal_entries je
        JOIN pos_transactions pt ON pt.id::TEXT = je.reference_id
        LEFT JOIN pos_transaction_items pti ON pt.id = pti.pos_transaction_id
        WHERE je.business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
            AND je.reference_type = 'pos_transaction'
            AND (
                je.description LIKE '%0 items%' OR
                (je.description NOT LIKE '%service%' AND EXISTS (
                    SELECT 1 FROM pos_transaction_items pti2 
                    WHERE pti2.pos_transaction_id = pt.id 
                    AND pti2.item_type = 'service'
                ))
            )
        GROUP BY je.id, pt.transaction_number, pt.payment_method
    ) LOOP
        
        -- Build correct description
        DECLARE
            v_new_description TEXT;
            v_total_items INTEGER;
        BEGIN
            v_total_items := v_record.product_count + v_record.service_count;
            
            IF v_total_items = 0 THEN
                v_new_description := 'POS Sale: ' || v_record.transaction_number || 
                                   ' (' || v_record.payment_method || ', 0 items)';
            ELSIF v_record.service_count > 0 AND v_record.product_count = 0 THEN
                -- Only services
                v_new_description := 'POS Sale: ' || v_record.transaction_number || 
                                   ' (' || v_record.payment_method || ', ' || 
                                   v_record.service_count || ' service' || 
                                   CASE WHEN v_record.service_count != 1 THEN 's' ELSE '' END || ')';
            ELSIF v_record.product_count > 0 AND v_record.service_count = 0 THEN
                -- Only products
                v_new_description := 'POS Sale: ' || v_record.transaction_number || 
                                   ' (' || v_record.payment_method || ', ' || 
                                   v_record.product_count || ' item' || 
                                   CASE WHEN v_record.product_count != 1 THEN 's' ELSE '' END || ')';
            ELSE
                -- Mixed (products + services)
                v_new_description := 'POS Sale: ' || v_record.transaction_number || 
                                   ' (' || v_record.payment_method || ', ' || 
                                   v_total_items || ' items)';
            END IF;
            
            -- Update the description
            UPDATE journal_entries
            SET description = v_new_description
            WHERE id = v_record.journal_id
                AND description != v_new_description;
            
            IF FOUND THEN
                v_fixed_count := v_fixed_count + 1;
                RAISE NOTICE 'Fixed: % -> %', v_record.transaction_number, v_new_description;
            END IF;
        END;
        
    END LOOP;
    
    RAISE NOTICE 'Fixed % journal entry description(s)', v_fixed_count;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION';
    RAISE NOTICE '========================================';
    
    RAISE NOTICE 'Current POS Transaction Descriptions:';
    RAISE NOTICE '--------------------------------------';
    
    FOR rec IN (
        SELECT 
            je.reference_number,
            je.description,
            COALESCE(SUM(CASE WHEN pti.item_type = 'product' THEN pti.quantity ELSE 0 END), 0) as products,
            COALESCE(SUM(CASE WHEN pti.item_type = 'service' THEN pti.quantity ELSE 0 END), 0) as services,
            CASE 
                WHEN je.description LIKE '%0 items%' AND COALESCE(SUM(pti.quantity), 0) > 0 THEN '❌ WRONG'
                WHEN je.description LIKE '%service%' AND COALESCE(SUM(CASE WHEN pti.item_type = 'service' THEN pti.quantity ELSE 0 END), 0) > 0 THEN '✅ CORRECT'
                WHEN je.description LIKE '%item%' AND COALESCE(SUM(CASE WHEN pti.item_type = 'product' THEN pti.quantity ELSE 0 END), 0) > 0 THEN '✅ CORRECT'
                ELSE '⚠️ CHECK'
            END as status
        FROM journal_entries je
        LEFT JOIN pos_transaction_items pti ON pti.pos_transaction_id::TEXT = je.reference_id
        WHERE je.business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
            AND je.reference_type = 'pos_transaction'
        GROUP BY je.id, je.reference_number, je.description
        ORDER BY je.reference_number
    ) LOOP
        RAISE NOTICE '%: % (Products: %, Services: %) - %', 
            rec.reference_number, 
            rec.description, 
            rec.products, 
            rec.services, 
            rec.status;
    END LOOP;
    
END $$;

COMMIT;
