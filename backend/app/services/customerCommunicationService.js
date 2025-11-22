import { query } from '../utils/database.js';
import { log } from '../utils/logger.js';

export const customerCommunicationService = {
  async createCommunication(communicationData, userId, businessId) {
    try {
      const {
        customer_id,
        type,
        direction,
        subject,
        content,
        status,
        related_job_id,
        related_invoice_id,
        scheduled_for
      } = communicationData;

      const result = await query(
        `INSERT INTO customer_communications 
         (business_id, customer_id, type, direction, subject, content, 
          status, related_job_id, related_invoice_id, scheduled_for, created_by) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
         RETURNING *`,
        [
          businessId, customer_id, type, direction, subject, content,
          status || 'sent', related_job_id, related_invoice_id, scheduled_for, userId
        ]
      );

      log.info('Customer communication created successfully', {
        communicationId: result.rows[0].id,
        customerId: customer_id,
        businessId
      });

      return result.rows[0];

    } catch (error) {
      log.error('Customer communication creation service error', error);
      throw error;
    }
  },

  async getAllCommunications(businessId, options = {}) {
    try {
      let queryStr = `
        SELECT cc.*, 
               c.first_name || ' ' || c.last_name as customer_name,
               c.email as customer_email,
               c.phone as customer_phone
        FROM customer_communications cc
        LEFT JOIN customers c ON cc.customer_id = c.id
        WHERE cc.business_id = $1
      `;
      const queryParams = [businessId];
      let paramCount = 1;

      if (options.customerId) {
        paramCount++;
        queryStr += ` AND cc.customer_id = $${paramCount}`;
        queryParams.push(options.customerId);
      }

      if (options.type) {
        paramCount++;
        queryStr += ` AND cc.type = $${paramCount}`;
        queryParams.push(options.type);
      }

      if (options.direction) {
        paramCount++;
        queryStr += ` AND cc.direction = $${paramCount}`;
        queryParams.push(options.direction);
      }

      queryStr += ` ORDER BY cc.created_at DESC`;

      if (options.limit) {
        queryStr += ` LIMIT $${paramCount + 1}`;
        queryParams.push(options.limit);
      }

      const result = await query(queryStr, queryParams);
      return result.rows;

    } catch (error) {
      log.error('Customer communications fetch service error', error);
      throw error;
    }
  },

  async getCommunicationById(communicationId, businessId) {
    try {
      const result = await query(
        `SELECT cc.*, 
                c.first_name || ' ' || c.last_name as customer_name,
                c.email as customer_email,
                c.phone as customer_phone
         FROM customer_communications cc
         LEFT JOIN customers c ON cc.customer_id = c.id
         WHERE cc.id = $1 AND cc.business_id = $2`,
        [communicationId, businessId]
      );

      return result.rows[0] || null;

    } catch (error) {
      log.error('Customer communication fetch by ID service error', error);
      throw error;
    }
  },

  async getCommunicationsByCustomerId(customerId, businessId, options = {}) {
    try {
      let queryStr = `
        SELECT cc.* 
        FROM customer_communications cc
        WHERE cc.customer_id = $1 AND cc.business_id = $2
      `;
      const queryParams = [customerId, businessId];
      let paramCount = 2;

      if (options.type) {
        paramCount++;
        queryStr += ` AND cc.type = $${paramCount}`;
        queryParams.push(options.type);
      }

      if (options.direction) {
        paramCount++;
        queryStr += ` AND cc.direction = $${paramCount}`;
        queryParams.push(options.direction);
      }

      queryStr += ` ORDER BY cc.created_at DESC`;

      if (options.limit) {
        queryStr += ` LIMIT $${paramCount + 1}`;
        queryParams.push(options.limit);
      }

      const result = await query(queryStr, queryParams);
      return result.rows;

    } catch (error) {
      log.error('Customer communications by customer ID service error', error);
      throw error;
    }
  },

  async updateCommunication(communicationId, updateData, userId, businessId) {
    try {
      const {
        type,
        direction,
        subject,
        content,
        status,
        related_job_id,
        related_invoice_id,
        scheduled_for,
        sent_at
      } = updateData;

      const result = await query(
        `UPDATE customer_communications 
         SET type = COALESCE($1, type),
             direction = COALESCE($2, direction),
             subject = COALESCE($3, subject),
             content = COALESCE($4, content),
             status = COALESCE($5, status),
             related_job_id = COALESCE($6, related_job_id),
             related_invoice_id = COALESCE($7, related_invoice_id),
             scheduled_for = COALESCE($8, scheduled_for),
             sent_at = COALESCE($9, sent_at),
             updated_at = NOW()
         WHERE id = $10 AND business_id = $11
         RETURNING *`,
        [
          type, direction, subject, content, status,
          related_job_id, related_invoice_id, scheduled_for, sent_at,
          communicationId, businessId
        ]
      );

      if (result.rows.length > 0) {
        log.info('Customer communication updated successfully', {
          communicationId,
          businessId
        });
      }

      return result.rows[0] || null;

    } catch (error) {
      log.error('Customer communication update service error', error);
      throw error;
    }
  },

  async deleteCommunication(communicationId, userId, businessId) {
    try {
      const result = await query(
        `DELETE FROM customer_communications 
         WHERE id = $1 AND business_id = $2 
         RETURNING *`,
        [communicationId, businessId]
      );

      if (result.rows.length > 0) {
        log.info('Customer communication deleted successfully', {
          communicationId,
          businessId
        });
      }

      return result.rows[0] || null;

    } catch (error) {
      log.error('Customer communication deletion service error', error);
      throw error;
    }
  }
};
