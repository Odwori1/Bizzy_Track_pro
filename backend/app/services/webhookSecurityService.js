import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import crypto from 'crypto';

export class WebhookSecurityService {

  // Create webhook endpoint
  static async createWebhookEndpoint(businessId, webhookData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const secretToken = `whsec_${crypto.randomBytes(32).toString('hex')}`;

      const query = `
        INSERT INTO webhook_endpoints (
          business_id, name, description, url, secret_token,
          events, content_type, retry_config, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const values = [
        businessId,
        webhookData.name,
        webhookData.description || '',
        webhookData.url,
        secretToken,
        JSON.stringify(webhookData.events || []),
        webhookData.content_type || 'application/json',
        JSON.stringify(webhookData.retry_config || { max_attempts: 3, backoff_multiplier: 2 }),
        userId
      ];

      const result = await client.query(query, values);
      const webhook = result.rows[0];

      // Don't return the secret token
      delete webhook.secret_token;

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'webhook_endpoints.created',
        resourceType: 'webhook_endpoints',
        resourceId: webhook.id,
        newValues: {
          name: webhookData.name,
          url: webhookData.url,
          events: webhookData.events
        }
      });

      await client.query('COMMIT');
      return webhook;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get webhook endpoints
  static async getWebhookEndpoints(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT id, name, description, url, events, content_type,
               retry_config, is_active, created_at, updated_at
        FROM webhook_endpoints
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

  // Verify webhook signature
  static async verifyWebhookSignature(businessId, providerName, payload, signature, timestamp) {
    const client = await getClient();
    try {
      // Get webhook signature configuration
      const query = `
        SELECT * FROM webhook_signatures
        WHERE business_id = $1 AND provider_name = $2 AND is_active = true
      `;

      const result = await client.query(query, [businessId, providerName]);

      if (result.rows.length === 0) {
        return { isValid: false, reason: 'Webhook signature configuration not found' };
      }

      const config = result.rows[0];
      const expectedSignature = crypto
        .createHmac(config.signature_algorithm, config.secret_key)
        .update(timestamp + '.' + payload)
        .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      return {
        isValid,
        reason: isValid ? 'Valid signature' : 'Invalid signature'
      };

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Log webhook delivery
  static async logWebhookDelivery(businessId, webhookEndpointId, deliveryData) {
    const client = await getClient();
    try {
      const query = `
        INSERT INTO webhook_delivery_logs (
          business_id, webhook_endpoint_id, event_type, payload,
          attempt_number, response_status, response_body, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const values = [
        businessId,
        webhookEndpointId,
        deliveryData.event_type,
        JSON.stringify(deliveryData.payload || {}),
        deliveryData.attempt_number || 1,
        deliveryData.response_status,
        deliveryData.response_body,
        deliveryData.error_message
      ];

      const result = await client.query(query, values);
      return result.rows[0];

    } catch (error) {
      console.error('Failed to log webhook delivery:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Update webhook delivery status
  static async updateWebhookDeliveryStatus(deliveryId, statusData) {
    const client = await getClient();
    try {
      const query = `
        UPDATE webhook_delivery_logs
        SET response_status = $1, response_body = $2, error_message = $3,
            delivered_at = $4, next_retry_at = $5
        WHERE id = $6
        RETURNING *
      `;

      const values = [
        statusData.response_status,
        statusData.response_body,
        statusData.error_message,
        statusData.delivered_at || null,
        statusData.next_retry_at || null,
        deliveryId
      ];

      const result = await client.query(query, values);
      return result.rows[0];

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // ✅ ADD MISSING METHOD: Create webhook signature
  static async createWebhookSignature(businessId, signatureData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO webhook_signatures (
          business_id, provider_name, secret_key, signature_algorithm,
          verification_rules, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [
        businessId,
        signatureData.provider_name,
        signatureData.secret_key,
        signatureData.signature_algorithm || 'sha256',
        JSON.stringify(signatureData.verification_rules || {}),
        userId  // ✅ ADD THIS - CRITICAL!
      ];

      const result = await client.query(query, values);
      const signature = result.rows[0];

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'webhook_signatures.created',
        resourceType: 'webhook_signatures',
        resourceId: signature.id,
        newValues: {
          provider_name: signatureData.provider_name,
          signature_algorithm: signatureData.signature_algorithm
        }
      });

      await client.query('COMMIT');
      return signature;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ✅ ADD MISSING METHOD: Get webhook signatures
  static async getWebhookSignatures(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT id, provider_name, signature_algorithm, verification_rules, is_active, created_at, updated_at
        FROM webhook_signatures
        WHERE business_id = $1
      `;
      const values = [businessId];

      if (filters.is_active !== undefined) {
        query += ` AND is_active = $${values.length + 1}`;
        values.push(filters.is_active);
      }

      if (filters.provider_name) {
        query += ` AND provider_name = $${values.length + 1}`;
        values.push(filters.provider_name);
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

  // ✅ ADD THE NEW METHOD: Update webhook signature
  static async updateWebhookSignature(businessId, signatureId, signatureData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        UPDATE webhook_signatures 
        SET secret_key = $1, signature_algorithm = $2, verification_rules = $3,
            updated_at = NOW()
        WHERE id = $4 AND business_id = $5
        RETURNING *
      `;

      const values = [
        signatureData.secret_key,
        signatureData.signature_algorithm || 'sha256',
        JSON.stringify(signatureData.verification_rules || {}),
        signatureId,
        businessId
      ];

      const result = await client.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Webhook signature not found');
      }

      const signature = result.rows[0];

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'webhook_signatures.updated',
        resourceType: 'webhook_signatures',
        resourceId: signatureId,
        newValues: {
          signature_algorithm: signatureData.signature_algorithm
        }
      });

      await client.query('COMMIT');
      return signature;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ... rest of existing methods if any ...
}
