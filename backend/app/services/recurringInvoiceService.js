import { query } from '../utils/database.js';
import { log } from '../utils/logger.js';

export const recurringInvoiceService = {
  async getAllRecurringInvoices(businessId, options = {}) {
    try {
      let queryStr = `
        SELECT 
          ri.*, 
          c.first_name as customer_first_name, 
          c.last_name as customer_last_name,
          c.email as customer_email,
          CONCAT(c.first_name, ' ', c.last_name) as customer_full_name
        FROM recurring_invoices ri
        LEFT JOIN customers c ON ri.customer_id = c.id
        WHERE ri.business_id = $1
      `;
      const params = [businessId];
      
      if (options.status) {
        queryStr += ` AND ri.status = $${params.length + 1}`;
        params.push(options.status);
      }
      
      queryStr += ` ORDER BY ri.next_invoice_date ASC, ri.created_at DESC`;
      
      const result = await query(queryStr, params);
      return result.rows;
    } catch (error) {
      log.error('Error fetching recurring invoices', error);
      throw new Error('Failed to fetch recurring invoices: ' + error.message);
    }
  },

  async getRecurringInvoiceById(id, businessId) {
    try {
      const result = await query(
        `SELECT 
          ri.*, 
          c.first_name as customer_first_name,
          c.last_name as customer_last_name,
          c.email as customer_email,
          CONCAT(c.first_name, ' ', c.last_name) as customer_full_name,
          it.name as template_name
         FROM recurring_invoices ri
         LEFT JOIN customers c ON ri.customer_id = c.id
         LEFT JOIN invoice_templates it ON ri.template_id = it.id
         WHERE ri.id = $1 AND ri.business_id = $2`,
        [id, businessId]
      );
      return result.rows[0] || null;
    } catch (error) {
      log.error('Error fetching recurring invoice by ID', error);
      throw new Error('Failed to fetch recurring invoice');
    }
  },

  async createRecurringInvoice(invoiceData, userId, businessId) {
    try {
      const {
        name,
        description,
        customer_id,
        template_id,
        frequency,
        start_date,
        end_date,
        next_invoice_date,
        status = 'active',
        total_amount = 0
      } = invoiceData;
      
      const result = await query(
        `INSERT INTO recurring_invoices 
         (business_id, name, description, customer_id, template_id, 
          frequency, start_date, end_date, next_invoice_date, status, 
          total_amount, created_by) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
         RETURNING *`,
        [
          businessId, name, description, customer_id, template_id,
          frequency, start_date, end_date, next_invoice_date, status,
          total_amount, userId
        ]
      );
      
      return result.rows[0];
    } catch (error) {
      log.error('Error creating recurring invoice', error);
      throw new Error('Failed to create recurring invoice: ' + error.message);
    }
  },

  async updateRecurringInvoice(id, invoiceData, userId, businessId) {
    try {
      const {
        name,
        description,
        customer_id,
        template_id,
        frequency,
        start_date,
        end_date,
        next_invoice_date,
        status,
        total_amount
      } = invoiceData;
      
      const result = await query(
        `UPDATE recurring_invoices 
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             customer_id = COALESCE($3, customer_id),
             template_id = COALESCE($4, template_id),
             frequency = COALESCE($5, frequency),
             start_date = COALESCE($6, start_date),
             end_date = COALESCE($7, end_date),
             next_invoice_date = COALESCE($8, next_invoice_date),
             status = COALESCE($9, status),
             total_amount = COALESCE($10, total_amount),
             updated_at = NOW()
         WHERE id = $11 AND business_id = $12
         RETURNING *`,
        [
          name, description, customer_id, template_id, frequency,
          start_date, end_date, next_invoice_date, status, total_amount,
          id, businessId
        ]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Recurring invoice not found');
      }
      
      return result.rows[0];
    } catch (error) {
      log.error('Error updating recurring invoice', error);
      throw error;
    }
  },

  async deleteRecurringInvoice(id, businessId) {
    try {
      const result = await query(
        `DELETE FROM recurring_invoices 
         WHERE id = $1 AND business_id = $2 
         RETURNING id`,
        [id, businessId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Recurring invoice not found');
      }
      
      return true;
    } catch (error) {
      log.error('Error deleting recurring invoice', error);
      throw error;
    }
  },

  async pauseRecurringInvoice(id, businessId) {
    try {
      const result = await query(
        `UPDATE recurring_invoices 
         SET status = 'paused', updated_at = NOW()
         WHERE id = $1 AND business_id = $2
         RETURNING *`,
        [id, businessId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Recurring invoice not found');
      }
      
      return result.rows[0];
    } catch (error) {
      log.error('Error pausing recurring invoice', error);
      throw error;
    }
  },

  async resumeRecurringInvoice(id, businessId) {
    try {
      const result = await query(
        `UPDATE recurring_invoices 
         SET status = 'active', updated_at = NOW()
         WHERE id = $1 AND business_id = $2
         RETURNING *`,
        [id, businessId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Recurring invoice not found');
      }
      
      return result.rows[0];
    } catch (error) {
      log.error('Error resuming recurring invoice', error);
      throw error;
    }
  }
};
