-- Week 4: Dashboard and Security Enhancements

-- Add dashboard permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission, created_at)
SELECT 
    business_id,
    'dashboard:view',
    'dashboard',
    'View dashboard and business analytics',
    'dashboard',
    'view',
    true,
    NOW()
FROM businesses
ON CONFLICT DO NOTHING;

-- Add dashboard permission to owner and manager roles
INSERT INTO role_permissions (role_id, permission_id, created_at)
SELECT 
    r.id,
    p.id,
    NOW()
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('owner', 'manager') 
AND p.name = 'dashboard:view'
AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp 
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
);

-- Add timezone and locale preferences to users table (for future use)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS preferred_timezone VARCHAR(50),
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'en',
ADD COLUMN IF NOT EXISTS date_format VARCHAR(20) DEFAULT 'YYYY-MM-DD',
ADD COLUMN IF NOT EXISTS time_format VARCHAR(20) DEFAULT '24h';

-- Create audit log indexes for better performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_date ON audit_logs(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action, resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id, created_at DESC);
