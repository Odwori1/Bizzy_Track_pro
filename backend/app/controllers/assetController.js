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
  }
};
