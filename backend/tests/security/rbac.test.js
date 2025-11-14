import { testHelpers } from '../utils/testHelpers.js';
import { getClient } from '../../app/utils/database.js';

/**
 * RBAC (Role-Based Access Control) Tests
 */
describe('RBAC System Tests', () => {
  let testBusiness;
  let testOwner;
  let testManager;
  let testStaff;

  beforeAll(async () => {
    // Create test business and users
    testBusiness = await testHelpers.createTestBusiness({
      name: 'RBAC Test Business',
      ownerEmail: 'rbac-owner@test.com'
    });
    
    testOwner = testBusiness.owner;
    
    testManager = await testHelpers.createTestUser(testBusiness.business.id, {
      email: 'manager@rbac-test.com',
      fullName: 'RBAC Test Manager',
      role: 'manager'
    });

    testStaff = await testHelpers.createTestUser(testBusiness.business.id, {
      email: 'staff@rbac-test.com',
      fullName: 'RBAC Test Staff',
      role: 'staff'
    });
  });

  afterAll(async () => {
    await testHelpers.cleanupTestData(testBusiness.business.id);
  });

  describe('Role Permission Inheritance', () => {
    test('Owner should have all permissions', async () => {
      const client = await getClient();
      
      try {
        // Check if owner has access to all permission categories
        const permissionsResult = await client.query(
          `SELECT DISTINCT category FROM permissions WHERE is_system_permission = true`
        );
        
        const categories = permissionsResult.rows.map(row => row.category);
        
        for (const category of categories) {
          const hasPermission = await client.query(
            `SELECT 1 FROM role_permissions rp
             JOIN permissions p ON rp.permission_id = p.id
             JOIN roles r ON rp.role_id = r.id
             WHERE r.business_id = $1 AND r.name = 'owner' AND p.category = $2
             LIMIT 1`,
            [testBusiness.business.id, category]
          );
          
          expect(hasPermission.rows.length).toBeGreaterThan(0);
        }
      } finally {
        client.release();
      }
    });

    test('Manager should have appropriate permissions', async () => {
      const client = await getClient();
      
      try {
        // Managers should not have owner-level permissions like business deletion
        const ownerOnlyPermissions = await client.query(
          `SELECT p.name FROM role_permissions rp
           JOIN permissions p ON rp.permission_id = p.id
           JOIN roles r ON rp.role_id = r.id
           WHERE r.business_id = $1 AND r.name = 'manager' 
           AND p.name IN ('business:delete', 'permission:manage')`,
          [testBusiness.business.id]
        );
        
        expect(ownerOnlyPermissions.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });

    test('Staff should have limited permissions', async () => {
      const client = await getClient();
      
      try {
        // Staff should only have basic read and limited write permissions
        const staffPermissions = await client.query(
          `SELECT p.name, p.action FROM role_permissions rp
           JOIN permissions p ON rp.permission_id = p.id
           JOIN roles r ON rp.role_id = r.id
           WHERE r.business_id = $1 AND r.name = 'staff'`,
          [testBusiness.business.id]
        );
        
        // Staff should not have delete permissions or sensitive operations
        const sensitivePermissions = staffPermissions.rows.filter(p => 
          p.action === 'delete' || 
          p.name.includes('permission') ||
          p.name.includes('business:')
        );
        
        expect(sensitivePermissions.length).toBe(0);
      } finally {
        client.release();
      }
    });
  });

  describe('Default Role Setup', () => {
    test('Business should have default roles created', async () => {
      const client = await getClient();
      
      try {
        const rolesResult = await client.query(
          'SELECT name, is_system_role FROM roles WHERE business_id = $1',
          [testBusiness.business.id]
        );
        
        const roleNames = rolesResult.rows.map(row => row.name);
        
        expect(roleNames).toContain('owner');
        expect(roleNames).toContain('manager');
        expect(roleNames).toContain('staff');
        
        // Check that these are system roles
        const systemRoles = rolesResult.rows.filter(row => row.is_system_role === true);
        expect(systemRoles.length).toBeGreaterThanOrEqual(3);
      } finally {
        client.release();
      }
    });

    test('System permissions should be properly assigned', async () => {
      const client = await getClient();
      
      try {
        const permissionsResult = await client.query(
          `SELECT COUNT(*) as count FROM role_permissions rp
           JOIN roles r ON rp.role_id = r.id
           WHERE r.business_id = $1`,
          [testBusiness.business.id]
        );
        
        // Should have reasonable number of permission assignments
        expect(parseInt(permissionsResult.rows[0].count)).toBeGreaterThan(10);
      } finally {
        client.release();
      }
    });
  });
});
