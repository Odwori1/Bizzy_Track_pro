import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

export const customerService = {
  async createCustomer(customerData, userId, businessId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const createQuery = `
        INSERT INTO customers
        (business_id, category_id, first_name, last_name, email, phone,
         company_name, tax_number, address, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const values = [
        businessId,
        customerData.category_id || null,
        customerData.first_name,
        customerData.last_name,
        customerData.email || '',
        customerData.phone || '',
        customerData.company_name || '',
        customerData.tax_number || '',
        customerData.address || null,
        customerData.notes || '',
        userId
      ];

      const result = await client.query(createQuery, values);
      const newCustomer = result.rows[0];

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'customer.created',
        resourceType: 'customer',
        resourceId: newCustomer.id,
        newValues: newCustomer
      });

      await client.query('COMMIT');

      log.info('Customer created', {
        customerId: newCustomer.id,
        businessId,
        userId,
        customerName: `${newCustomer.first_name} ${newCustomer.last_name}`
      });

      return newCustomer;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Customer creation failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getAllCustomers(businessId, options = {}) {
    const client = await getClient();
    try {
      let selectQuery = `
        SELECT
          c.id, c.first_name, c.last_name, c.email, c.phone,
          c.company_name, c.tax_number, c.address, c.notes,
          c.total_spent, c.last_visit, c.is_active, c.created_at,
          cat.id as category_id, cat.name as category_name, cat.color as category_color
        FROM customers c
        LEFT JOIN customer_categories cat ON c.category_id = cat.id
        WHERE c.business_id = $1
      `;

      const values = [businessId];
      let paramCount = 2;

      // Filter by active status if provided
      if (options.activeOnly) {
        selectQuery += ` AND c.is_active = $${paramCount}`;
        values.push(true);
        paramCount++;
      }

      // Filter by category if provided
      if (options.category_id) {
        selectQuery += ` AND c.category_id = $${paramCount}`;
        values.push(options.category_id);
        paramCount++;
      }

      selectQuery += ` ORDER BY c.created_at DESC`;

      const result = await client.query(selectQuery, values);

      log.debug('Fetched customers', {
        businessId,
        count: result.rows.length,
        filters: options
      });

      return result.rows;
    } catch (error) {
      log.error('Failed to fetch customers', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getCustomerById(id, businessId) {
    const client = await getClient();
    try {
      const selectQuery = `
        SELECT
          c.*,
          cat.name as category_name, cat.color as category_color
        FROM customers c
        LEFT JOIN customer_categories cat ON c.category_id = cat.id
        WHERE c.id = $1 AND c.business_id = $2
      `;

      const result = await client.query(selectQuery, [id, businessId]);
      const customer = result.rows[0] || null;

      if (customer) {
        log.debug('Fetched customer by ID', { customerId: id, businessId });
      } else {
        log.debug('Customer not found', { customerId: id, businessId });
      }

      return customer;
    } catch (error) {
      log.error('Failed to fetch customer by ID', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async updateCustomer(id, customerData, userId, businessId) {
    const client = await getClient();

    try {
      // First get the current values for audit logging
      const currentCustomer = await this.getCustomerById(id, businessId);
      if (!currentCustomer) {
        throw new Error('Customer not found');
      }

      await client.query('BEGIN');

      const updateFields = [];
      const values = [];
      let paramCount = 1;

      // Build dynamic update query
      if (customerData.first_name !== undefined) {
        updateFields.push(`first_name = $${paramCount}`);
        values.push(customerData.first_name);
        paramCount++;
      }

      if (customerData.last_name !== undefined) {
        updateFields.push(`last_name = $${paramCount}`);
        values.push(customerData.last_name);
        paramCount++;
      }

      if (customerData.email !== undefined) {
        updateFields.push(`email = $${paramCount}`);
        values.push(customerData.email);
        paramCount++;
      }

      if (customerData.phone !== undefined) {
        updateFields.push(`phone = $${paramCount}`);
        values.push(customerData.phone);
        paramCount++;
      }

      if (customerData.company_name !== undefined) {
        updateFields.push(`company_name = $${paramCount}`);
        values.push(customerData.company_name);
        paramCount++;
      }

      if (customerData.tax_number !== undefined) {
        updateFields.push(`tax_number = $${paramCount}`);
        values.push(customerData.tax_number);
        paramCount++;
      }

      if (customerData.category_id !== undefined) {
        updateFields.push(`category_id = $${paramCount}`);
        values.push(customerData.category_id);
        paramCount++;
      }

      if (customerData.address !== undefined) {
        updateFields.push(`address = $${paramCount}`);
        values.push(customerData.address);
        paramCount++;
      }

      if (customerData.notes !== undefined) {
        updateFields.push(`notes = $${paramCount}`);
        values.push(customerData.notes);
        paramCount++;
      }

      if (customerData.is_active !== undefined) {
        updateFields.push(`is_active = $${paramCount}`);
        values.push(customerData.is_active);
        paramCount++;
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      values.push(id, businessId);

      const updateQuery = `
        UPDATE customers
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount} AND business_id = $${paramCount + 1}
        RETURNING *
      `;

      const result = await client.query(updateQuery, values);
      const updatedCustomer = result.rows[0];

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'customer.updated',
        resourceType: 'customer',
        resourceId: id,
        oldValues: currentCustomer,
        newValues: updatedCustomer
      });

      await client.query('COMMIT');

      log.info('Customer updated', {
        customerId: id,
        businessId,
        userId
      });

      return updatedCustomer;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Customer update failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async deleteCustomer(id, userId, businessId) {
    const client = await getClient();

    try {
      // First get the current values for audit logging
      const currentCustomer = await this.getCustomerById(id, businessId);
      if (!currentCustomer) {
        throw new Error('Customer not found');
      }

      await client.query('BEGIN');

      // Soft delete by setting is_active to false
      const deleteQuery = `
        UPDATE customers
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND business_id = $2
        RETURNING *
      `;

      const result = await client.query(deleteQuery, [id, businessId]);
      const deletedCustomer = result.rows[0];

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'customer.deleted',
        resourceType: 'customer',
        resourceId: id,
        oldValues: currentCustomer,
        newValues: deletedCustomer
      });

      await client.query('COMMIT');

      log.info('Customer deleted', {
        customerId: id,
        businessId,
        userId
      });

      return deletedCustomer;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Customer deletion failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async searchCustomers(businessId, searchTerm) {
    const client = await getClient();
    try {
      const searchQuery = `
        SELECT
          c.id, c.first_name, c.last_name, c.email, c.phone,
          c.company_name, c.is_active,
          cat.name as category_name
        FROM customers c
        LEFT JOIN customer_categories cat ON c.category_id = cat.id
        WHERE c.business_id = $1
          AND (c.first_name ILIKE $2 OR c.last_name ILIKE $2 OR c.email ILIKE $2 OR c.phone ILIKE $2)
        ORDER BY c.first_name, c.last_name
        LIMIT 50
      `;

      const result = await client.query(searchQuery, [businessId, `%${searchTerm}%`]);

      log.debug('Searched customers', {
        businessId,
        searchTerm,
        count: result.rows.length
      });

      return result.rows;
    } catch (error) {
      log.error('Customer search failed', error);
      throw error;
    } finally {
      client.release();
    }
  }
};
