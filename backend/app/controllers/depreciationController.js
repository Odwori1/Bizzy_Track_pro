import { DepreciationService } from '../services/depreciationService.js';
import { log } from '../utils/logger.js';

export const depreciationController = {
  async calculateDepreciation(req, res, next) {
    try {
      const depreciationData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      const depreciation = await DepreciationService.calculateDepreciation(businessId, depreciationData, userId);

      res.status(201).json({
        success: true,
        message: 'Depreciation calculated successfully',
        data: depreciation
      });

    } catch (error) {
      log.error('Depreciation calculation controller error', error);
      next(error);
    }
  },

  async getDepreciationByAssetId(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { assetId } = req.params;

      const depreciation = await DepreciationService.getDepreciationByAssetId(businessId, assetId);

      res.json({
        success: true,
        data: depreciation,
        count: depreciation.length,
        message: 'Asset depreciation history fetched successfully'
      });

    } catch (error) {
      log.error('Asset depreciation history fetch controller error', error);
      next(error);
    }
  },

  async getDepreciationSchedule(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { assetId } = req.params;

      const schedule = await DepreciationService.getDepreciationSchedule(businessId, assetId);

      res.json({
        success: true,
        data: schedule,
        count: schedule.length,
        message: 'Depreciation schedule fetched successfully'
      });

    } catch (error) {
      log.error('Depreciation schedule fetch controller error', error);
      next(error);
    }
  },

  async getBusinessDepreciationSummary(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { year } = req.query;

      const summary = await DepreciationService.getBusinessDepreciationSummary(businessId, year);

      res.json({
        success: true,
        data: summary,
        message: 'Business depreciation summary fetched successfully'
      });

    } catch (error) {
      log.error('Business depreciation summary fetch controller error', error);
      next(error);
    }
  },

  async getCurrentAssetValues(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const assetValues = await DepreciationService.getCurrentAssetValues(businessId);

      res.json({
        success: true,
        data: assetValues,
        count: assetValues.length,
        message: 'Current asset values fetched successfully'
      });

    } catch (error) {
      log.error('Current asset values fetch controller error', error);
      next(error);
    }
  }
};
