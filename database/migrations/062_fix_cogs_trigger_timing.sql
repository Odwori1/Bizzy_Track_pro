-- ============================================================================
-- BIZZY TRACK PRO: COGS AUTOMATION FIX
-- Migration: 062_fix_cogs_trigger_timing.sql
-- ============================================================================

-- 1. Add accounting status tracking
ALTER TABLE pos_transactions 
ADD COLUMN IF NOT EXISTS accounting_processed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS accounting_error TEXT;

-- 2. Create safe accounting processing function
CREATE OR REPLACE FUNCTION process_pos_accounting_safe(
    p_transaction_id UUID,
    p_user_id UUID
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    journal_entry_id UUID,
    lines_created INTEGER
) AS $$
DECLARE
    v_business_id UUID;
    v_status TEXT;
    v_already_processed BOOLEAN;
    v_total_cogs NUMERIC := 0;
    v_journal_entry_id UUID;
    v_line_count INTEGER;
BEGIN
    -- Check if transaction exists and is completed
    SELECT business_id, status, accounting_processed
    INTO v_business_id, v_status, v_already_processed
    FROM pos_transactions 
    WHERE id = p_transaction_id;
    
    IF v_business_id IS NULL THEN
        RETURN QUERY SELECT false, 'Transaction not found', NULL, 0;
        RETURN;
    END IF;
    
    IF v_status != 'completed' THEN
        RETURN QUERY SELECT false, 'Transaction not completed', NULL, 0;
        RETURN;
    END IF;
    
    IF v_already_processed THEN
        RETURN QUERY SELECT false, 'Accounting already processed', NULL, 0;
        RETURN;
    END IF;
    
    -- Verify items exist (CRITICAL: This only works after commit)
    IF NOT EXISTS (
        SELECT 1 FROM pos_transaction_items 
        WHERE pos_transaction_id = p_transaction_id
    ) THEN
        RETURN QUERY SELECT false, 'No transaction items found', NULL, 0;
        RETURN;
    END IF;
    
    -- Call the existing accounting function (which we know works manually)
    BEGIN
        v_journal_entry_id := create_journal_entry_for_pos_transaction(
            p_transaction_id,
            p_user_id
        );
        
        IF v_journal_entry_id IS NULL THEN
            RAISE EXCEPTION 'Journal entry creation returned NULL';
        END IF;
        
        -- Count lines created
        SELECT COUNT(*) INTO v_line_count
        FROM journal_entry_lines 
        WHERE journal_entry_id = v_journal_entry_id;
        
        -- Mark as processed
        UPDATE pos_transactions 
        SET accounting_processed = TRUE,
            accounting_error = NULL
        WHERE id = p_transaction_id;
        
        RETURN QUERY SELECT true, 'Accounting processed successfully', 
                     v_journal_entry_id, v_line_count;
                     
    EXCEPTION WHEN OTHERS THEN
        -- Log error but don't fail
        UPDATE pos_transactions 
        SET accounting_error = SQLERRM
        WHERE id = p_transaction_id;
        
        RETURN QUERY SELECT false, 'Accounting failed: ' || SQLERRM, 
                     NULL, 0;
    END;
END;
$$ LANGUAGE plpgsql;

-- 3. Create repair function for historical data
CREATE OR REPLACE FUNCTION repair_missing_pos_accounting(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
    transaction_id UUID,
    success BOOLEAN,
    message TEXT,
    lines_created INTEGER
) AS $$
DECLARE
    v_transaction RECORD;
    v_result RECORD;
BEGIN
    FOR v_transaction IN (
        SELECT pt.id
        FROM pos_transactions pt
        WHERE pt.status = 'completed'
          AND pt.accounting_processed = FALSE
          AND NOT EXISTS (
              SELECT 1 FROM journal_entries je
              WHERE je.reference_type = 'pos_transaction'
                AND je.reference_id = pt.id
          )
        ORDER BY pt.created_at
        LIMIT p_limit
    ) LOOP
        SELECT * INTO v_result
        FROM process_pos_accounting_safe(v_transaction.id, p_user_id);
        
        transaction_id := v_transaction.id;
        success := v_result.success;
        message := v_result.message;
        lines_created := v_result.lines_created;
        
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Create statistics function
CREATE OR REPLACE FUNCTION get_accounting_processing_stats(
    p_business_id UUID
)
RETURNS TABLE(
    total_completed INTEGER,
    processed INTEGER,
    pending_processing INTEGER,
    with_errors INTEGER,
    avg_lines_per_entry NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT 
            COUNT(*) FILTER (WHERE status = 'completed') as total_completed,
            COUNT(*) FILTER (WHERE accounting_processed = TRUE) as processed,
            COUNT(*) FILTER (
                WHERE status = 'completed' 
                AND accounting_processed = FALSE
                AND accounting_error IS NULL
            ) as pending_processing,
            COUNT(*) FILTER (WHERE accounting_error IS NOT NULL) as with_errors
        FROM pos_transactions
        WHERE business_id = p_business_id
    ),
    line_stats AS (
        SELECT 
            COUNT(DISTINCT je.id) as entry_count,
            COUNT(jel.id) as total_lines
        FROM journal_entries je
        JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
        WHERE je.business_id = p_business_id
          AND je.reference_type = 'pos_transaction'
    )
    SELECT 
        s.total_completed,
        s.processed,
        s.pending_processing,
        s.with_errors,
        CASE 
            WHEN ls.entry_count > 0 THEN ls.total_lines::NUMERIC / ls.entry_count
            ELSE 0 
        END as avg_lines_per_entry
    FROM stats s, line_stats ls;
END;
$$ LANGUAGE plpgsql;
