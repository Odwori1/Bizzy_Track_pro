import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

export const serviceService = {
  async createService(serviceData, userId, businessId) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');
      
      const createQuery = `
        INSERT INTO services 
        (business_id, name, description, base_price, duration_minutes, category, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const values = [
        businessId,
        serviceData.name,
        serviceData.description || '',
        serviceData.base_price,
        serviceData.duration_minutes || 60,
        serviceData.category || 'General',
        userId
      ];
      
      const result = await client.query(createQuery, values);
      const newService = result.rows[0];
      
      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'service.created',
        resourceType: 'service',
        resourceId: newService.id,
        newValues: newService
      });
      
      await client.query('COMMIT');
      
      log.info('Service created', {
        serviceId: newService.id,
        businessId,
        userId,
        serviceName: newService.name
      });
      
      return newService;
      
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Service creation failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getAllServices(businessId, options = {}) {
    try {
      let selectQuery = `
        SELECT 
          id, name, description, base_price, duration_minutes, 
          category, is_active, created_at, updated_at
        FROM services 
        WHERE business_id = $1
      `;
      
      const values = [businessId];
      let paramCount = 2;
      
      // Filter by active status if provided
      if (options.activeOnly) {
        selectQuery += ` AND is_active = $${paramCount}`;
        values.push(true);
        paramCount++;
      }
      
      // Filter by category if provided
      if (options.category) {
        selectQuery += ` AND category = $${paramCount}`;
        values.push(options.category);
        paramCount++;
      }
      
      selectQuery += ` ORDER BY name`;
      
      const result = await query(selectQuery, values);
      
      log.debug('Fetched services', {
        businessId,
        count: result.rows.length,
        filters: options
      });
      
      return result.rows;
    } catch (error) {
      log.error('Failed to fetch services', error);
      throw error;
    }
  },

  async getServiceById(id, businessId) {
    try {
      const selectQuery = `
        SELECT 
          id, name, description, base_price, duration_minutes, 
          category, is_active, created_at, updated_at
        FROM services 
        WHERE id = $1 AND business_id = $2
      `;
      
      const result = await query(selectQuery, [id, businessId]);
      const service = result.rows[0] || null;
      
      if (service) {
        log.debug('Fetched service by ID', { serviceId: id, businessId });
      } else {
        log.debug('Service not found', { serviceId: id, businessId });
      }
      
      return service;
    } catch (error) {
      log.error('Failed to fetch service by ID', error);
      throw error;
    }
  },

  async updateService(id, serviceData, userId, businessId) {
    const client = await getClient();
    
    try {
      // First get the current values for audit logging
      const currentService = await this.getServiceById(id, businessId);
      if (!currentService) {
        throw new Error('Service not found');
      }
      
      await client.query('BEGIN');
      
      const updateFields = [];
      const values = [];
      let paramCount = 1;
      
      // Build dynamic update query
      if (serviceData.name !== undefined) {
        updateFields.push(`name = $${paramCount}`);
        values.push(serviceData.name);
        paramCount++;
      }
      
      if (serviceData.description !== undefined) {
        updateFields.push(`description = $${paramCount}`);
        values.push(serviceData.description);
        paramCount++;
      }
      
      if (serviceData.base_price !== undefined) {
        updateFields.push(`base_price = $${paramCount}`);
        values.push(serviceData.base_price);
        paramCount++;
      }
      
      if (serviceData.duration_minutes !== undefined) {
        updateFields.push(`duration_minutes = $${paramCount}`);
        values.push(serviceData.duration_minutes);
        paramCount++;
      }
      
      if (serviceData.category !== undefined) {
        updateFields.push(`category = $${paramCount}`);
        values.push(serviceData.category);
        paramCount++;
      }
      
      if (serviceData.is_active !== undefined) {
        updateFields.push(`is_active = $${paramCount}`);
        values.push(serviceData.is_active);
        paramCount++;
      }
      
      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }
      
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      
      values.push(id, businessId);
      
      const updateQuery = `
        UPDATE services 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount} AND business_id = $${paramCount + 1}
        RETURNING *
      `;
      
      const result = await client.query(updateQuery, values);
      const updatedService = result.rows[0];
      
      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'service.updated',
        resourceType: 'service',
        resourceId: id,
        oldValues: currentService,
        newValues: updatedService
      });
      
      await client.query('COMMIT');
      
      log.info('Service updated', {
        serviceId: id,
        businessId,
        userId
      });
      
      return updatedService;
      
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Service update failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async deleteService(id, userId, businessId) {
    const client = await getClient();
    
    try {
      // First get the current values for audit logging
      const currentService = await this.getServiceById(id, businessId);
      if (!currentService) {
        throw new Error('Service not found');
      }
      
      await client.query('BEGIN');
      
      // Soft delete by setting is_active to false
      const deleteQuery = `
        UPDATE services 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND business_id = $2
        RETURNING *
      `;
      
      const result = await client.query(deleteQuery, [id, businessId]);
      const deletedService = result.rows[0];
      
      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'service.deleted',
        resourceType: 'service',
        resourceId: id,
        oldValues: currentService,
        newValues: deletedService
      });
      
      await client.query('COMMIT');
      
      log.info('Service deleted', {
        serviceId: id,
        businessId,
        userId
      });
      
      return deletedService;
      
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Service deletion failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getServiceCategories(businessId) {
    try {
      const categoriesQuery = `
        SELECT DISTINCT category 
        FROM services 
        WHERE business_id = $1 AND is_active = true
        ORDER BY category
      `;
      
      const result = await query(categoriesQuery, [businessId]);
      
      const categories = result.rows.map(row => row.category);
      
      log.debug('Fetched service categories', {
        businessId,
        categories
      });
      
      return categories;
    } catch (error) {
      log.error('Failed to fetch service categories', error);
      throw error;
    }
  }
};
