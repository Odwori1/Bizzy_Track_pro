import { testHelpers } from '../utils/testHelpers.js';
import { getClient } from '../../app/utils/database.js';

/**
 * Multi-tenant Isolation Tests
 */
describe('Multi-tenant Isolation Tests', () => {
  let businessA, businessB;
  let ownerA, ownerB;
  let staffA, staffB;

  beforeAll(async () => {
    // Create two separate test businesses
    businessA = await testHelpers.createTestBusiness({
      name: 'Business A',
      ownerEmail: 'owner@business-a.com'
    });
    ownerA = businessA.owner;

    businessB = await testHelpers.createTestBusiness({
      name: 'Business B', 
      ownerEmail: 'owner@business-b.com'
    });
    ownerB = businessB.owner;

    // Create staff for both businesses
    staffA = await testHelpers.createTestUser(businessA.business.id, {
      email: 'staff@business-a.com',
      role: 'staff'
    });

    staffB = await testHelpers.createTestUser(businessB.business.id, {
      email: 'staff@business-b.com',
      role: 'staff'
    });
  });

  afterAll(async () => {
    await Promise.all([
      testHelpers.cleanupTestData(businessA.business.id),
      testHelpers.cleanupTestData(businessB.business.id)
    ]);
  });

  describe('RLS Policy Enforcement', () => {
    test('Users should only see their own business data', async () => {
      const client = await getClient();
      
      try {
        // Set RLS context for Business A
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [businessA.business.id]);
        
        // Business A should only see their own users
        const usersA = await client.query('SELECT * FROM users');
        const userBusinessIdsA = [...new Set(usersA.rows.map(user => user.business_id))];
        
        expect(userBusinessIdsA).toHaveLength(1);
        expect(userBusinessIdsA[0]).toBe(businessA.business.id);

        // Switch to Business B context
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [businessB.business.id]);
        
        // Business B should only see their own users
        const usersB = await client.query('SELECT * FROM users');
        const userBusinessIdsB = [...new Set(usersB.rows.map(user => user.business_id))];
        
        expect(userBusinessIdsB).toHaveLength(1);
        expect(userBusinessIdsB[0]).toBe(businessB.business.id);

      } finally {
        client.release();
      }
    });

    test('Data should be completely isolated between businesses', async () => {
      const client = await getClient();
      
      try {
        // Create test data in Business A
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [businessA.business.id]);
        
        const customerA = await client.query(
          `INSERT INTO customers (business_id, first_name, last_name, email, is_active, created_by, created_at)
           VALUES ($1, 'John', 'Doe', 'john@business-a.com', true, $2, NOW())
           RETURNING *`,
          [businessA.business.id, ownerA.id]
        );

        // Switch to Business B context
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [businessB.business.id]);
        
        // Business B should not see Business A's customer
        const customersB = await client.query(
          'SELECT * FROM customers WHERE email = $1',
          ['john@business-a.com']
        );
        
        expect(customersB.rows).toHaveLength(0);

        // Switch back to Business A context
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [businessA.business.id]);
        
        // Business A should see their customer
        const customersA = await client.query(
          'SELECT * FROM customers WHERE email = $1',
          ['john@business-a.com']
        );
        
        expect(customersA.rows).toHaveLength(1);

      } finally {
        client.release();
      }
    });
  });

  describe('Cross-business Data Access Prevention', () => {
    test('Should prevent accessing other business data by ID manipulation', async () => {
      const client = await getClient();
      
      try {
        // Create a customer in Business A
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [businessA.business.id]);
        
        const customerA = await client.query(
          `INSERT INTO customers (business_id, first_name, last_name, email, is_active, created_by, created_at)
           VALUES ($1, 'Jane', 'Smith', 'jane@business-a.com', true, $2, NOW())
           RETURNING *`,
          [businessA.business.id, ownerA.id]
        );
        const customerAId = customerA.rows[0].id;

        // Switch to Business B context and try to access Business A's customer
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [businessB.business.id]);
        
        const unauthorizedAccess = await client.query(
          'SELECT * FROM customers WHERE id = $1',
          [customerAId]
        );
        
        // RLS should prevent access
        expect(unauthorizedAccess.rows).toHaveLength(0);

      } finally {
        client.release();
      }
    });

    test('Business-specific permissions should not leak', async () => {
      const client = await getClient();
      
      try {
        // Check that permissions are business-isolated
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [businessA.business.id]);
        
        const permissionsA = await client.query(
          'SELECT * FROM permissions WHERE business_id IS NULL OR business_id = $1',
          [businessA.business.id]
        );

        await client.query("SELECT set_config('app.current_business_id', $1, true)", [businessB.business.id]);
        
        const permissionsB = await client.query(
          'SELECT * FROM permissions WHERE business_id IS NULL OR business_id = $1',
          [businessB.business.id]
        );

        // Both should have access to system permissions (business_id IS NULL)
        // but their business-specific permissions should be isolated
        const systemPermissionsCountA = permissionsA.rows.filter(p => p.business_id === null).length;
        const systemPermissionsCountB = permissionsB.rows.filter(p => p.business_id === null).length;
        
        expect(systemPermissionsCountA).toBeGreaterThan(0);
        expect(systemPermissionsCountA).toEqual(systemPermissionsCountB);

      } finally {
        client.release();
      }
    });
  });

  describe('Audit Log Isolation', () => {
    test('Audit logs should be business-specific', async () => {
      const client = await getClient();
      
      try {
        // Create audit log entries for both businesses
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [businessA.business.id]);
        
        await client.query(
          `INSERT INTO audit_logs (business_id, user_id, action, resource_type, resource_id, created_at)
           VALUES ($1, $2, 'test.action', 'customer', 'test-id-1', NOW())`,
          [businessA.business.id, ownerA.id]
        );

        await client.query("SELECT set_config('app.current_business_id', $1, true)", [businessB.business.id]);
        
        await client.query(
          `INSERT INTO audit_logs (business_id, user_id, action, resource_type, resource_id, created_at)
           VALUES ($1, $2, 'test.action', 'customer', 'test-id-2', NOW())`,
          [businessB.business.id, ownerB.id]
        );

        // Verify isolation
        await client.query("SELECT set_config('app.current_business_id', $1, true)", [businessA.business.id]);
        const logsA = await client.query('SELECT * FROM audit_logs');
        expect(logsA.rows.every(log => log.business_id === businessA.business.id)).toBe(true);

        await client.query("SELECT set_config('app.current_business_id', $1, true)", [businessB.business.id]);
        const logsB = await client.query('SELECT * FROM audit_logs');
        expect(logsB.rows.every(log => log.business_id === businessB.business.id)).toBe(true);

      } finally {
        client.release();
      }
    });
  });
});
