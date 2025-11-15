import { BusinessValuationService } from '../services/businessValuationService.js';
import { log } from '../utils/logger.js';

export const businessValuationController = {
  async getValuation(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { as_of_date } = req.query;

      log.info('Fetching business valuation', { businessId, as_of_date });

      const valuation = await BusinessValuationService.getBusinessValuation(
        businessId, 
        as_of_date ? new Date(as_of_date) : new Date()
      );

      // Check if there's a warning from partial failure
      if (valuation.warning) {
        res.json({
          success: true,
          data: valuation,
          message: 'Business valuation fetched with partial data',
          warning: valuation.warning
        });
      } else {
        res.json({
          success: true,
          data: valuation,
          message: 'Business valuation fetched successfully'
        });
      }

    } catch (error) {
      log.error('Business valuation fetch controller error', error);
      
      // Provide fallback response even if everything fails
      res.status(500).json({
        success: false,
        error: 'Failed to calculate business valuation',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        fallback: {
          total_business_value: 0,
          breakdown: {
            liquid_assets: 0,
            fixed_assets: 0,
            equipment_assets: 0,
            accounts_receivable: 0
          }
        }
      });
    }
  }
};
