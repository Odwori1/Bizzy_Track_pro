-- ============================================================================
-- WEEK 5: FIX SERVICE CATEGORY APPROACH - MAKE RELATIONSHIP OPTIONAL
-- ============================================================================

-- Instead of requiring migration, let's make the system more flexible
-- Services can have EITHER a simple category text OR a category relationship

-- Step 1: Make service_category_id optional (it already is)
-- Step 2: Keep the category field for backward compatibility
-- Step 3: Update the service queries to handle both

-- Create service categories from existing data for consistency
INSERT INTO service_categories (business_id, name, description, color, sort_order, created_by, created_at, updated_at)
SELECT DISTINCT 
    s.business_id,
    s.category as name,
    'Migrated from existing category system' as description,
    CASE 
        WHEN s.category = 'Beauty' THEN '#FF6B6B'
        WHEN s.category = 'Testing' THEN '#4ECDC4' 
        ELSE '#3B82F6'
    END as color,
    ROW_NUMBER() OVER (PARTITION BY s.business_id ORDER BY COUNT(*) DESC) as sort_order,
    s.created_by,
    NOW(),
    NOW()
FROM services s
WHERE s.category IS NOT NULL 
AND s.category != ''
AND NOT EXISTS (
    SELECT 1 FROM service_categories sc 
    WHERE sc.business_id = s.business_id 
    AND sc.name = s.category
)
GROUP BY s.business_id, s.category, s.created_by;

-- Update services that have matching categories
UPDATE services s
SET service_category_id = sc.id
FROM service_categories sc
WHERE s.business_id = sc.business_id 
AND s.category = sc.name
AND s.service_category_id IS NULL;

-- Now services can use EITHER:
-- 1. service_category_id (preferred, for new services)
-- 2. category field (backward compatibility for existing services)
