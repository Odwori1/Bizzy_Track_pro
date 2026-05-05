-- Drop existing trigger
DROP TRIGGER IF EXISTS trigger_transaction_taxes_post ON transaction_taxes;

-- Create modified trigger function that SKIPS POS transactions
CREATE OR REPLACE FUNCTION trigger_auto_tax_posting()
RETURNS TRIGGER AS $$
BEGIN
    -- ✅ SKIP POS transactions - tax already in main journal entry
    IF NEW.transaction_type = 'pos_sale' THEN
        -- Mark as posted so no future attempts
        UPDATE transaction_taxes
        SET is_posted_to_ledger = TRUE,
            journal_entry_id = (
                SELECT je.id 
                FROM journal_entries je
                WHERE je.reference_type = 'pos_transaction'
                  AND je.reference_id = NEW.transaction_id::TEXT
                LIMIT 1
            ),
            updated_at = NOW()
        WHERE id = NEW.id;
        
        RAISE NOTICE 'POS transaction %: Tax already in main journal, skipping auto-posting', NEW.transaction_id;
        RETURN NEW;
    END IF;
    
    -- For NON-POS transactions, post tax normally
    IF NEW.is_posted_to_ledger = FALSE AND NEW.transaction_date IS NOT NULL THEN
        PERFORM post_tax_to_gl(NEW.id, NEW.created_by);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
CREATE TRIGGER trigger_transaction_taxes_post
    AFTER INSERT ON transaction_taxes
    FOR EACH ROW
    EXECUTE FUNCTION trigger_auto_tax_posting();
