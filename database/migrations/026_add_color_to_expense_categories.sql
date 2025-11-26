-- ============================================================================
-- MIGRATION: Add color column to expense_categories table
-- ============================================================================

-- Add color column to expense_categories
ALTER TABLE expense_categories 
ADD COLUMN color VARCHAR(7) DEFAULT '#3B82F6';

-- Update existing categories with default colors based on their names
UPDATE expense_categories 
SET color = CASE 
    WHEN name ILIKE '%office%' THEN '#3B82F6'
    WHEN name ILIKE '%travel%' THEN '#10B981'
    WHEN name ILIKE '%fuel%' THEN '#F59E0B'
    WHEN name ILIKE '%utilities%' THEN '#EF4444'
    WHEN name ILIKE '%supplies%' THEN '#8B5CF6'
    WHEN name ILIKE '%equipment%' THEN '#06B6D4'
    ELSE '#6B7280'
END;

-- Create index for better performance
CREATE INDEX idx_expense_categories_color ON expense_categories(color);
