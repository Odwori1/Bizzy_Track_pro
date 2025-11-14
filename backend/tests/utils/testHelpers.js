import { getClient } from '../../app/utils/database.js';
import bcrypt from 'bcryptjs';

/**
 * Test helper utilities for security testing
 */
export const testHelpers = {
  /**
   * Create a test business with owner
   */
  async createTestBusiness(businessData = {}) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      // Create business
      const businessResult = await client.query(
        `INSERT INTO businesses (name, currency, currency_symbol, timezone, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING *`,
        [
          businessData.name || 'Test Business',
          businessData.currency || 'USD',
          businessData.currencySymbol || '$',
          businessData.timezone || 'UTC'
        ]
      );
      const business = businessResult.rows[0];

      // Create owner user
      const passwordHash = await bcrypt.hash('test123', 10);
      const userResult = await client.query(
        `INSERT INTO users (business_id, email, full_name, password_hash, role, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [
          business.id,
          businessData.ownerEmail || 'owner@testbusiness.com',
          businessData.ownerName || 'Test Owner',
          passwordHash,
          'owner',
          true
        ]
      );
      const owner = userResult.rows[0];

      await client.query('COMMIT');

      return { business, owner };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Create test user with specific role
   */
  async createTestUser(businessId, userData = {}) {
    const client = await getClient();
    
    try {
      const passwordHash = await bcrypt.hash('test123', 10);
      const result = await client.query(
        `INSERT INTO users (business_id, email, full_name, password_hash, role, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [
          businessId,
          userData.email || 'staff@testbusiness.com',
          userData.fullName || 'Test Staff',
          passwordHash,
          userData.role || 'staff',
          true
        ]
      );

      return result.rows[0];

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Clean up test data
   */
  async cleanupTestData(businessId) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      // Clean up in correct order to respect foreign keys
      const tables = [
        'audit_logs',
        'user_feature_toggles',
        'role_permissions',
        'invoice_line_items',
        'invoices',
        'job_status_history', 
        'jobs',
        'customers',
        'services',
        'customer_categories',
        'users',
        'businesses'
      ];

      for (const table of tables) {
        try {
          if (table === 'businesses') {
            await client.query('DELETE FROM businesses WHERE id = $1', [businessId]);
          } else {
            await client.query(`DELETE FROM ${table} WHERE business_id = $1`, [businessId]);
          }
        } catch (error) {
          // Table might not exist or have business_id, continue
        }
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Generate JWT token for testing
   */
  generateTestToken(userData = {}) {
    // This would normally use your JWT signing logic
    // For testing, we'll create a mock token structure
    const mockToken = `mock-token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return {
      token: mockToken,
      user: {
        userId: userData.userId || 'test-user-id',
        businessId: userData.businessId || 'test-business-id',
        email: userData.email || 'test@example.com',
        role: userData.role || 'staff',
        timezone: userData.timezone || 'UTC'
      }
    };
  },

  /**
   * Verify permission is granted/denied
   */
  verifyPermission(result, shouldHavePermission = true) {
    if (shouldHavePermission) {
      if (result.success === false && result.error?.includes('permission')) {
        throw new Error(`Expected permission granted but was denied: ${result.error}`);
      }
    } else {
      if (result.success !== false || !result.error?.includes('permission')) {
        throw new Error('Expected permission denied but was granted');
      }
    }
  }
};
