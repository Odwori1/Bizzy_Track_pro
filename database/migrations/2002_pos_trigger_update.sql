-- Fix INSERT trigger to handle transactions inserted directly with 'completed' status
CREATE OR REPLACE FUNCTION process_pos_sale_on_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_item_count INTEGER;
    v_journal_entry_id UUID;
    v_delay_count INTEGER := 0;
BEGIN
    -- Only process if status is 'completed'
    IF NEW.status = 'completed' THEN
        -- Give a short delay for items to be inserted (they come in same transaction)
        -- Wait up to 3 times with 10ms intervals
        WHILE v_delay_count < 3 LOOP
            SELECT COUNT(*) INTO v_item_count
            FROM pos_transaction_items
            WHERE pos_transaction_id = NEW.id;
            
            IF v_item_count > 0 THEN
                EXIT;
            END IF;
            
            PERFORM pg_sleep(0.01); -- 10ms
            v_delay_count := v_delay_count + 1;
        END LOOP;
        
        IF v_item_count > 0 THEN
            -- Items exist, create complete accounting
            v_journal_entry_id := create_journal_entry_for_pos_transaction_fixed(
                NEW.id,
                NEW.created_by
            );
            
            IF v_journal_entry_id IS NOT NULL THEN
                UPDATE pos_transactions
                SET accounting_processed = TRUE,
                    accounting_error = NULL
                WHERE id = NEW.id;
                RAISE NOTICE '✅ Complete accounting created (INSERT trigger with delay): %', NEW.id;
            ELSE
                RAISE WARNING '⚠️ Accounting failed for transaction %', NEW.id;
            END IF;
        ELSE
            -- No items found even after delay
            RAISE NOTICE 'No items found for transaction % after delay, will process on UPDATE', NEW.id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
