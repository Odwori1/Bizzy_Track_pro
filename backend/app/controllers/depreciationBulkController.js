import { DepreciationService } from '../services/depreciationService.js';
import { log } from '../utils/logger.js';

export const depreciationBulkController = {
  /**
   * Bulk post depreciation for specific month/year
   */
  async bulkPostDepreciation(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { month, year, asset_ids } = req.body;

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: 'Month and year are required'
        });
      }

      if (month < 1 || month > 12) {
        return res.status(400).json({
          success: false,
          message: 'Month must be between 1-12'
        });
      }

      const client = await getClient();
      const results = [];

      try {
        await client.query('BEGIN');

        // If specific asset_ids are provided, process only those
        if (asset_ids && Array.isArray(asset_ids)) {
          for (const assetId of asset_ids) {
            try {
              const result = await DepreciationService.postHistoricalDepreciation(
                businessId, assetId, month, year, userId
              );
              results.push({
                asset_id: assetId,
                success: true,
                data: result
              });
            } catch (error) {
              results.push({
                asset_id: assetId,
                success: false,
                message: error.message
              });
            }
          }
        } else {
          // Process all eligible assets
          const allResults = await DepreciationService.postMonthlyDepreciation(
            businessId, month, year, userId
          );
          
          results.push(...allResults.map(item => ({
            asset_id: item.asset_id,
            success: true,
            data: item
          })));
        }

        await client.query('COMMIT');

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        res.json({
          success: true,
          data: {
            results: results,
            summary: {
              total: results.length,
              successful: successful,
              failed: failed,
              period: `${month}/${year}`
            }
          },
          message: `Bulk depreciation posted for ${successful} assets, ${failed} failed`
        });

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      log.error('Bulk post depreciation error:', error);
      
      if (error.message.includes('already posted')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      next(error);
    }
  },

  /**
   * Bulk import assets (simplified version)
   */
  async bulkImportAssets(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { assets } = req.body;

      if (!assets || !Array.isArray(assets)) {
        return res.status(400).json({
          success: false,
          message: 'Assets array is required'
        });
      }

      if (assets.length > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Maximum 1000 assets can be imported at once'
        });
      }

      const result = await DepreciationService.bulkImportAssets(businessId, assets, userId);

      res.json({
        success: true,
        data: result,
        message: `Bulk import completed. ${result.summary.successful} successful, ${result.summary.failed} failed`
      });

    } catch (error) {
      log.error('Bulk import assets error:', error);
      next(error);
    }
  },

  /**
   * Export depreciation data with custom filters
   */
  async exportDepreciation(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { 
        format = 'json',
        start_date,
        end_date,
        asset_id,
        department_id,
        category
      } = req.query;

      const filters = {
        start_date,
        end_date,
        asset_id,
        department_id,
        category
      };

      const data = await DepreciationService.exportDepreciation(businessId, format, filters);

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=depreciation_report.csv');
        return res.send(data);
      }

      res.json({
        success: true,
        data: data,
        count: data.length,
        message: 'Depreciation data exported successfully'
      });

    } catch (error) {
      log.error('Export depreciation error:', error);
      next(error);
    }
  }
};
