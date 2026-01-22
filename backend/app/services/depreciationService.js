import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

export class DepreciationService {
  /**
   * Post monthly depreciation for all eligible assets
   */
  static async postMonthlyDepreciation(businessId, month, year, userId) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      // Call the database function that posts depreciation
      const result = await client.query(
        'SELECT * FROM post_monthly_depreciation_date_fixed($1, $2, $3, $4)',
        [businessId, month, year, userId]
      );

      // Log the action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'depreciation.monthly_posted',
        resourceType: 'system',
        resourceId: null,
        newValues: {
          month,
          year,
          assets_processed: result.rows.length
        }
      });

      await client.query('COMMIT');

      return result.rows;

    } catch (error) {
      await client.query('ROLLBACK');
      
      // Handle already-posted months
      if (error.message.includes('already') || error.message.includes('duplicate')) {
        throw new Error(`Cannot post depreciation for ${month}/${year}. This period may already be posted.`);
      }

      log.error('Error posting monthly depreciation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Post historical depreciation for specific asset
   */
  static async postHistoricalDepreciation(businessId, assetId, month, year, userId) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      // Check if asset exists and belongs to business
      const assetCheck = await client.query(
        'SELECT id FROM assets WHERE business_id = $1 AND id = $2',
        [businessId, assetId]
      );

      if (assetCheck.rows.length === 0) {
        throw new Error('Asset not found or access denied');
      }

      // Check if depreciation already exists
      const existingDep = await client.query(
        'SELECT id FROM asset_depreciations WHERE asset_id = $1 AND period_month = $2 AND period_year = $3',
        [assetId, month, year]
      );

      if (existingDep.rows.length > 0) {
        throw new Error(`Depreciation for ${month}/${year} already exists`);
      }

      // Calculate depreciation for the period
      const calcResult = await client.query(
        'SELECT calculate_monthly_depreciation($1, $2, $3) as depreciation_amount',
        [assetId, month, year]
      );

      const depreciationAmount = parseFloat(calcResult.rows[0].depreciation_amount) || 0;

      if (depreciationAmount <= 0) {
        throw new Error(`No depreciation calculated for ${month}/${year}`);
      }

      // Create depreciation record
      const depResult = await client.query(
        `INSERT INTO asset_depreciations (
          business_id, asset_id, period_month, period_year,
          depreciation_amount, depreciation_date, calculated_at, posted_at,
          posted_by, status
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, NOW(), NOW(), $6, 'posted')
        RETURNING *`,
        [
          businessId,
          assetId,
          month,
          year,
          depreciationAmount,
          userId
        ]
      );

      // Update asset's accumulated depreciation
      await client.query(
        `UPDATE assets 
         SET accumulated_depreciation = accumulated_depreciation + $1,
             current_book_value = current_book_value - $1,
             updated_at = NOW()
         WHERE id = $2`,
        [depreciationAmount, assetId]
      );

      // Log the action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'depreciation.historical_posted',
        resourceType: 'asset',
        resourceId: assetId,
        newValues: {
          month,
          year,
          depreciation_amount: depreciationAmount
        }
      });

      await client.query('COMMIT');

      return depResult.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error posting historical depreciation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Override depreciation amount
   */
  static async overrideDepreciation(businessId, assetId, month, year, overrideAmount, reason, userId) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      // Check if depreciation exists
      const existingDep = await client.query(
        'SELECT id, depreciation_amount FROM asset_depreciations WHERE asset_id = $1 AND period_month = $2 AND period_year = $3',
        [assetId, month, year]
      );

      if (existingDep.rows.length === 0) {
        throw new Error(`No depreciation found for ${month}/${year}`);
      }

      const originalAmount = parseFloat(existingDep.rows[0].depreciation_amount);
      const difference = overrideAmount - originalAmount;

      // Update depreciation amount
      await client.query(
        `UPDATE asset_depreciations 
         SET depreciation_amount = $1,
             updated_at = NOW(),
             status = 'overridden'
         WHERE id = $2`,
        [overrideAmount, existingDep.rows[0].id]
      );

      // Create override record
      const overrideResult = await client.query(
        `INSERT INTO depreciation_overrides (
          business_id, asset_id, period_month, period_year,
          original_amount, new_amount, difference, reason, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          businessId,
          assetId,
          month,
          year,
          originalAmount,
          overrideAmount,
          difference,
          reason,
          userId
        ]
      );

      // Update asset's accumulated depreciation and book value
      if (difference !== 0) {
        await client.query(
          `UPDATE assets 
           SET accumulated_depreciation = accumulated_depreciation + $1,
               current_book_value = current_book_value - $1,
               updated_at = NOW()
           WHERE id = $2`,
          [difference, assetId]
        );
      }

      // Log the action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'depreciation.overridden',
        resourceType: 'asset',
        resourceId: assetId,
        oldValues: {
          original_amount: originalAmount
        },
        newValues: {
          new_amount: overrideAmount,
          difference: difference
        },
        metadata: {
          reason: reason,
          month: month,
          year: year
        }
      });

      await client.query('COMMIT');

      return {
        override: overrideResult.rows[0],
        original_amount: originalAmount,
        new_amount: overrideAmount,
        difference: difference
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error overriding depreciation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Bulk import assets from CSV/Excel
   */
  static async bulkImportAssets(businessId, assetsData, userId) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      const importedAssets = [];
      const errors = [];

      for (const [index, assetData] of assetsData.entries()) {
        try {
          // Validate required fields
          if (!assetData.asset_name || !assetData.category || !assetData.purchase_cost) {
            errors.push({
              row: index + 1,
              error: 'Missing required fields (asset_name, category, purchase_cost)',
              data: assetData
            });
            continue;
          }

          // Generate asset code if not provided
          if (!assetData.asset_code) {
            const businessResult = await client.query(
              'SELECT name FROM businesses WHERE id = $1',
              [businessId]
            );

            let prefix = 'AST';
            if (businessResult.rows.length > 0) {
              prefix = businessResult.rows[0].name.substring(0, 3).toUpperCase();
            }

            const sequenceResult = await client.query(
              `SELECT COALESCE(MAX(CAST(SUBSTRING(asset_code FROM '[0-9]+$') AS INTEGER)), 0) + 1 as next_sequence
               FROM assets
               WHERE business_id = $1 AND asset_code ~ ('^' || $2 || '-[0-9]+$')`,
              [businessId, prefix]
            );

            const nextSequence = sequenceResult.rows[0].next_sequence;
            assetData.asset_code = `${prefix}-${String(nextSequence).padStart(4, '0')}`;
          }

          // Insert asset
          const result = await client.query(
            `INSERT INTO assets (
              business_id, asset_code, asset_name, category, asset_type,
              purchase_date, purchase_cost, useful_life_months,
              depreciation_method, current_book_value, initial_book_value,
              status, condition_status, location, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id, asset_code, asset_name`,
            [
              businessId,
              assetData.asset_code,
              assetData.asset_name,
              assetData.category,
              assetData.asset_type || 'tangible',
              assetData.purchase_date || new Date().toISOString().split('T')[0],
              parseFloat(assetData.purchase_cost),
              parseInt(assetData.useful_life_months) || 60,
              assetData.depreciation_method || 'straight_line',
              parseFloat(assetData.purchase_cost),
              parseFloat(assetData.purchase_cost),
              assetData.status || 'active',
              assetData.condition_status || 'excellent',
              assetData.location || null,
              userId
            ]
          );

          importedAssets.push(result.rows[0]);

        } catch (error) {
          errors.push({
            row: index + 1,
            error: error.message,
            data: assetData
          });
        }
      }

      // Log bulk import action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'assets.bulk_imported',
        resourceType: 'system',
        resourceId: null,
        newValues: {
          total_attempted: assetsData.length,
          successful: importedAssets.length,
          failed: errors.length
        }
      });

      await client.query('COMMIT');

      return {
        imported: importedAssets,
        errors: errors,
        summary: {
          total: assetsData.length,
          successful: importedAssets.length,
          failed: errors.length
        }
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error in bulk import:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Export depreciation data
   */
  static async exportDepreciation(businessId, format = 'json', filters = {}) {
    const client = await getClient();
    
    try {
      let query = `
        SELECT 
          a.asset_code,
          a.asset_name,
          a.category,
          a.purchase_date,
          a.purchase_cost,
          a.current_book_value,
          a.accumulated_depreciation,
          ad.period_month,
          ad.period_year,
          ad.depreciation_amount,
          ad.depreciation_date,
          ad.posted_at,
          u.email as posted_by_email
        FROM assets a
        LEFT JOIN asset_depreciations ad ON a.id = ad.asset_id
        LEFT JOIN users u ON a.created_by = u.id
        WHERE a.business_id = $1
      `;

      const params = [businessId];
      let paramCount = 1;

      if (filters.start_date) {
        paramCount++;
        query += ` AND ad.depreciation_date >= $${paramCount}`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        paramCount++;
        query += ` AND ad.depreciation_date <= $${paramCount}`;
        params.push(filters.end_date);
      }

      if (filters.asset_id) {
        paramCount++;
        query += ` AND a.id = $${paramCount}`;
        params.push(filters.asset_id);
      }

      query += ' ORDER BY a.asset_code, ad.period_year DESC, ad.period_month DESC';

      const result = await client.query(query, params);

      if (format === 'csv') {
        return this.convertToCSV(result.rows);
      }

      return result.rows;

    } catch (error) {
      log.error('Error exporting depreciation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Convert data to CSV format
   */
  static convertToCSV(data) {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => 
      Object.values(row).map(val => {
        if (val === null || val === undefined) return '';
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
        return String(val);
      }).join(',')
    );

    return [headers, ...rows].join('\n');
  }

  /**
   * Get override history for an asset
   */
  static async getOverrideHistory(businessId, assetId) {
    const client = await getClient();
    
    try {
      const result = await client.query(
        `SELECT 
          dof.*,
          a.asset_code,
          a.asset_name,
          u.email as created_by_email,
          u2.email as approved_by_email
         FROM depreciation_overrides dof
         JOIN assets a ON a.id = dof.asset_id
         LEFT JOIN users u ON u.id = dof.created_by
         LEFT JOIN users u2 ON u2.id = dof.approved_by
         WHERE dof.business_id = $1 AND dof.asset_id = $2
         ORDER BY dof.created_at DESC`,
        [businessId, assetId]
      );

      return result.rows;

    } catch (error) {
      log.error('Error getting override history:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
