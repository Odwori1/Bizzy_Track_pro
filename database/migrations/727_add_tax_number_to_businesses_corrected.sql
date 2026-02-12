-- Migration: 727_add_tax_number_to_businesses_corrected.sql
-- Description: Add tax_number column to businesses table
-- Created: February 12, 2026

BEGIN;

-- Add tax_number column directly (not generated)
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS tax_number VARCHAR(50);

-- Add comment
COMMENT ON COLUMN businesses.tax_number IS 'Tax Identification Number (TIN) for the business';

-- Update existing businesses with default values if needed
UPDATE businesses 
SET tax_number = 'TIN-' || SUBSTRING(id::text, 1, 8)
WHERE tax_number IS NULL;

COMMIT;
