import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import crypto from 'crypto';

export class ApiKeyService {

  // Generate API key and secret
  static generateApiCredentials() {
    const apiKey = `bizzy_${crypto.randomBytes(16).toString('hex')}`;
    const apiSecret = crypto.randomBytes(32).toString('hex');
    const apiSecretHash = crypto.createHash('sha256').update(apiSecret).digest('hex');

    return { apiKey, apiSecret, apiSecretHash };
  }

  // Create API key
  static async createApiKey(businessId, keyData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { apiKey, apiSecret, apiSecretHash } = this.generateApiCredentials();

      const query = `
        INSERT INTO api_keys (
          business_id, name, description, api_key, api_secret_hash,
          permissions, rate_limit_per_minute, allowed_ips, allowed_origins,
          expires_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const values = [
        businessId,
        keyData.name,
        keyData.description || '',
        apiKey,
        apiSecretHash,
        JSON.stringify(keyData.permissions || []),
        keyData.rate_limit_per_minute || 60,
        keyData.allowed_ips || [],
        keyData.allowed_origins || [],
        keyData.expires_at || null,
        userId
      ];

      const result = await client.query(query, values);
      const apiKeyRecord = result.rows[0];

      // Don't return the secret hash to the client
      const response = { ...apiKeyRecord, api_secret: apiSecret };
      delete response.api_secret_hash;

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'api_keys.created',
        resourceType: 'api_keys',
        resourceId: apiKeyRecord.id,
        newValues: {
          name: keyData.name,
          permissions: keyData.permissions
        }
      });

      await client.query('COMMIT');
      return response;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get all API keys for business
  static async getApiKeys(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT id, name, description, api_key, permissions, rate_limit_per_minute,
               allowed_ips, allowed_origins, expires_at, last_used_at, usage_count,
               is_active, created_at, updated_at
        FROM api_keys
        WHERE business_id = $1
      `;
      const values = [businessId];

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

  // ✅ FIX: Add method to get API key record by API key string
  static async getApiKeyRecord(apiKey) {
    const client = await getClient();
    try {
      const query = `
        SELECT id FROM api_keys 
        WHERE api_key = $1 AND is_active = true
      `;

      const result = await client.query(query, [apiKey]);
      return result.rows.length > 0 ? result.rows[0] : null;

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Validate API key
  static async validateApiKey(apiKey, ipAddress) {
    const client = await getClient();
    try {
      const query = `
        SELECT ak.*, b.timezone
        FROM api_keys ak
        INNER JOIN businesses b ON ak.business_id = b.id
        WHERE ak.api_key = $1 AND ak.is_active = true
        AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
      `;

      const result = await client.query(query, [apiKey]);

      if (result.rows.length === 0) {
        return { isValid: false, reason: 'Invalid or expired API key' };
      }

      const apiKeyRecord = result.rows[0];

      // Check IP restrictions
      if (apiKeyRecord.allowed_ips && apiKeyRecord.allowed_ips.length > 0) {
        const ipAllowed = apiKeyRecord.allowed_ips.some(ipRange => {
          // Simple IP range check (for demo - use proper CIDR library in production)
          return ipAddress.startsWith(ipRange.replace('/32', '').replace('0.0.0.0/0', ''));
        });

        if (!ipAllowed) {
          return { isValid: false, reason: 'IP address not allowed' };
        }
      }

      // Update last used
      await client.query(
        'UPDATE api_keys SET last_used_at = NOW(), usage_count = usage_count + 1 WHERE id = $1',
        [apiKeyRecord.id]
      );

      return {
        isValid: true,
        businessId: apiKeyRecord.business_id,
        permissions: apiKeyRecord.permissions || [],
        rateLimit: apiKeyRecord.rate_limit_per_minute,
        timezone: apiKeyRecord.timezone
      };

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Rotate API secret
  static async rotateApiSecret(businessId, apiKeyId, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { apiSecret, apiSecretHash } = this.generateApiCredentials();

      const query = `
        UPDATE api_keys
        SET api_secret_hash = $1, updated_at = NOW()
        WHERE id = $2 AND business_id = $3
        RETURNING *
      `;

      const result = await client.query(query, [apiSecretHash, apiKeyId, businessId]);

      if (result.rows.length === 0) {
        throw new Error('API key not found');
      }

      const apiKeyRecord = result.rows[0];
      const response = { ...apiKeyRecord, api_secret: apiSecret };
      delete response.api_secret_hash;

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'api_keys.rotated',
        resourceType: 'api_keys',
        resourceId: apiKeyId,
        newValues: { secret_rotated: true }
      });

      await client.query('COMMIT');
      return response;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Delete API key
  static async deleteApiKey(businessId, apiKeyId, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        DELETE FROM api_keys
        WHERE id = $1 AND business_id = $2
        RETURNING *
      `;

      const result = await client.query(query, [apiKeyId, businessId]);

      if (result.rows.length === 0) {
        throw new Error('API key not found');
      }

      const deletedKey = result.rows[0];

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'api_keys.deleted',
        resourceType: 'api_keys',
        resourceId: apiKeyId,
        oldValues: { name: deletedKey.name }
      });

      await client.query('COMMIT');
      return deletedKey;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ✅ FIX: Log API usage - now accepts apiKeyId (UUID) not apiKey string
  static async logApiUsage(businessId, apiKeyId, usageData) {
    const client = await getClient();
    try {
      const query = `
        INSERT INTO api_key_usage_logs (
          business_id, api_key_id, endpoint, method, request_headers,
          response_status, response_size, processing_time_ms, ip_address,
          user_agent, request_body_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;

      const values = [
        businessId,
        apiKeyId, // ✅ This is now the UUID, not the API key string
        usageData.endpoint,
        usageData.method,
        JSON.stringify(usageData.request_headers || {}),
        usageData.response_status || 200, // Default to 200 if not provided
        usageData.response_size || 0,
        usageData.processing_time_ms || 0,
        usageData.ip_address,
        usageData.user_agent,
        usageData.request_body_hash || null
      ];

      await client.query(query, values);

    } catch (error) {
      console.error('Failed to log API usage:', error);
      // Don't throw - API usage logging shouldn't break the main request
    } finally {
      client.release();
    }
  }
}
