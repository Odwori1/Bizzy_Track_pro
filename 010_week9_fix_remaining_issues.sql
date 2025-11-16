-- ============================================================================
-- WEEK 9: FIX REMAINING ISSUES
-- ============================================================================

-- Create migrations table if it doesn't exist (for tracking)
CREATE TABLE IF NOT EXISTS migrations (
    name VARCHAR(255) PRIMARY KEY,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add migration tracking entry
INSERT INTO migrations (name, executed_at) 
VALUES ('010_week9_department_coordination', NOW())
ON CONFLICT (name) DO UPDATE SET executed_at = NOW();
