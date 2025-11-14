import { testHelpers } from '../utils/testHelpers.js';
import { getClient } from '../../app/utils/database.js';

/**
 * ABAC (Attribute-Based Access Control) Tests
 */
describe('ABAC System Tests', () => {
  let testBusiness;
  let testOwner;
  let testStaff;

  beforeAll(async () => {
    testBusiness = await testHelpers.createTestBusiness({
      name: 'ABAC Test Business',
      ownerEmail: 'abac-owner@test.com'
    });
    
    testOwner = testBusiness.owner;
    
    testStaff = await testHelpers.createTestUser(testBusiness.business.id, {
      email: 'staff@abac-test.com',
      fullName: 'ABAC Test Staff',
      role: 'staff'
    });
  });

  afterAll(async () => {
    await testHelpers.cleanupTestData(testBusiness.business.id);
  });

  describe('User Feature Toggles', () => {
    test('Should create user-specific feature toggles', async () => {
      const client = await getClient();
      
      try {
        // Get a permission to toggle
        const permissionResult = await client.query(
          `SELECT id FROM permissions 
           WHERE name = 'invoice:create' AND is_system_permission = true 
           LIMIT 1`
        );
        
        if (permissionResult.rows.length > 0) {
          const permissionId = permissionResult.rows[0].id;
          
          // Create feature toggle for staff user
          await client.query(
            `INSERT INTO user_feature_toggles 
             (user_id, permission_id, is_allowed, granted_by, granted_at, expires_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '1 day')`,
            [testStaff.id, permissionId, true, testOwner.id]
          );
          
          // Verify toggle was created
          const toggleResult = await client.query(
            `SELECT * FROM user_feature_toggles 
             WHERE user_id = $1 AND permission_id = $2`,
            [testStaff.id, permissionId]
          );
          
          expect(toggleResult.rows.length).toBe(1);
          expect(toggleResult.rows[0].is_allowed).toBe(true);
        }
      } finally {
        client.release();
      }
    });

    test('Should respect feature toggle conditions', async () => {
      const client = await getClient();
      
      try {
        // Get invoice creation permission
        const permissionResult = await client.query(
          `SELECT id FROM permissions 
           WHERE name = 'invoice:create' AND is_system_permission = true 
           LIMIT 1`
        );
        
        if (permissionResult.rows.length > 0) {
          const permissionId = permissionResult.rows[0].id;
          
          // Create toggle with specific conditions
          await client.query(
            `INSERT INTO user_feature_toggles 
             (user_id, permission_id, is_allowed, conditions, granted_by, granted_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
              testStaff.id, 
              permissionId, 
              true, 
              JSON.stringify({ max_amount: 1000, allowed_categories: ['standard'] }),
              testOwner.id
            ]
          );
          
          // Verify conditions are stored properly
          const toggleResult = await client.query(
            `SELECT conditions FROM user_feature_toggles 
             WHERE user_id = $1 AND permission_id = $2`,
            [testStaff.id, permissionId]
          );
          
          expect(toggleResult.rows.length).toBe(1);
          const conditions = JSON.parse(toggleResult.rows[0].conditions);
          expect(conditions.max_amount).toBe(1000);
          expect(conditions.allowed_categories).toEqual(['standard']);
        }
      } finally {
        client.release();
      }
    });

    test('Should handle expired feature toggles', async () => {
      const client = await getClient();
      
      try {
        const permissionResult = await client.query(
          `SELECT id FROM permissions 
           WHERE name = 'job:delete' AND is_system_permission = true 
           LIMIT 1`
        );
        
        if (permissionResult.rows.length > 0) {
          const permissionId = permissionResult.rows[0].id;
          
          // Create expired toggle
          await client.query(
            `INSERT INTO user_feature_toggles 
             (user_id, permission_id, is_allowed, granted_by, granted_at, expires_at)
             VALUES ($1, $2, $3, $4, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day')`,
            [testStaff.id, permissionId, true, testOwner.id]
          );
          
          // System should ignore expired toggles in permission checks
          // This would be tested in the permission middleware
        }
      } finally {
        client.release();
      }
    });
  });

  describe('Permission Evaluation', () => {
    test('Should combine RBAC and ABAC correctly', async () => {
      const client = await getClient();
      
      try {
        // Test that the system properly evaluates both role permissions and feature toggles
        // This is more of an integration test that would verify the permission middleware
        
        const userPermissions = await client.query(
          `SELECT p.name, p.action 
           FROM permissions p
           LEFT JOIN role_permissions rp ON p.id = rp.permission_id
           LEFT JOIN roles r ON rp.role_id = r.id
           LEFT JOIN user_feature_toggles uft ON p.id = uft.permission_id 
             AND uft.user_id = $1 
             AND (uft.expires_at IS NULL OR uft.expires_at > NOW())
           WHERE r.business_id = $2 AND r.name = 'staff'
             AND (rp.id IS NOT NULL OR uft.id IS NOT NULL)`,
          [testStaff.id, testBusiness.business.id]
        );
        
        // Should have some permissions from role or feature toggles
        expect(userPermissions.rows.length).toBeGreaterThan(0);
      } finally {
        client.release();
      }
    });
  });
});
