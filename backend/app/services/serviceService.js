import { query } from '../utils/database.js';
import { log } from '../utils/logger.js';

export const serviceService = {
  async createService(serviceData, userId, businessId) {
    try {
      const { name, description, base_price, duration_minutes, category, service_category_id } = serviceData;

      const result = await query(
        `INSERT INTO services 
         (business_id, name, description, base_price, duration_minutes, category, service_category_id, created_by) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         RETURNING *`,
        [businessId, name, description, base_price, duration_minutes, category, service_category_id, userId]
      );

      log.info('Service created successfully', {
        serviceId: result.rows[0].id,
        businessId
      });

      return result.rows[0];

    } catch (error) {
      log.error('Service creation service error', error);
      throw error;
    }
  },

  async getAllServices(businessId, options = {}) {
    try {
      let queryStr = `
        SELECT s.*, 
               sc.name as category_name,
               sc.color as category_color,
               COALESCE(sc.name, s.category) as display_category
        FROM services s
        LEFT JOIN service_categories sc ON s.service_category_id = sc.id
        WHERE s.business_id = $1
      `;
      const queryParams = [businessId];
      let paramCount = 1;

      if (options.activeOnly) {
        queryStr += ` AND s.is_active = true`;
      }

      if (options.category) {
        paramCount++;
        queryStr += ` AND (s.category = $${paramCount} OR sc.name = $${paramCount})`;
        queryParams.push(options.category);
      }

      queryStr += ` ORDER BY s.name`;

      const result = await query(queryStr, queryParams);
      return result.rows;

    } catch (error) {
      log.error('Services fetch service error', error);
      throw error;
    }
  },

  async getServiceById(serviceId, businessId) {
    try {
      const result = await query(
        `SELECT s.*, 
                sc.name as category_name,
                sc.color as category_color,
                COALESCE(sc.name, s.category) as display_category
         FROM services s
         LEFT JOIN service_categories sc ON s.service_category_id = sc.id
         WHERE s.id = $1 AND s.business_id = $2`,
        [serviceId, businessId]
      );

      return result.rows[0] || null;

    } catch (error) {
      log.error('Service fetch by ID service error', error);
      throw error;
    }
  },

  async updateService(serviceId, updateData, userId, businessId) {
    try {
      const { name, description, base_price, duration_minutes, category, service_category_id, is_active } = updateData;

      const result = await query(
        `UPDATE services 
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             base_price = COALESCE($3, base_price),
             duration_minutes = COALESCE($4, duration_minutes),
             category = COALESCE($5, category),
             service_category_id = COALESCE($6, service_category_id),
             is_active = COALESCE($7, is_active),
             updated_at = NOW()
         WHERE id = $8 AND business_id = $9
         RETURNING *`,
        [name, description, base_price, duration_minutes, category, service_category_id, is_active, serviceId, businessId]
      );

      if (result.rows.length > 0) {
        log.info('Service updated successfully', {
          serviceId,
          businessId
        });
      }

      return result.rows[0] || null;

    } catch (error) {
      log.error('Service update service error', error);
      throw error;
    }
  },

  async deleteService(serviceId, userId, businessId) {
    try {
      const result = await query(
        `DELETE FROM services 
         WHERE id = $1 AND business_id = $2 
         RETURNING *`,
        [serviceId, businessId]
      );

      if (result.rows.length > 0) {
        log.info('Service deleted successfully', {
          serviceId,
          businessId
        });
      }

      return result.rows[0] || null;

    } catch (error) {
      log.error('Service deletion service error', error);
      throw error;
    }
  },

  async getServiceCategories(businessId) {
    try {
      // Get both relational categories and unique text categories
      const relationalCategories = await query(
        `SELECT id, name, description, color, is_active, sort_order
         FROM service_categories 
         WHERE business_id = $1 
         ORDER BY sort_order, name`,
        [businessId]
      );

      // Also get unique text categories from services
      const textCategories = await query(
        `SELECT DISTINCT category as name
         FROM services 
         WHERE business_id = $1 
         AND category IS NOT NULL 
         AND category != ''
         AND service_category_id IS NULL`,
        [businessId]
      );

      // Combine both, marking text categories as not having an ID
      const allCategories = [
        ...relationalCategories.rows.map(cat => ({
          ...cat,
          type: 'relational'
        })),
        ...textCategories.rows.map(cat => ({
          name: cat.name,
          type: 'text',
          is_active: true
        }))
      ];

      return allCategories;

    } catch (error) {
      log.error('Service categories fetch service error', error);
      throw error;
    }
  }
};
