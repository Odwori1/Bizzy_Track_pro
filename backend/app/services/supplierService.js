import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class SupplierService {
  /**
   * Create a new supplier
   */
  static async createSupplier(businessId, supplierData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check for duplicate supplier name
      const nameCheck = await client.query(
        'SELECT id FROM suppliers WHERE business_id = $1 AND name = $2',
        [businessId, supplierData.name]
      );

      if (nameCheck.rows.length > 0) {
        throw new Error('Supplier name already exists');
      }

      // Insert supplier
      const result = await client.query(
        `INSERT INTO suppliers (
          business_id, name, contact_person, email, phone, address,
          tax_id, payment_terms, rating, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          businessId,
          supplierData.name,
          supplierData.contact_person || '',
          supplierData.email || '',
          supplierData.phone || '',
          supplierData.address || '',
          supplierData.tax_id || '',
          supplierData.payment_terms || '',
          supplierData.rating || 5,
          supplierData.is_active
        ]
      );

      const supplier = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'supplier.created',
        resourceType: 'supplier',
        resourceId: supplier.id,
        newValues: {
          name: supplier.name,
          contact_person: supplier.contact_person,
          email: supplier.email
        }
      });

      await client.query('COMMIT');
      return supplier;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all suppliers with optional filters
   */
  static async getSuppliers(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT 
          s.*,
          COUNT(po.id) as total_purchase_orders,
          COUNT(po.id) FILTER (WHERE po.status = 'received') as completed_orders,
          COUNT(po.id) FILTER (WHERE po.status IN ('draft', 'sent', 'confirmed')) as pending_orders
        FROM suppliers s
        LEFT JOIN purchase_orders po ON s.id = po.supplier_id
        WHERE s.business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (filters.is_active !== undefined) {
        paramCount++;
        queryStr += ` AND s.is_active = $${paramCount}`;
        params.push(filters.is_active);
      }

      if (filters.search) {
        paramCount++;
        queryStr += ` AND (
          s.name ILIKE $${paramCount} OR 
          s.contact_person ILIKE $${paramCount} OR 
          s.email ILIKE $${paramCount} OR
          s.phone ILIKE $${paramCount}
        )`;
        params.push(`%${filters.search}%`);
      }

      queryStr += ' GROUP BY s.id ORDER BY s.name';

      if (filters.page && filters.limit) {
        const offset = (filters.page - 1) * filters.limit;
        paramCount++;
        queryStr += ` LIMIT $${paramCount}`;
        params.push(filters.limit);

        paramCount++;
        queryStr += ` OFFSET $${paramCount}`;
        params.push(offset);
      }

      log.info('🗄️ Database Query - getSuppliers:', { query: queryStr, params });

      const result = await client.query(queryStr, params);

      log.info('✅ Suppliers query successful', {
        rowCount: result.rows.length,
        businessId
      });

      return result.rows;
    } catch (error) {
      log.error('❌ Suppliers query failed:', {
        error: error.message,
        businessId,
        filters
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get supplier by ID
   */
  static async getSupplierById(businessId, supplierId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT 
          s.*,
          COUNT(po.id) as total_purchase_orders,
          COUNT(po.id) FILTER (WHERE po.status = 'received') as completed_orders,
          COUNT(po.id) FILTER (WHERE po.status IN ('draft', 'sent', 'confirmed')) as pending_orders,
          COALESCE(AVG(po.total_amount), 0) as average_order_value
        FROM suppliers s
        LEFT JOIN purchase_orders po ON s.id = po.supplier_id
        WHERE s.business_id = $1 AND s.id = $2
        GROUP BY s.id
      `;

      log.info('🗄️ Database Query - getSupplierById:', { query: queryStr, params: [businessId, supplierId] });

      const result = await client.query(queryStr, [businessId, supplierId]);

      if (result.rows.length === 0) {
        throw new Error('Supplier not found or access denied');
      }

      log.info('✅ Supplier query successful', {
        supplierId,
        businessId
      });

      return result.rows[0];
    } catch (error) {
      log.error('❌ Supplier query failed:', {
        error: error.message,
        businessId,
        supplierId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update supplier
   */
  static async updateSupplier(businessId, supplierId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify supplier belongs to business and get current values
      const currentSupplier = await client.query(
        'SELECT * FROM suppliers WHERE id = $1 AND business_id = $2',
        [supplierId, businessId]
      );

      if (currentSupplier.rows.length === 0) {
        throw new Error('Supplier not found or access denied');
      }

      // Check for duplicate name if name is being updated
      if (updateData.name && updateData.name !== currentSupplier.rows[0].name) {
        const nameCheck = await client.query(
          'SELECT id FROM suppliers WHERE business_id = $1 AND name = $2 AND id != $3',
          [businessId, updateData.name, supplierId]
        );

        if (nameCheck.rows.length > 0) {
          throw new Error('Supplier name already exists');
        }
      }

      // Build dynamic update query
      const updateFields = [];
      const updateValues = [];
      let paramCount = 0;

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          paramCount++;
          updateFields.push(`${key} = $${paramCount}`);
          updateValues.push(updateData[key]);
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      paramCount++;
      updateFields.push(`updated_at = $${paramCount}`);
      updateValues.push(new Date());

      paramCount++;
      updateValues.push(supplierId);
      paramCount++;
      updateValues.push(businessId);

      const updateQuery = `
        UPDATE suppliers
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount - 1} AND business_id = $${paramCount}
        RETURNING *
      `;

      log.info('🗄️ Database Query - updateSupplier:', { query: updateQuery, params: updateValues });

      const result = await client.query(updateQuery, updateValues);
      const updatedSupplier = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'supplier.updated',
        resourceType: 'supplier',
        resourceId: supplierId,
        oldValues: currentSupplier.rows[0],
        newValues: updatedSupplier
      });

      await client.query('COMMIT');
      return updatedSupplier;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get supplier statistics
   */
  static async getSupplierStatistics(businessId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT
          COUNT(*) as total_suppliers,
          COUNT(*) FILTER (WHERE is_active = true) as active_suppliers,
          COUNT(*) FILTER (WHERE rating >= 4) as high_rated_suppliers,
          COUNT(*) FILTER (WHERE rating <= 2) as low_rated_suppliers,
          COALESCE(AVG(rating), 0) as average_rating
        FROM suppliers
        WHERE business_id = $1
      `;

      log.info('🗄️ Database Query - getSupplierStatistics:', { query: queryStr, params: [businessId] });

      const result = await client.query(queryStr, [businessId]);

      log.info('✅ Supplier statistics query successful', {
        businessId
      });

      return result.rows[0];
    } catch (error) {
      log.error('❌ Supplier statistics query failed:', {
        error: error.message,
        businessId
      });
      throw error;
    } finally {
      client.release();
    }
  }
}
