import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';

export class ExternalIntegrationService {

  // Create external integration
  static async createIntegration(businessId, integrationData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO external_integrations (
          business_id, service_name, provider, config,
          permissions, rate_limits, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const values = [
        businessId,
        integrationData.service_name,
        integrationData.provider,
        JSON.stringify(integrationData.config || {}),
        JSON.stringify(integrationData.permissions || []),
        JSON.stringify(integrationData.rate_limits || {}),
        userId
      ];

      const result = await client.query(query, values);
      const integration = result.rows[0];

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'external_integrations.created',
        resourceType: 'external_integrations',
        resourceId: integration.id,
        newValues: {
          service_name: integrationData.service_name,
          provider: integrationData.provider
        }
      });

      await client.query('COMMIT');
      return integration;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get integrations
  static async getIntegrations(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT * FROM external_integrations
        WHERE business_id = $1
      `;
      const values = [businessId];

      if (filters.service_name) {
        query += ` AND service_name = $${values.length + 1}`;
        values.push(filters.service_name);
      }

      if (filters.provider) {
        query += ` AND provider = $${values.length + 1}`;
        values.push(filters.provider);
      }

      if (filters.is_active !== undefined) {
        query += ` AND is_active = $${values.length + 1}`;
        values.push(filters.is_active);
      }

      query += ' ORDER BY created_at DESC';

      const result = await client.query(query, values);
      return result.rows;

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Update integration
  static async updateIntegration(businessId, integrationId, updateData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        UPDATE external_integrations 
        SET config = $1, permissions = $2, rate_limits = $3,
            is_active = $4, updated_at = NOW()
        WHERE id = $5 AND business_id = $6
        RETURNING *
      `;

      const values = [
        JSON.stringify(updateData.config || {}),
        JSON.stringify(updateData.permissions || []),
        JSON.stringify(updateData.rate_limits || {}),
        updateData.is_active !== undefined ? updateData.is_active : true,
        integrationId,
        businessId
      ];

      const result = await client.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Integration not found');
      }

      const integration = result.rows[0];

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'external_integrations.updated',
        resourceType: 'external_integrations',
        resourceId: integrationId,
        newValues: updateData
      });

      await client.query('COMMIT');
      return integration;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Log integration activity
  static async logIntegrationActivity(businessId, integrationId, activityData) {
    const client = await getClient();
    try {
      const query = `
        INSERT INTO integration_audit_logs (
          business_id, integration_id, action, resource_type,
          resource_id, request_data, response_data, error_message,
          ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const values = [
        businessId,
        integrationId,
        activityData.action,
        activityData.resource_type,
        activityData.resource_id,
        JSON.stringify(activityData.request_data || {}),
        JSON.stringify(activityData.response_data || {}),
        activityData.error_message,
        activityData.ip_address,
        activityData.user_agent
      ];

      const result = await client.query(query, values);
      return result.rows[0];

    } catch (error) {
      console.error('Failed to log integration activity:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Test integration connection
  static async testIntegrationConnection(businessId, integrationId, userId) {
    const client = await getClient();
    try {
      const query = `
        SELECT * FROM external_integrations 
        WHERE id = $1 AND business_id = $2 AND is_active = true
      `;

      const result = await client.query(query, [integrationId, businessId]);
      
      if (result.rows.length === 0) {
        throw new Error('Integration not found or inactive');
      }

      const integration = result.rows[0];

      // Simulate connection test (in real implementation, this would make actual API calls)
      const testResult = {
        success: true,
        message: 'Integration connection test successful',
        response_time_ms: Math.floor(Math.random() * 500) + 100,
        tested_at: new Date()
      };

      // Update last sync time
      await client.query(
        'UPDATE external_integrations SET last_sync_at = NOW() WHERE id = $1',
        [integrationId]
      );

      // Log test activity
      await this.logIntegrationActivity(businessId, integrationId, {
        action: 'connection_test',
        request_data: { test: true },
        response_data: testResult,
        ip_address: '127.0.0.1',
        user_agent: 'BizzyTrack-Test'
      });

      return testResult;

    } catch (error) {
      // Log failed test
      await this.logIntegrationActivity(businessId, integrationId, {
        action: 'connection_test',
        request_data: { test: true },
        error_message: error.message,
        ip_address: '127.0.0.1',
        user_agent: 'BizzyTrack-Test'
      });

      throw error;
    } finally {
      client.release();
    }
  }
}
