import { DepreciationService } from '../services/depreciationService.js';
import { AssetService } from '../services/assetService.js';
import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { validateRequest } from '../middleware/validation.js';

export const depreciationAdvancedController = {
  /**
   * Bulk post depreciation for multiple months
   */
  async bulkPostDepreciation(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { periods } = req.body;

      if (!periods || !Array.isArray(periods) || periods.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Periods array is required with month and year'
        });
      }

      // Validate each period
      const validatedPeriods = [];
      for (const period of periods) {
        const { month, year } = period;
        
        if (!month || month < 1 || month > 12) {
          return res.status(400).json({
            success: false,
            message: `Invalid month: ${month}. Must be between 1-12`
          });
        }

        if (!year || year < 2000 || year > 2100) {
          return res.status(400).json({
            success: false,
            message: `Invalid year: ${year}`
          });
        }

        validatedPeriods.push({ month, year });
      }

      const results = [];
      let totalAssets = 0;
      let totalDepreciation = 0;

      for (const period of validatedPeriods) {
        const { month, year } = period;
        
        try {
          const periodResults = await DepreciationService.postMonthlyDepreciation(
            businessId, month, year, userId
          );
          
          const periodDepreciation = periodResults.reduce(
            (sum, item) => sum + parseFloat(item.depreciation_amount || 0), 
            0
          );
          
          results.push({
            period: `${month}/${year}`,
            success: true,
            assets_processed: periodResults.length,
            total_depreciation: periodDepreciation,
            details: periodResults
          });

          totalAssets += periodResults.length;
          totalDepreciation += periodDepreciation;

        } catch (error) {
          results.push({
            period: `${month}/${year}`,
            success: false,
            message: error.message,
            error: error.stack
          });
        }
      }

      res.json({
        success: true,
        data: {
          periods: results,
          summary: {
            total_periods: validatedPeriods.length,
            successful_periods: results.filter(r => r.success).length,
            failed_periods: results.filter(r => !r.success).length,
            total_assets_processed: totalAssets,
            total_depreciation: totalDepreciation
          }
        },
        message: 'Bulk depreciation processing completed'
      });

    } catch (error) {
      log.error('Bulk depreciation error:', error);
      next(error);
    }
  },

  /**
   * Post historical depreciation for specific period
   */
  async postHistoricalDepreciation(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { asset_id, month, year } = req.body;

      if (!asset_id || !month || !year) {
        return res.status(400).json({
          success: false,
          message: 'Asset ID, month, and year are required'
        });
      }

      if (month < 1 || month > 12) {
        return res.status(400).json({
          success: false,
          message: 'Month must be between 1-12'
        });
      }

      const result = await DepreciationService.postHistoricalDepreciation(
        businessId, asset_id, month, year, userId
      );

      res.json({
        success: true,
        data: result,
        message: 'Historical depreciation posted successfully'
      });

    } catch (error) {
      log.error('Historical depreciation error:', error);
      
      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  },

  /**
   * Override depreciation by asset code
   */
  async overrideDepreciation(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { asset_code } = req.params;
      const { month, year, override_amount, reason } = req.body;

      if (!month || !year || !override_amount || !reason) {
        return res.status(400).json({
          success: false,
          message: 'Month, year, override_amount, and reason are required'
        });
      }

      // Get asset ID from code
      const client = await getClient();
      const assetResult = await client.query(
        'SELECT id FROM assets WHERE business_id = $1 AND asset_code = $2',
        [businessId, asset_code]
      );
      client.release();

      if (assetResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: `Asset with code ${asset_code} not found`
        });
      }

      const assetId = assetResult.rows[0].id;

      const result = await DepreciationService.overrideDepreciation(
        businessId, assetId, month, year, override_amount, reason, userId
      );

      res.json({
        success: true,
        data: result,
        message: 'Depreciation override applied successfully'
      });

    } catch (error) {
      log.error('Depreciation override error:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      if (error.message.includes('No depreciation found')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  },

  /**
   * Get override history
   */
  async getOverrideHistory(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { asset_id } = req.params;

      if (!asset_id) {
        return res.status(400).json({
          success: false,
          message: 'Asset ID is required'
        });
      }

      const history = await DepreciationService.getOverrideHistory(businessId, asset_id);

      res.json({
        success: true,
        data: history,
        count: history.length,
        message: 'Override history fetched successfully'
      });

    } catch (error) {
      log.error('Get override history error:', error);
      next(error);
    }
  },

  /**
   * Bulk import assets from file
   */
  async bulkImportAssets(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const assetsData = req.body;

      if (!assetsData || !Array.isArray(assetsData)) {
        return res.status(400).json({
          success: false,
          message: 'Assets data array is required'
        });
      }

      const result = await DepreciationService.bulkImportAssets(businessId, assetsData, userId);

      res.json({
        success: true,
        data: result,
        message: `Bulk import completed. Successful: ${result.summary.successful}, Failed: ${result.summary.failed}`
      });

    } catch (error) {
      log.error('Bulk import error:', error);
      next(error);
    }
  },

  /**
   * Export assets with depreciation data
   */
  async exportAssets(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { format = 'json' } = req.params;
      const filters = req.query;

      const data = await DepreciationService.exportDepreciation(businessId, format, filters);

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=depreciation_export.csv');
        return res.send(data);
      }

      res.json({
        success: true,
        data: data,
        count: data.length,
        message: 'Assets exported successfully'
      });

    } catch (error) {
      log.error('Export assets error:', error);
      next(error);
    }
  }
};
