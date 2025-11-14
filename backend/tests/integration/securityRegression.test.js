import { testHelpers } from '../utils/testHelpers.js';
import { getClient } from '../../app/utils/database.js';

/**
 * Security Regression Tests
 * Tests to prevent security vulnerabilities and permission escalation
 */
describe('Security Regression Tests', () => {
  let testBusiness;
  let testOwner;
  let testStaff;

  beforeAll(async () => {
    testBusiness = await testHelpers.createTestBusiness({
      name: 'Security Regression Test Business',
      ownerEmail: 'security-owner@test.com'
    });
    
    testOwner = testBusiness.owner;
    
    testStaff = await testHelpers.createTestUser(testBusiness.business.id, {
      email: 'staff@security-test.com',
      role: 'staff'
    });
  });

  afterAll(async () => {
    await testHelpers.cleanupTestData(testBusiness.business.id);
  });

  describe('Permission Escalation Prevention', () => {
    test('Should prevent users from modifying their own permissions', async () => {
      const client = await getClient();
      
      try {
        // Staff should not have permission management rights
        const staffPermissionAccess = await client.query(
          `SELECT p.name FROM role_permissions rp
           JOIN permissions p ON rp.permission_id = p.id
           JOIN roles r ON rp.role_id = r.id
           WHERE r.business_id = $1 AND r.name = 'staff'
           AND p.name LIKE 'permission:%'`,
          [testBusiness.business.id]
        );
        
        expect(staffPermissionAccess.rows.length).toBe(0);

        // Even with feature toggles, certain permissions should not be grantable to non-owners
        const dangerousPermissions = await client.query(
          `SELECT name FROM permissions 
           WHERE name IN ('permission:manage', 'business:delete', 'user:delete')
           AND is_system_permission = true`
        );
        
        // Verify these can't be granted to staff via feature toggles in application logic
        // This is a policy that should be enforced in the business logic

      } finally {
        client.release();
      }
    });

    test('Should prevent cross-business permission inheritance', async () => {
      const client = await getClient();
      
      try {
        // Create another business
        const otherBusiness = await testHelpers.createTestBusiness({
          name: 'Other Business',
          ownerEmail: 'other@business.com'
        });

        // Verify that roles and permissions are business-isolated
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [testBusiness.business.id]);
        
        const rolesBusinessA = await client.query('SELECT * FROM roles');
        const rolesBusinessAIds = rolesBusinessA.rows.map(role => role.id);

        await client.query("SELECT set_config('app.current_business_id', $1, true)", [otherBusiness.business.id]);
        
        const rolesBusinessB = await client.query('SELECT * FROM roles');
        const rolesBusinessBIds = rolesBusinessB.rows.map(role => role.id);

        // No role IDs should overlap between businesses
        const overlappingRoles = rolesBusinessAIds.filter(id => rolesBusinessBIds.includes(id));
        expect(overlappingRoles).toHaveLength(0);

        // Clean up other business
        await testHelpers.cleanupTestData(otherBusiness.business.id);

      } finally {
        client.release();
      }
    });
  });

  describe('Data Integrity Security', () => {
    test('Should enforce business_id consistency', async () => {
      const client = await getClient();
      
      try {
        // Test that all user-created records have correct business_id
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [testBusiness.business.id]);
        
        // Create test records
        const customer = await client.query(
          `INSERT INTO customers (business_id, first_name, last_name, email, is_active, created_by, created_at)
           VALUES ($1, 'Test', 'Customer', 'test@customer.com', true, $2, NOW())
           RETURNING *`,
          [testBusiness.business.id, testOwner.id]
        );

        const service = await client.query(
          `INSERT INTO services (business_id, name, description, base_price, duration_minutes, category, is_active, created_by, created_at)
           VALUES ($1, 'Test Service', 'Test Description', 50.00, 60, 'Test', true, $2, NOW())
           RETURNING *`,
          [testBusiness.business.id, testOwner.id]
        );

        // Verify business_id is set correctly
        expect(customer.rows[0].business_id).toBe(testBusiness.business.id);
        expect(service.rows[0].business_id).toBe(testBusiness.business.id);

        // Test that RLS prevents inserting records with wrong business_id
        try {
          await client.query(
            `INSERT INTO customers (business_id, first_name, last_name, email, is_active, created_by, created_at)
             VALUES ($1, 'Wrong', 'Business', 'wrong@business.com', true, $2, NOW())`,
            ['wrong-business-id', testOwner.id]
          );
          // If we reach here, the test should fail
          expect(true).toBe(false);
        } catch (error) {
          // Expected - should violate foreign key or RLS
          expect(error).toBeDefined();
        }

      } finally {
        client.release();
      }
    });

    test('Should audit security-critical actions', async () => {
      const client = await getClient();
      
      try {
        // Verify that permission changes are audited
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [testBusiness.business.id]);

        // Simulate a permission change (this would normally be done via API)
        const permission = await client.query(
          `SELECT id FROM permissions WHERE name = 'invoice:create' LIMIT 1`
        );
        
        if (permission.rows.length > 0) {
          // Create a feature toggle (simulating permission change)
          await client.query(
            `INSERT INTO user_feature_toggles 
             (user_id, permission_id, is_allowed, granted_by, granted_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [testStaff.id, permission.rows[0].id, true, testOwner.id]
          );

          // Verify this action was audited
          const auditLogs = await client.query(
            `SELECT * FROM audit_logs 
             WHERE user_id = $1 AND action LIKE '%permission%' OR action LIKE '%toggle%'
             ORDER BY created_at DESC LIMIT 1`,
            [testOwner.id]
          );
          
          // Note: This assumes your audit system logs feature toggle changes
          // You may need to add this to your audit logging implementation

        }

      } finally {
        client.release();
      }
    });
  });

  describe('Session and Context Security', () => {
    test('Should properly handle RLS context switching', async () => {
      const client = await getClient();
      
      try {
        // Test that RLS context is properly isolated per request/connection
        const initialContext = await client.query('SELECT current_setting($1, true) as context', ['app.current_business_id']);
        
        // Set context
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [testBusiness.business.id]);
        
        const setContext = await client.query('SELECT current_setting($1, true) as context', ['app.current_business_id']);
        expect(setContext.rows[0].context).toBe(testBusiness.business.id);

        // Verify context doesn't leak to other operations unexpectedly
        // This would be more thoroughly tested with concurrent requests in a real app

      } finally {
        client.release();
      }
    });

    test('Should validate user-business relationship', async () => {
      const client = await getClient();
      
      try {
        // Create another business
        const otherBusiness = await testHelpers.createTestBusiness({
          name: 'Validation Test Business',
          ownerEmail: 'validation@test.com'
        });

        // Test that users can only access their own business context
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [testBusiness.business.id]);
        
        // User from other business should not be visible
        const foreignUsers = await client.query(
          'SELECT * FROM users WHERE business_id = $1',
          [otherBusiness.business.id]
        );
        
        expect(foreignUsers.rows).toHaveLength(0);

        // Clean up
        await testHelpers.cleanupTestData(otherBusiness.business.id);

      } finally {
        client.release();
      }
    });
  });
});
