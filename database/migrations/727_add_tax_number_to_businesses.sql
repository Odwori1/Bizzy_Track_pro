-- Migration: 727_add_tax_number_to_businesses.sql
-- Description: Add tax_number column alias for tax_id
-- Created: February 12, 2026

BEGIN;

-- Add tax_number as an alias for tax_id
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS tax_number VARCHAR(50) 
GENERATED ALWAYS AS (tax_id) STORED;

-- Add comment
COMMENT ON COLUMN businesses.tax_number IS 'Alias for tax_id for backward compatibility';

COMMIT;
