import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class DepreciationService {
  /**
   * Calculate and record depreciation for an asset
   */
  static async calculateDepreciation(businessId, depreciationData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // First, verify the asset exists and belongs to the business
      const assetResult = await client.query(
        `SELECT * FROM fixed_assets 
         WHERE id = $1 AND business_id = $2`,
        [depreciationData.asset_id, businessId]
      );

      if (!assetResult.rows[0]) {
        throw new Error('Asset not found');
      }

      const asset = assetResult.rows[0];

      // Calculate depreciation using the PostgreSQL function
      const depreciationResult = await client.query(
        `SELECT calculate_asset_current_value($1, $2) as current_value`,
        [depreciationData.asset_id, depreciationData.period_date]
      );

      const currentValue = parseFloat(depreciationResult.rows[0].current_value);
      const depreciationAmount = asset.current_value - currentValue;

      // Record the depreciation entry with ALL required columns
      const result = await client.query(
        `INSERT INTO asset_depreciation (
          business_id, asset_id, period_date, period_type,
          beginning_value, depreciation_amount, ending_value,
          accumulated_depreciation, remaining_value,
          depreciation_method, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          businessId,
          depreciationData.asset_id,
          depreciationData.period_date,
          'monthly',
          parseFloat(asset.current_value),
          depreciationAmount,
          currentValue,
          depreciationAmount, // accumulated_depreciation
          currentValue,       // remaining_value
          asset.depreciation_method || 'straight_line',
          userId
        ]
      );

      const depreciation = result.rows[0];

      // Update the asset's current value
      await client.query(
        `UPDATE fixed_assets 
         SET current_value = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND business_id = $3`,
        [currentValue, depreciationData.asset_id, businessId]
      );

      // Log the depreciation calculation
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'depreciation.calculated',
        resourceType: 'depreciation',
        resourceId: depreciation.id,
        newValues: {
          asset_id: depreciation.asset_id,
          period_date: depreciation.period_date,
          beginning_value: depreciation.beginning_value,
          depreciation_amount: depreciation.depreciation_amount,
          ending_value: depreciation.ending_value
        }
      });

      log.info('Depreciation calculated', {
        businessId,
        userId,
        depreciationId: depreciation.id,
        assetId: depreciation.asset_id,
        depreciationAmount: depreciation.depreciation_amount
      });

      await client.query('COMMIT');
      return depreciation;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ... (keep the rest of the methods the same)
  /**
   * Get depreciation history for a specific asset
   */
  static async getDepreciationByAssetId(businessId, assetId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT ad.*, fa.asset_name, fa.asset_code
         FROM asset_depreciation ad
         LEFT JOIN fixed_assets fa ON ad.asset_id = fa.id
         WHERE ad.business_id = $1 AND ad.asset_id = $2
         ORDER BY ad.period_date DESC`,
        [businessId, assetId]
      );
      return result.rows;
    } catch (error) {
      log.error('Error fetching asset depreciation history:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get full depreciation schedule for an asset
   */
  static async getDepreciationSchedule(businessId, assetId) {
    const client = await getClient();
    try {
      // First get asset details
      const assetResult = await client.query(
        `SELECT * FROM fixed_assets 
         WHERE id = $1 AND business_id = $2`,
        [assetId, businessId]
      );

      if (!assetResult.rows[0]) {
        throw new Error('Asset not found');
      }

      const asset = assetResult.rows[0];
      const schedule = [];
      const purchaseDate = new Date(asset.purchase_date);
      const usefulLifeYears = asset.useful_life_years || 5;
      
      let currentValue = parseFloat(asset.purchase_price);
      const salvageValue = parseFloat(asset.salvage_value) || 0;

      // Generate schedule for each year of useful life
      for (let year = 1; year <= usefulLifeYears; year++) {
        const periodDate = new Date(purchaseDate);
        periodDate.setFullYear(purchaseDate.getFullYear() + year);

        // Calculate annual depreciation
        let annualDepreciation;
        if (asset.depreciation_method === 'reducing_balance') {
          const depreciationRate = asset.depreciation_rate || 20; // Default 20%
          annualDepreciation = currentValue * (depreciationRate / 100);
        } else {
          // Straight-line method (default)
          annualDepreciation = (parseFloat(asset.purchase_price) - salvageValue) / usefulLifeYears;
        }

        // Ensure depreciation doesn't go below salvage value
        if (currentValue - annualDepreciation < salvageValue) {
          annualDepreciation = currentValue - salvageValue;
        }

        const endingValue = currentValue - annualDepreciation;

        schedule.push({
          year: year,
          period_date: periodDate.toISOString().split('T')[0],
          beginning_value: parseFloat(currentValue.toFixed(2)),
          depreciation_amount: parseFloat(annualDepreciation.toFixed(2)),
          ending_value: parseFloat(endingValue.toFixed(2)),
          depreciation_method: asset.depreciation_method
        });

        currentValue = endingValue;

        // Stop if we've reached salvage value
        if (currentValue <= salvageValue) {
          break;
        }
      }

      return schedule;
    } catch (error) {
      log.error('Error generating depreciation schedule:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get business-wide depreciation summary
   */
  static async getBusinessDepreciationSummary(businessId, year = null) {
    const client = await getClient();
    try {
      let queryStr = `
        SELECT 
          EXTRACT(YEAR FROM period_date) as year,
          COUNT(*) as total_depreciations,
          SUM(depreciation_amount) as total_depreciation,
          AVG(depreciation_amount) as avg_depreciation,
          COUNT(DISTINCT asset_id) as assets_depreciated
        FROM asset_depreciation
        WHERE business_id = $1
      `;
      const params = [businessId];

      if (year) {
        queryStr += ` AND EXTRACT(YEAR FROM period_date) = $2`;
        params.push(year);
      }

      queryStr += `
        GROUP BY EXTRACT(YEAR FROM period_date)
        ORDER BY year DESC
      `;

      const result = await client.query(queryStr, params);

      // Get current year summary if no specific year requested
      if (!year && result.rows.length > 0) {
        const currentYear = new Date().getFullYear();
        const currentYearSummary = result.rows.find(row => parseInt(row.year) === currentYear);
        
        return {
          yearly_breakdown: result.rows,
          current_year_summary: currentYearSummary || null
        };
      }

      return result.rows[0] || null;
    } catch (error) {
      log.error('Error fetching business depreciation summary:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get current values for all assets
   */
  static async getCurrentAssetValues(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT 
           fa.id,
           fa.asset_code,
           fa.asset_name,
           fa.category,
           fa.purchase_date,
           fa.purchase_price,
           fa.current_value,
           fa.depreciation_method,
           fa.useful_life_years,
           fa.salvage_value,
           (fa.purchase_price - fa.current_value) as total_depreciation_to_date,
           (fa.purchase_price - fa.salvage_value) as total_depreciable_amount,
           CASE 
             WHEN fa.salvage_value > 0 THEN 
               ((fa.purchase_price - fa.current_value) / (fa.purchase_price - fa.salvage_value)) * 100
             ELSE 
               ((fa.purchase_price - fa.current_value) / fa.purchase_price) * 100
           END as depreciation_percentage
         FROM fixed_assets fa
         WHERE fa.business_id = $1 AND fa.is_active = true
         ORDER BY fa.purchase_date DESC`,
        [businessId]
      );
      return result.rows;
    } catch (error) {
      log.error('Error fetching current asset values:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
