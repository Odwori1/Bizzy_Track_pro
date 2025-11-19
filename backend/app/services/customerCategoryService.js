import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

export const customerCategoryService = {
  async createCategory(categoryData, userId, businessId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const createQuery = `
        INSERT INTO customer_categories
        (business_id, name, description, color, discount_percentage, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [
        businessId,
        categoryData.name,
        categoryData.description || '',
        categoryData.color || '#3B82F6',
        categoryData.discount_percentage || 0,
        userId
      ];

      const result = await client.query(createQuery, values);
      const newCategory = result.rows[0];

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'category.created',
        resourceType: 'customer_category',
        resourceId: newCategory.id,
        newValues: newCategory
      });

      await client.query('COMMIT');

      log.info('Customer category created', {
        categoryId: newCategory.id,
        businessId,
        userId
      });

      return newCategory;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Customer category creation failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getAllCategories(businessId) {
    const client = await getClient();
    try {
      const selectQuery = `
        SELECT id, name, description, color, discount_percentage, is_active, created_at
        FROM customer_categories
        WHERE business_id = $1 AND is_active = true
        ORDER BY name
      `;

      const result = await client.query(selectQuery, [businessId]);

      log.debug('Fetched customer categories', {
        businessId,
        count: result.rows.length
      });

      return result.rows;
    } catch (error) {
      log.error('Failed to fetch customer categories', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getCategoryById(id, businessId) {
    const client = await getClient();
    try {
      const selectQuery = `
        SELECT id, name, description, color, discount_percentage, is_active, created_at
        FROM customer_categories
        WHERE id = $1 AND business_id = $2
      `;

      const result = await client.query(selectQuery, [id, businessId]);
      const category = result.rows[0] || null;

      if (category) {
        log.debug('Fetched customer category by ID', { categoryId: id, businessId });
      } else {
        log.debug('Customer category not found', { categoryId: id, businessId });
      }

      return category;
    } catch (error) {
      log.error('Failed to fetch customer category by ID', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async updateCategory(id, categoryData, userId, businessId) {
    const client = await getClient();

    try {
      // First get the current values for audit logging
      const currentCategory = await this.getCategoryById(id, businessId);
      if (!currentCategory) {
        throw new Error('Category not found');
      }

      await client.query('BEGIN');

      const updateFields = [];
      const values = [];
      let paramCount = 1;

      // Build dynamic update query following existing pattern
      if (categoryData.name !== undefined) {
        updateFields.push(`name = $${paramCount}`);
        values.push(categoryData.name);
        paramCount++;
      }

      if (categoryData.description !== undefined) {
        updateFields.push(`description = $${paramCount}`);
        values.push(categoryData.description);
        paramCount++;
      }

      if (categoryData.color !== undefined) {
        updateFields.push(`color = $${paramCount}`);
        values.push(categoryData.color);
        paramCount++;
      }

      if (categoryData.discount_percentage !== undefined) {
        updateFields.push(`discount_percentage = $${paramCount}`);
        values.push(categoryData.discount_percentage);
        paramCount++;
      }

      if (categoryData.is_active !== undefined) {
        updateFields.push(`is_active = $${paramCount}`);
        values.push(categoryData.is_active);
        paramCount++;
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      values.push(id, businessId);

      const updateQuery = `
        UPDATE customer_categories
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount} AND business_id = $${paramCount + 1}
        RETURNING *
      `;

      const result = await client.query(updateQuery, values);
      const updatedCategory = result.rows[0];

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'category.updated',
        resourceType: 'customer_category',
        resourceId: id,
        oldValues: currentCategory,
        newValues: updatedCategory
      });

      await client.query('COMMIT');

      log.info('Customer category updated', {
        categoryId: id,
        businessId,
        userId
      });

      return updatedCategory;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Customer category update failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async deleteCategory(id, userId, businessId) {
    const client = await getClient();

    try {
      // First get the current values for audit logging
      const currentCategory = await this.getCategoryById(id, businessId);
      if (!currentCategory) {
        throw new Error('Category not found');
      }

      await client.query('BEGIN');

      // Soft delete by setting is_active to false (following good practice)
      const deleteQuery = `
        UPDATE customer_categories
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND business_id = $2
        RETURNING *
      `;

      const result = await client.query(deleteQuery, [id, businessId]);
      const deletedCategory = result.rows[0];

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'category.deleted',
        resourceType: 'customer_category',
        resourceId: id,
        oldValues: currentCategory,
        newValues: deletedCategory
      });

      await client.query('COMMIT');

      log.info('Customer category deleted', {
        categoryId: id,
        businessId,
        userId
      });

      return deletedCategory;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Customer category deletion failed', error);
      throw error;
    } finally {
      client.release();
    }
  }
};
