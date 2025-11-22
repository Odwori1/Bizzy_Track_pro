import { query } from '../utils/database.js';
import { log } from '../utils/logger.js';

export const serviceCategoryService = {
  async createCategory(categoryData, userId, businessId) {
    try {
      const { name, description, color, sort_order } = categoryData;

      const result = await query(
        `INSERT INTO service_categories 
         (business_id, name, description, color, sort_order, created_by) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [businessId, name, description, color, sort_order, userId]
      );

      log.info('Service category created successfully', {
        categoryId: result.rows[0].id,
        businessId
      });

      return result.rows[0];

    } catch (error) {
      log.error('Service category creation service error', error);
      throw error;
    }
  },

  async getAllCategories(businessId) {
    try {
      const result = await query(
        `SELECT * FROM service_categories 
         WHERE business_id = $1 
         ORDER BY sort_order, name`,
        [businessId]
      );

      return result.rows;

    } catch (error) {
      log.error('Service categories fetch service error', error);
      throw error;
    }
  },

  async getCategoryById(categoryId, businessId) {
    try {
      const result = await query(
        `SELECT * FROM service_categories 
         WHERE id = $1 AND business_id = $2`,
        [categoryId, businessId]
      );

      return result.rows[0] || null;

    } catch (error) {
      log.error('Service category fetch by ID service error', error);
      throw error;
    }
  },

  async updateCategory(categoryId, updateData, userId, businessId) {
    try {
      const { name, description, color, sort_order, is_active } = updateData;

      const result = await query(
        `UPDATE service_categories 
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             color = COALESCE($3, color),
             sort_order = COALESCE($4, sort_order),
             is_active = COALESCE($5, is_active),
             updated_at = NOW()
         WHERE id = $6 AND business_id = $7
         RETURNING *`,
        [name, description, color, sort_order, is_active, categoryId, businessId]
      );

      if (result.rows.length > 0) {
        log.info('Service category updated successfully', {
          categoryId,
          businessId
        });
      }

      return result.rows[0] || null;

    } catch (error) {
      log.error('Service category update service error', error);
      throw error;
    }
  },

  async deleteCategory(categoryId, userId, businessId) {
    try {
      // Check if category is being used by any services
      const servicesUsingCategory = await query(
        `SELECT COUNT(*) as service_count FROM services 
         WHERE service_category_id = $1 AND business_id = $2`,
        [categoryId, businessId]
      );

      if (parseInt(servicesUsingCategory.rows[0].service_count) > 0) {
        throw new Error('Cannot delete category that is being used by services');
      }

      const result = await query(
        `DELETE FROM service_categories 
         WHERE id = $1 AND business_id = $2 
         RETURNING *`,
        [categoryId, businessId]
      );

      if (result.rows.length > 0) {
        log.info('Service category deleted successfully', {
          categoryId,
          businessId
        });
      }

      return result.rows[0] || null;

    } catch (error) {
      log.error('Service category deletion service error', error);
      throw error;
    }
  }
};
