import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class MaintenanceService {
  /**
   * Create a new maintenance record
   */
  static async createMaintenance(businessId, maintenanceData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO asset_maintenance (
          business_id, asset_id, maintenance_type, maintenance_date,
          description, cost, technician, next_maintenance_date,
          status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          businessId,
          maintenanceData.asset_id,
          maintenanceData.maintenance_type,
          maintenanceData.maintenance_date,
          maintenanceData.description || '',
          maintenanceData.cost || 0,
          maintenanceData.technician || '',
          maintenanceData.next_maintenance_date,
          maintenanceData.status || 'scheduled',
          userId
        ]
      );

      const maintenance = result.rows[0];

      // Update asset's next maintenance date if provided
      if (maintenanceData.next_maintenance_date) {
        await client.query(
          `UPDATE fixed_assets 
           SET next_maintenance_date = $1 
           WHERE id = $2 AND business_id = $3`,
          [maintenanceData.next_maintenance_date, maintenanceData.asset_id, businessId]
        );
      }

      // Log the maintenance creation
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'maintenance.created',
        resourceType: 'maintenance',
        resourceId: maintenance.id,
        newValues: {
          asset_id: maintenance.asset_id,
          maintenance_type: maintenance.maintenance_type,
          maintenance_date: maintenance.maintenance_date,
          cost: maintenance.cost
        }
      });

      log.info('Maintenance record created', {
        businessId,
        userId,
        maintenanceId: maintenance.id,
        assetId: maintenance.asset_id
      });

      await client.query('COMMIT');
      return maintenance;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all maintenance records for a business
   */
  static async getAllMaintenance(businessId, filters = {}) {
    const client = await getClient();
    try {
      let queryStr = `
        SELECT am.*, fa.asset_name, fa.asset_code
        FROM asset_maintenance am
        LEFT JOIN fixed_assets fa ON am.asset_id = fa.id
        WHERE am.business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (filters.asset_id) {
        paramCount++;
        queryStr += ` AND am.asset_id = $${paramCount}`;
        params.push(filters.asset_id);
      }

      if (filters.maintenance_type) {
        paramCount++;
        queryStr += ` AND am.maintenance_type = $${paramCount}`;
        params.push(filters.maintenance_type);
      }

      if (filters.status) {
        paramCount++;
        queryStr += ` AND am.status = $${paramCount}`;
        params.push(filters.status);
      }

      queryStr += ' ORDER BY am.maintenance_date DESC';

      const result = await client.query(queryStr, params);
      return result.rows;
    } catch (error) {
      log.error('Error fetching maintenance records:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get maintenance history for a specific asset
   */
  static async getMaintenanceByAssetId(businessId, assetId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT am.*, fa.asset_name, fa.asset_code
         FROM asset_maintenance am
         LEFT JOIN fixed_assets fa ON am.asset_id = fa.id
         WHERE am.business_id = $1 AND am.asset_id = $2
         ORDER BY am.maintenance_date DESC`,
        [businessId, assetId]
      );
      return result.rows;
    } catch (error) {
      log.error('Error fetching asset maintenance history:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get upcoming maintenance (due in next X days)
   */
  static async getUpcomingMaintenance(businessId, days = 30) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT am.*, fa.asset_name, fa.asset_code, fa.next_maintenance_date
         FROM asset_maintenance am
         LEFT JOIN fixed_assets fa ON am.asset_id = fa.id
         WHERE am.business_id = $1 
           AND (
             am.maintenance_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $2 * INTERVAL '1 day'
             OR fa.next_maintenance_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $2 * INTERVAL '1 day'
           )
         ORDER BY am.maintenance_date ASC`,
        [businessId, days]
      );
      return result.rows;
    } catch (error) {
      log.error('Error fetching upcoming maintenance:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get maintenance record by ID
   */
  static async getMaintenanceById(businessId, maintenanceId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT am.*, fa.asset_name, fa.asset_code
         FROM asset_maintenance am
         LEFT JOIN fixed_assets fa ON am.asset_id = fa.id
         WHERE am.id = $1 AND am.business_id = $2`,
        [maintenanceId, businessId]
      );
      return result.rows[0];
    } catch (error) {
      log.error('Error fetching maintenance by ID:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update maintenance record
   */
  static async updateMaintenance(businessId, maintenanceId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const existingMaintenance = await client.query(
        'SELECT * FROM asset_maintenance WHERE id = $1 AND business_id = $2',
        [maintenanceId, businessId]
      );

      if (!existingMaintenance.rows[0]) {
        throw new Error('Maintenance record not found');
      }

      const result = await client.query(
        `UPDATE asset_maintenance
         SET maintenance_type = COALESCE($1, maintenance_type),
             maintenance_date = COALESCE($2, maintenance_date),
             description = COALESCE($3, description),
             cost = COALESCE($4, cost),
             technician = COALESCE($5, technician),
             next_maintenance_date = COALESCE($6, next_maintenance_date),
             status = COALESCE($7, status),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $8 AND business_id = $9
         RETURNING *`,
        [
          updateData.maintenance_type,
          updateData.maintenance_date,
          updateData.description,
          updateData.cost,
          updateData.technician,
          updateData.next_maintenance_date,
          updateData.status,
          maintenanceId,
          businessId
        ]
      );

      const updatedMaintenance = result.rows[0];

      // Update asset's next maintenance date if changed
      if (updateData.next_maintenance_date) {
        await client.query(
          `UPDATE fixed_assets 
           SET next_maintenance_date = $1 
           WHERE id = $2 AND business_id = $3`,
          [updateData.next_maintenance_date, updatedMaintenance.asset_id, businessId]
        );
      }

      // Log the maintenance update
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'maintenance.updated',
        resourceType: 'maintenance',
        resourceId: maintenanceId,
        newValues: updateData
      });

      log.info('Maintenance record updated', {
        businessId,
        userId,
        maintenanceId,
        assetId: updatedMaintenance.asset_id
      });

      await client.query('COMMIT');
      return updatedMaintenance;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete maintenance record
   */
  static async deleteMaintenance(businessId, maintenanceId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const existingMaintenance = await client.query(
        'SELECT * FROM asset_maintenance WHERE id = $1 AND business_id = $2',
        [maintenanceId, businessId]
      );

      if (!existingMaintenance.rows[0]) {
        throw new Error('Maintenance record not found');
      }

      await client.query(
        'DELETE FROM asset_maintenance WHERE id = $1 AND business_id = $2',
        [maintenanceId, businessId]
      );

      // Log the maintenance deletion
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'maintenance.deleted',
        resourceType: 'maintenance',
        resourceId: maintenanceId,
        oldValues: {
          asset_id: existingMaintenance.rows[0].asset_id,
          maintenance_type: existingMaintenance.rows[0].maintenance_type
        }
      });

      log.info('Maintenance record deleted', {
        businessId,
        userId,
        maintenanceId
      });

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
