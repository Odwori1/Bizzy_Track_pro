import { AssetService } from '../services/assetService.js';
import { log } from '../utils/logger.js';

export const assetController = {
  async create(req, res, next) {
    try {
      const assetData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating fixed asset', { businessId, userId, assetName: assetData.asset_name });

      const newAsset = await AssetService.createFixedAsset(businessId, assetData, userId);

      res.status(201).json({
        success: true,
        message: 'Fixed asset created successfully',
        data: newAsset
      });

    } catch (error) {
      log.error('Fixed asset creation controller error', error);
      next(error);
    }
  },

  // NEW: Register existing asset
  async registerExistingAsset(req, res, next) {
    try {
      const assetData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Registering existing asset', { businessId, userId, assetName: assetData.asset_name });

      const newAsset = await AssetService.registerExistingAsset(businessId, assetData, userId);

      res.status(201).json({
        success: true,
        message: 'Existing asset registered successfully',
        data: newAsset
      });

    } catch (error) {
      log.error('Existing asset registration controller error', error);
      next(error);
    }
  },

  async getAll(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { category, condition_status, is_active } = req.query;

      const filters = {};
      if (category) filters.category = category;
      if (condition_status) filters.condition_status = condition_status;
      if (is_active !== undefined) filters.is_active = is_active === 'true';

      const assets = await AssetService.getFixedAssets(businessId, filters);

      res.json({
        success: true,
        data: assets,
        count: assets.length,
        message: 'Fixed assets fetched successfully'
      });

    } catch (error) {
      log.error('Fixed assets fetch controller error', error);
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      const asset = await AssetService.getAssetById(businessId, id);

      if (!asset) {
        return res.status(404).json({
          success: false,
          message: 'Asset not found'
        });
      }

      res.json({
        success: true,
        data: asset,
        message: 'Asset fetched successfully'
      });

    } catch (error) {
      log.error('Asset fetch by ID controller error', error);
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      const updatedAsset = await AssetService.updateAsset(businessId, id, updateData, userId);

      res.json({
        success: true,
        message: 'Asset updated successfully',
        data: updatedAsset
      });

    } catch (error) {
      log.error('Asset update controller error', error);
      next(error);
    }
  },

  async getStatistics(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const statistics = await AssetService.getAssetStatistics(businessId);

      res.json({
        success: true,
        data: statistics,
        message: 'Asset statistics fetched successfully'
      });

    } catch (error) {
      log.error('Asset statistics fetch controller error', error);
      next(error);
    }
  },

  // NEW: Asset register report
  async getAssetRegister(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { category, is_active } = req.query;

      const filters = {};
      if (category) filters.category = category;
      if (is_active !== undefined) filters.is_active = is_active === 'true';

      const assetRegister = await AssetService.getAssetRegister(businessId, filters);

      res.json({
        success: true,
        data: assetRegister,
        count: assetRegister.length,
        message: 'Asset register fetched successfully'
      });

    } catch (error) {
      log.error('Asset register fetch error', error);
      next(error);
    }
  },

  // NEW: Get enhanced asset register
  async getEnhancedAssetRegister(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { acquisition_method, is_existing_asset, category } = req.query;

      const filters = {};
      if (acquisition_method) filters.acquisition_method = acquisition_method;
      if (is_existing_asset !== undefined) filters.is_existing_asset = is_existing_asset === 'true';
      if (category) filters.category = category;

      const assetRegister = await AssetService.getEnhancedAssetRegister(businessId, filters);

      res.json({
        success: true,
        data: assetRegister,
        count: assetRegister.length,
        message: 'Enhanced asset register fetched successfully'
      });

    } catch (error) {
      log.error('Enhanced asset register fetch error', error);
      next(error);
    }
  },

  // NEW: Depreciation schedule
  async getDepreciationSchedule(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { year, asset_id } = req.query;

      const filters = {};
      if (year) filters.year = parseInt(year);
      if (asset_id) filters.asset_id = asset_id;

      const schedule = await AssetService.getDepreciationSchedule(businessId, filters);

      res.json({
        success: true,
        data: schedule,
        count: schedule.length,
        message: 'Depreciation schedule fetched successfully'
      });

    } catch (error) {
      log.error('Depreciation schedule fetch error', error);
      next(error);
    }
  },

  // NEW: Post monthly depreciation
  async postMonthlyDepreciation(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { month, year } = req.body;

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: 'Month and year are required'
        });
      }

      const results = await AssetService.postMonthlyDepreciation(businessId, month, year, userId);

      res.json({
        success: true,
        data: results,
        count: results.length,
        message: 'Monthly depreciation posted successfully'
      });

    } catch (error) {
      log.error('Monthly depreciation posting error', error);
      next(error);
    }
  },

  // NEW: Calculate depreciation for specific asset
  async calculateDepreciation(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const assetId = req.params.id;
      const { month, year } = req.body;

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: 'Month and year are required'
        });
      }

      const depreciationAmount = await AssetService.calculateDepreciation(businessId, assetId, month, year);

      res.json({
        success: true,
        data: {
          asset_id: assetId,
          month,
          year,
          depreciation_amount: depreciationAmount
        },
        message: 'Depreciation calculated successfully'
      });

    } catch (error) {
      log.error('Depreciation calculation error', error);
      next(error);
    }
  },

  // NEW: Calculate historical depreciation
  async calculateHistoricalDepreciation(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const assetId = req.params.id;
      const { as_of_date } = req.body;

      const historicalDepreciation = await AssetService.calculateHistoricalDepreciation(
        businessId, 
        assetId, 
        as_of_date ? new Date(as_of_date) : new Date()
      );

      res.json({
        success: true,
        data: historicalDepreciation,
        count: historicalDepreciation.length,
        message: 'Historical depreciation calculated successfully'
      });

    } catch (error) {
      log.error('Historical depreciation calculation error', error);
      next(error);
    }
  },

  // NEW: Post historical depreciation
  async postHistoricalDepreciation(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const assetId = req.params.id;
      const { as_of_date } = req.body;

      const results = await AssetService.postHistoricalDepreciation(
        businessId,
        assetId,
        userId,
        as_of_date ? new Date(as_of_date) : new Date()
      );

      res.json({
        success: true,
        data: results,
        count: results.length,
        message: 'Historical depreciation posted successfully'
      });

    } catch (error) {
      log.error('Historical depreciation posting error', error);
      next(error);
    }
  },

  // NEW: Dispose asset
  async disposeAsset(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const assetId = req.params.id;
      const disposalData = req.body;

      if (!disposalData.disposal_method || !disposalData.disposal_date) {
        return res.status(400).json({
          success: false,
          message: 'Disposal method and date are required'
        });
      }

      const result = await AssetService.disposeAsset(businessId, assetId, disposalData, userId);

      res.json({
        success: true,
        data: result,
        message: 'Asset disposed successfully'
      });

    } catch (error) {
      if (error.message === 'Active asset not found or access denied') {
        return res.status(404).json({
          success: false,
          message: 'Active asset not found'
        });
      }
      log.error('Asset disposal error', error);
      next(error);
    }
  },

  // NEW: Get assets by category summary
  async getAssetsByCategory(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const summary = await AssetService.getAssetsByCategory(businessId);

      res.json({
        success: true,
        data: summary,
        count: summary.length,
        message: 'Assets by category summary fetched successfully'
      });

    } catch (error) {
      log.error('Assets by category fetch error', error);
      next(error);
    }
  },

  // NEW: Test system endpoint
  async testSystem(req, res, next) {
    try {
      const businessId = req.user.businessId;

      res.json({
        success: true,
        data: {
          business_id: businessId,
          timestamp: new Date().toISOString(),
          system: 'Fixed Assets System',
          status: 'Operational',
          features: [
            'Asset creation with accounting',
            'Existing asset registration',
            'Historical depreciation calculation',
            'Historical depreciation posting',
            'Depreciation tracking',
            'Asset disposal',
            'Asset register reports',
            'Enhanced asset register',
            'Depreciation schedule',
            'Monthly depreciation posting',
            'Assets by category summary'
          ]
        },
        message: 'Fixed Assets System is operational'
      });

    } catch (error) {
      log.error('System test error', error);
      next(error);
    }
  }
};
