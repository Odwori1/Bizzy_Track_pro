-- Create a function to fix any unmapped categories
CREATE OR REPLACE FUNCTION fix_unmapped_inventory_categories()
RETURNS INTEGER AS $$
DECLARE
    v_fixed_count INTEGER := 0;
    v_business RECORD;
    v_office_supplies_id UUID;
    v_misc_expense_id UUID;
BEGIN
    -- For each business with unmapped categories
    FOR v_business IN 
        SELECT DISTINCT ic.business_id
        FROM inventory_categories ic
        WHERE ic.expense_account_id IS NULL
          AND ic.business_id IS NOT NULL
    LOOP
        -- Get Office Supplies Expense (5201)
        SELECT id INTO v_office_supplies_id
        FROM chart_of_accounts
        WHERE business_id = v_business.business_id 
          AND account_code = '5201'
        LIMIT 1;
        
        -- Get Miscellaneous Expense (5209)
        SELECT id INTO v_misc_expense_id
        FROM chart_of_accounts
        WHERE business_id = v_business.business_id 
          AND account_code = '5209'
        LIMIT 1;
        
        -- If 5209 doesn't exist, use 5201
        IF v_misc_expense_id IS NULL THEN
            v_misc_expense_id := v_office_supplies_id;
        END IF;
        
        -- If 5201 doesn't exist, get ANY expense account
        IF v_office_supplies_id IS NULL THEN
            SELECT id INTO v_office_supplies_id
            FROM chart_of_accounts
            WHERE business_id = v_business.business_id 
              AND account_type = 'expense'
            LIMIT 1;
            
            IF v_office_supplies_id IS NULL THEN
                -- This business has no expense accounts at all
                CONTINUE;
            END IF;
            
            v_misc_expense_id := v_office_supplies_id;
        END IF;
        
        -- Fix unmapped categories
        UPDATE inventory_categories ic
        SET expense_account_id = 
            CASE 
                WHEN ic.category_type = 'internal_use' THEN v_office_supplies_id
                WHEN ic.category_type = 'sale' THEN v_misc_expense_id
                WHEN ic.category_type = 'both' THEN v_office_supplies_id
                ELSE v_office_supplies_id
            END
        WHERE ic.business_id = v_business.business_id
          AND ic.expense_account_id IS NULL;
        
        GET DIAGNOSTICS v_fixed_count = ROW_COUNT;
        
        RAISE NOTICE 'Fixed % categories for business: %', v_fixed_count, v_business.business_id;
    END LOOP;
    
    RETURN v_fixed_count;
END;
$$ LANGUAGE plpgsql;

-- Test the maintenance function
SELECT fix_unmapped_inventory_categories();
