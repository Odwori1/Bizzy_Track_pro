-- ============================================================================
-- MIGRATION 023: ADD UPDATED COLUMNS TO CATEGORY TABLES
-- ============================================================================
-- 
-- Purpose: Add updated_at and updated_by columns to both customer_categories
--          and service_categories tables for consistency and audit tracking
--
-- Why this migration:
-- - The service layer expects updated_at column but it doesn't exist
-- - Both category tables should have consistent structure
-- - Audit trail requires tracking who made changes
-- ============================================================================

-- Add updated_at and updated_by to customer_categories
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customer_categories' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE customer_categories 
        ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN updated_by UUID REFERENCES users(id);
    END IF;
END $$;

-- Add updated_at and updated_by to service_categories  
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'service_categories' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE service_categories 
        ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN updated_by UUID REFERENCES users(id);
    END IF;
END $$;

-- Create or replace the updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for customer_categories (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_customer_categories_updated_at'
    ) THEN
        CREATE TRIGGER update_customer_categories_updated_at
            BEFORE UPDATE ON customer_categories
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Create trigger for service_categories (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_service_categories_updated_at'
    ) THEN
        CREATE TRIGGER update_service_categories_updated_at
            BEFORE UPDATE ON service_categories
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Update existing records to have updated_at set to created_at
UPDATE customer_categories SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE service_categories SET updated_at = created_at WHERE updated_at IS NULL;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
