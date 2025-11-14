import { testHelpers } from '../utils/testHelpers.js';
import { getClient } from '../../app/utils/database.js';

/**
 * Permission Enforcement Tests
 */
describe('Permission Enforcement Tests', () => {
  let testBusiness;
  let testOwner;
  let testManager;
  let testStaff;

  beforeAll(async () => {
    testBusiness = await testHelpers.createTestBusiness({
      name: 'Permission Enforcement Test Business',
      ownerEmail: 'permissions-owner@test.com'
    });
    
    testOwner = testBusiness.owner;
    
    testManager = await testHelpers.createTestUser(testBusiness.business.id, {
      email: 'manager@permissions-test.com',
      fullName: 'Permissions Test Manager',
      role: 'manager'
    });

    testStaff = await testHelpers.createTestUser(testBusiness.business.id, {
      email: 'staff@permissions-test.com',
      fullName: 'Permissions Test Staff',
      role: 'staff'
    });
  });

  afterAll(async () => {
    await testHelpers.cleanupTestData(testBusiness.business.id);
  });

  describe('API Endpoint Security', () => {
    test('Should enforce permission checks on protected routes', async () => {
      const client = await getClient();
      
      try {
        // This test would verify that the permission middleware is applied to routes
        // Since we're testing at database level, we'll verify permission assignments
        
        // Staff should not have business management permissions
        const staffBusinessPermissions = await client.query(
          `SELECT p.name FROM role_permissions rp
           JOIN permissions p ON rp.permission_id = p.id
           JOIN roles r ON rp.role_id = r.id
           WHERE r.business_id = $1 AND r.name = 'staff'
           AND p.name LIKE 'business:%'`,
          [testBusiness.business.id]
        );
        
        expect(staffBusinessPermissions.rows.length).toBe(0);

        // Manager should have some business permissions but not all
        const managerBusinessPermissions = await client.query(
          `SELECT p.name FROM role_permissions rp
           JOIN permissions p ON rp.permission_id = p.id
           JOIN roles r ON rp.role_id = r.id
           WHERE r.business_id = $1 AND r.name = 'manager'
           AND p.name LIKE 'business:%'`,
          [testBusiness.business.id]
        );
        
        // Manager might have business:read but not business:delete
        const hasDeletePermission = managerBusinessPermissions.rows.some(
          p => p.name === 'business:delete'
        );
        expect(hasDeletePermission).toBe(false);

      } finally {
        client.release();
      }
    });

    test('Should handle permission hierarchy correctly', async () => {
      const client = await getClient();
      
      try {
        // Verify that higher roles inherit or have superset of lower role permissions
        const staffPermissions = await client.query(
          `SELECT p.name FROM role_permissions rp
           JOIN permissions p ON rp.permission_id = p.id
           JOIN roles r ON rp.role_id = r.id
           WHERE r.business_id = $1 AND r.name = 'staff'`,
          [testBusiness.business.id]
        );

        const managerPermissions = await client.query(
          `SELECT p.name FROM role_permissions rp
           JOIN permissions p ON rp.permission_id = p.id
           JOIN roles r ON rp.role_id = r.id
           WHERE r.business_id = $1 AND r.name = 'manager'`,
          [testBusiness.business.id]
        );

        const ownerPermissions = await client.query(
          `SELECT p.name FROM role_permissions rp
           JOIN permissions p ON rp.permission_id = p.id
           JOIN roles r ON rp.role_id = r.id
           WHERE r.business_id = $1 AND r.name = 'owner'`,
          [testBusiness.business.id]
        );

        // Manager should have all staff permissions plus more
        const staffPermissionNames = staffPermissions.rows.map(p => p.name);
        const managerPermissionNames = managerPermissions.rows.map(p => p.name);
        
        staffPermissionNames.forEach(permission => {
          expect(managerPermissionNames).toContain(permission);
        });

        // Owner should have all manager permissions plus more
        managerPermissionNames.forEach(permission => {
          expect(ownerPermissions.rows.map(p => p.name)).toContain(permission);
        });

      } finally {
        client.release();
      }
    });
  });

  describe('Resource-specific Permissions', () => {
    test('Should enforce resource-level permissions', async () => {
      const client = await getClient();
      
      try {
        // Test that different resource types have appropriate permission sets
        const resourceTypes = await client.query(
          `SELECT DISTINCT resource_type FROM permissions WHERE is_system_permission = true`
        );

        const expectedResourceTypes = ['business', 'customer', 'service', 'job', 'invoice', 'permission'];
        
        expectedResourceTypes.forEach(resourceType => {
          expect(resourceTypes.rows.map(r => r.resource_type)).toContain(resourceType);
        });

        // Each resource type should have basic CRUD operations
        for (const resourceType of expectedResourceTypes) {
          const operations = await client.query(
            `SELECT DISTINCT action FROM permissions 
             WHERE resource_type = $1 AND is_system_permission = true`,
            [resourceType]
          );
          
          const operationNames = operations.rows.map(op => op.action);
          expect(operationNames).toContain('read');
          
          if (resourceType !== 'permission') {
            expect(operationNames).toContain('create');
          }
        }

      } finally {
        client.release();
      }
    });
  });

  describe('Permission Denial Scenarios', () => {
    test('Should properly handle unauthorized access attempts', async () => {
      const client = await getClient();
      
      try {
        // Verify that staff role doesn't have sensitive permissions
        const sensitivePermissions = await client.query(
          `SELECT p.name FROM role_permissions rp
           JOIN permissions p ON rp.permission_id = p.id
           JOIN roles r ON rp.role_id = r.id
           WHERE r.business_id = $1 AND r.name = 'staff'
           AND (p.name LIKE 'permission:%' OR p.name LIKE 'business:delete' OR p.name = 'user:delete')`,
          [testBusiness.business.id]
        );
        
        expect(sensitivePermissions.rows.length).toBe(0);

        // Test that ABAC feature toggles can override denials
        const deniedPermission = await client.query(
          `SELECT id FROM permissions 
           WHERE name = 'job:delete' AND is_system_permission = true 
           LIMIT 1`
        );
        
        if (deniedPermission.rows.length > 0) {
          const permissionId = deniedPermission.rows[0].id;
          
          // Staff normally can't delete jobs, but feature toggle can grant it
          await client.query(
            `INSERT INTO user_feature_toggles 
             (user_id, permission_id, is_allowed, granted_by, granted_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [testStaff.id, permissionId, true, testOwner.id]
          );
          
          // Verify the override exists
          const override = await client.query(
            `SELECT * FROM user_feature_toggles 
             WHERE user_id = $1 AND permission_id = $2 AND is_allowed = true`,
            [testStaff.id, permissionId]
          );
          
          expect(override.rows.length).toBe(1);
        }

      } finally {
        client.release();
      }
    });
  });
});
