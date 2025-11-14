import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

export const packageService = {
  async createPackage(packageData, userId, businessId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Create the package
      const createPackageQuery = `
        INSERT INTO service_packages
        (business_id, name, description, base_price, duration_minutes, 
         category, is_customizable, min_services, max_services, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const packageValues = [
        businessId,
        packageData.name,
        packageData.description || '',
        packageData.base_price,
        packageData.duration_minutes,
        packageData.category || 'General',
        packageData.is_customizable || false,
        packageData.min_services || 1,
        packageData.max_services || null,
        userId
      ];

      const packageResult = await client.query(createPackageQuery, packageValues);
      const newPackage = packageResult.rows[0];

      // Add services to package
      if (packageData.services && packageData.services.length > 0) {
        for (const serviceData of packageData.services) {
          const addServiceQuery = `
            INSERT INTO package_services
            (package_id, service_id, is_required, default_quantity, 
             max_quantity, package_price, is_price_overridden)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `;

          const serviceValues = [
            newPackage.id,
            serviceData.service_id,
            serviceData.is_required || false,
            serviceData.default_quantity || 1,
            serviceData.max_quantity || null,
            serviceData.package_price || null,
            serviceData.package_price !== undefined && serviceData.package_price !== null
          ];

          await client.query(addServiceQuery, serviceValues);
        }
      }

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'package.created',
        resourceType: 'package',
        resourceId: newPackage.id,
        newValues: newPackage
      });

      await client.query('COMMIT');

      log.info('Package created', {
        packageId: newPackage.id,
        businessId,
        userId,
        packageName: newPackage.name,
        serviceCount: packageData.services?.length || 0
      });

      // Return the complete package with services
      return await this.getPackageById(newPackage.id, businessId);

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Package creation failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getAllPackages(businessId, options = {}) {
    try {
      let selectQuery = `
        SELECT
          sp.id, sp.name, sp.description, sp.base_price, sp.duration_minutes,
          sp.category, sp.is_customizable, sp.min_services, sp.max_services,
          sp.is_active, sp.created_at, sp.updated_at,
          COUNT(ps.service_id) as service_count
        FROM service_packages sp
        LEFT JOIN package_services ps ON sp.id = ps.package_id
        WHERE sp.business_id = $1
      `;

      const values = [businessId];
      let paramCount = 2;

      // Filter by active status if provided
      if (options.activeOnly) {
        selectQuery += ` AND sp.is_active = $${paramCount}`;
        values.push(true);
        paramCount++;
      }

      // Filter by category if provided
      if (options.category) {
        selectQuery += ` AND sp.category = $${paramCount}`;
        values.push(options.category);
        paramCount++;
      }

      selectQuery += ` GROUP BY sp.id ORDER BY sp.name`;

      const result = await query(selectQuery, values);

      log.debug('Fetched packages', {
        businessId,
        count: result.rows.length,
        filters: options
      });

      return result.rows;
    } catch (error) {
      log.error('Failed to fetch packages', error);
      throw error;
    }
  },

  async getPackageById(id, businessId) {
    try {
      // Get package details
      const packageQuery = `
        SELECT
          sp.id, sp.name, sp.description, sp.base_price, sp.duration_minutes,
          sp.category, sp.is_customizable, sp.min_services, sp.max_services,
          sp.is_active, sp.created_at, sp.updated_at
        FROM service_packages sp
        WHERE sp.id = $1 AND sp.business_id = $2
      `;

      const packageResult = await query(packageQuery, [id, businessId]);
      const servicePackage = packageResult.rows[0] || null;

      if (!servicePackage) {
        log.debug('Package not found', { packageId: id, businessId });
        return null;
      }

      // Get package services
      const servicesQuery = `
        SELECT
          ps.*,
          s.name as service_name,
          s.description as service_description,
          s.base_price as service_base_price,
          s.duration_minutes as service_duration,
          s.category as service_category
        FROM package_services ps
        JOIN services s ON ps.service_id = s.id
        WHERE ps.package_id = $1
        ORDER BY s.name
      `;

      const servicesResult = await query(servicesQuery, [id]);
      servicePackage.services = servicesResult.rows;

      log.debug('Fetched package by ID', { packageId: id, businessId });

      return servicePackage;
    } catch (error) {
      log.error('Failed to fetch package by ID', error);
      throw error;
    }
  },

  async updatePackage(id, packageData, userId, businessId) {
    const client = await getClient();

    try {
      // First get the current values for audit logging
      const currentPackage = await this.getPackageById(id, businessId);
      if (!currentPackage) {
        throw new Error('Package not found');
      }

      await client.query('BEGIN');

      const updateFields = [];
      const values = [];
      let paramCount = 1;

      // Build dynamic update query
      if (packageData.name !== undefined) {
        updateFields.push(`name = $${paramCount}`);
        values.push(packageData.name);
        paramCount++;
      }

      if (packageData.description !== undefined) {
        updateFields.push(`description = $${paramCount}`);
        values.push(packageData.description);
        paramCount++;
      }

      if (packageData.base_price !== undefined) {
        updateFields.push(`base_price = $${paramCount}`);
        values.push(packageData.base_price);
        paramCount++;
      }

      if (packageData.duration_minutes !== undefined) {
        updateFields.push(`duration_minutes = $${paramCount}`);
        values.push(packageData.duration_minutes);
        paramCount++;
      }

      if (packageData.category !== undefined) {
        updateFields.push(`category = $${paramCount}`);
        values.push(packageData.category);
        paramCount++;
      }

      if (packageData.is_customizable !== undefined) {
        updateFields.push(`is_customizable = $${paramCount}`);
        values.push(packageData.is_customizable);
        paramCount++;
      }

      if (packageData.min_services !== undefined) {
        updateFields.push(`min_services = $${paramCount}`);
        values.push(packageData.min_services);
        paramCount++;
      }

      if (packageData.max_services !== undefined) {
        updateFields.push(`max_services = $${paramCount}`);
        values.push(packageData.max_services);
        paramCount++;
      }

      if (packageData.is_active !== undefined) {
        updateFields.push(`is_active = $${paramCount}`);
        values.push(packageData.is_active);
        paramCount++;
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      values.push(id, businessId);

      const updateQuery = `
        UPDATE service_packages
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount} AND business_id = $${paramCount + 1}
        RETURNING *
      `;

      const result = await client.query(updateQuery, values);
      const updatedPackage = result.rows[0];

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'package.updated',
        resourceType: 'package',
        resourceId: id,
        oldValues: currentPackage,
        newValues: updatedPackage
      });

      await client.query('COMMIT');

      log.info('Package updated', {
        packageId: id,
        businessId,
        userId
      });

      return await this.getPackageById(id, businessId);

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Package update failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async deletePackage(id, userId, businessId) {
    const client = await getClient();

    try {
      // First get the current values for audit logging
      const currentPackage = await this.getPackageById(id, businessId);
      if (!currentPackage) {
        throw new Error('Package not found');
      }

      await client.query('BEGIN');

      // Soft delete by setting is_active to false
      const deleteQuery = `
        UPDATE service_packages
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND business_id = $2
        RETURNING *
      `;

      const result = await client.query(deleteQuery, [id, businessId]);
      const deletedPackage = result.rows[0];

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'package.deleted',
        resourceType: 'package',
        resourceId: id,
        oldValues: currentPackage,
        newValues: deletedPackage
      });

      await client.query('COMMIT');

      log.info('Package deleted', {
        packageId: id,
        businessId,
        userId
      });

      return deletedPackage;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Package deletion failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getPackageCategories(businessId) {
    try {
      const categoriesQuery = `
        SELECT DISTINCT category
        FROM service_packages
        WHERE business_id = $1 AND is_active = true
        ORDER BY category
      `;

      const result = await query(categoriesQuery, [businessId]);

      const categories = result.rows.map(row => row.category);

      log.debug('Fetched package categories', {
        businessId,
        categories
      });

      return categories;
    } catch (error) {
      log.error('Failed to fetch package categories', error);
      throw error;
    }
  }
};
