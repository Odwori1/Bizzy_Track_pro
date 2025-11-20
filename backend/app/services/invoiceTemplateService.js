import { query } from '../utils/database.js';
import { log } from '../utils/logger.js';

export const invoiceTemplateService = {
  async getAllTemplates(businessId) {
    try {
      const result = await query(
        `SELECT * FROM invoice_templates 
         WHERE business_id = $1 
         ORDER BY created_at DESC`,
        [businessId]
      );
      return result.rows;
    } catch (error) {
      log.error('Error fetching invoice templates', error);
      throw new Error('Failed to fetch invoice templates');
    }
  },

  async getTemplateById(id, businessId) {
    try {
      const result = await query(
        `SELECT * FROM invoice_templates 
         WHERE id = $1 AND business_id = $2`,
        [id, businessId]
      );
      return result.rows[0] || null;
    } catch (error) {
      log.error('Error fetching invoice template by ID', error);
      throw new Error('Failed to fetch invoice template');
    }
  },

  async createTemplate(templateData, userId, businessId) {
    try {
      const { name, description, content, is_active = true } = templateData;
      
      const result = await query(
        `INSERT INTO invoice_templates 
         (business_id, name, description, content, is_active, created_by) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [businessId, name, description, content, is_active, userId]
      );
      
      return result.rows[0];
    } catch (error) {
      log.error('Error creating invoice template', error);
      throw new Error('Failed to create invoice template');
    }
  },

  async updateTemplate(id, templateData, userId, businessId) {
    try {
      const { name, description, content, is_active } = templateData;
      
      const result = await query(
        `UPDATE invoice_templates 
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             content = COALESCE($3, content),
             is_active = COALESCE($4, is_active),
             updated_at = NOW()
         WHERE id = $5 AND business_id = $6
         RETURNING *`,
        [name, description, content, is_active, id, businessId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Invoice template not found');
      }
      
      return result.rows[0];
    } catch (error) {
      log.error('Error updating invoice template', error);
      throw error; // Re-throw to preserve original error message
    }
  },

  async deleteTemplate(id, businessId) {
    try {
      const result = await query(
        `DELETE FROM invoice_templates 
         WHERE id = $1 AND business_id = $2 
         RETURNING id`,
        [id, businessId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Invoice template not found');
      }
      
      return true;
    } catch (error) {
      log.error('Error deleting invoice template', error);
      throw error;
    }
  }
};
