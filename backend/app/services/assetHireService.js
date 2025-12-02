import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class AssetHireService {
  /**
   * Mark a fixed asset as hireable (creates equipment_assets record)
   */
  static async markAssetAsHireable(businessId, assetId, hireData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Verify the asset exists and is of type 'equipment'
      const assetCheck = await client.query(
        `SELECT * FROM fixed_assets 
         WHERE id = $1 AND business_id = $2 AND category = 'equipment'`,
        [assetId, businessId]
      );

      if (assetCheck.rows.length === 0) {
        throw new Error('Asset not found or not of type equipment');
      }

      const asset = assetCheck.rows[0];

      // 2. Check if already marked as hireable
      const existingHireable = await client.query(
        `SELECT * FROM equipment_assets 
         WHERE asset_id = $1 AND business_id = $2`,
        [assetId, businessId]
      );

      if (existingHireable.rows.length > 0) {
        throw new Error('Asset is already marked as hireable');
      }

      // 3. Create equipment_assets record
      const result = await client.query(
        `INSERT INTO equipment_assets (
          business_id, asset_id, hire_rate_per_day, deposit_amount,
          minimum_hire_period, current_location, condition_notes,
          is_available, is_hireable, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          businessId,
          assetId,
          hireData.hire_rate_per_day,
          hireData.deposit_amount || 0,
          hireData.minimum_hire_period || 1,
          hireData.current_location || asset.location || '',
          hireData.condition_notes || '',
          true, // is_available
          true, // is_hireable
          userId
        ]
      );

      const equipmentAsset = result.rows[0];

      // 4. Log the action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'asset.marked_hireable',
        resourceType: 'asset',
        resourceId: assetId,
        newValues: {
          hire_rate_per_day: hireData.hire_rate_per_day,
          deposit_amount: hireData.deposit_amount,
          is_hireable: true
        }
      });

      log.info('Asset marked as hireable', {
        businessId,
        userId,
        assetId,
        assetName: asset.asset_name
      });

      await client.query('COMMIT');
      return equipmentAsset;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get assets that can be marked as hireable (equipment type, not already hireable)
   */
  static async getHireableAssets(businessId) {
    const client = await getClient();
    
    try {
      const result = await client.query(
        `SELECT fa.* 
         FROM fixed_assets fa
         LEFT JOIN equipment_assets ea ON fa.id = ea.asset_id
         WHERE fa.business_id = $1 
           AND fa.category = 'equipment'
           AND fa.is_active = true
           AND ea.id IS NULL -- Not already hireable
         ORDER BY fa.asset_name`,
        [businessId]
      );

      return result.rows;
    } catch (error) {
      log.error('Error fetching hireable assets:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get assets that are already marked as hireable
   */
  static async getHireableAssetsWithDetails(businessId) {
    const client = await getClient();
    
    try {
      const result = await client.query(
        `SELECT 
           fa.*,
           ea.hire_rate_per_day,
           ea.deposit_amount,
           ea.minimum_hire_period,
           ea.current_location,
           ea.is_available,
           ea.is_hireable,
           ea.created_at as marked_hireable_at
         FROM fixed_assets fa
         INNER JOIN equipment_assets ea ON fa.id = ea.asset_id
         WHERE fa.business_id = $1 
           AND ea.is_hireable = true
         ORDER BY fa.asset_name`,
        [businessId]
      );

      return result.rows;
    } catch (error) {
      log.error('Error fetching hireable assets with details:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get hire details for a specific asset
   */
  static async getAssetHireDetails(businessId, assetId) {
    const client = await getClient();
    
    try {
      const result = await client.query(
        `SELECT 
           fa.*,
           ea.hire_rate_per_day,
           ea.deposit_amount,
           ea.minimum_hire_period,
           ea.current_location,
           ea.is_available,
           ea.is_hireable,
           ea.condition_notes,
           ea.specifications,
           ea.photos,
           COUNT(ehb.id) as active_bookings_count
         FROM fixed_assets fa
         LEFT JOIN equipment_assets ea ON fa.id = ea.asset_id
         LEFT JOIN equipment_hire_bookings ehb ON ea.id = ehb.equipment_asset_id 
           AND ehb.status IN ('reserved', 'active')
         WHERE fa.business_id = $1 
           AND fa.id = $2
         GROUP BY fa.id, ea.id`,
        [businessId, assetId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      log.error('Error fetching asset hire details:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
