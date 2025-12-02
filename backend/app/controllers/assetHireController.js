import { AssetHireService } from '../services/assetHireService.js';
import { AssetService } from '../services/assetService.js';

export const assetHireController = {
  /**
   * Mark an asset as hireable
   */
  async markAssetAsHireable(req, res) {
    try {
      const { assetId } = req.params;
      const hireData = req.body;
      const { businessId, userId } = req;

      const result = await AssetHireService.markAssetAsHireable(
        businessId,
        assetId,
        hireData,
        userId
      );

      res.status(200).json({
        success: true,
        message: 'Asset marked as hireable successfully',
        data: result
      });
    } catch (error) {
      console.error('Error marking asset as hireable:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Get assets that can be marked as hireable
   */
  async getHireableAssets(req, res) {
    try {
      const { businessId } = req;

      const assets = await AssetHireService.getHireableAssets(businessId);

      res.status(200).json({
        success: true,
        data: assets
      });
    } catch (error) {
      console.error('Error fetching hireable assets:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch hireable assets'
      });
    }
  },

  /**
   * Get assets that are already marked as hireable with details
   */
  async getHireableAssetsWithDetails(req, res) {
    try {
      const { businessId } = req;

      const assets = await AssetHireService.getHireableAssetsWithDetails(businessId);

      res.status(200).json({
        success: true,
        data: assets
      });
    } catch (error) {
      console.error('Error fetching hireable assets with details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch hireable assets with details'
      });
    }
  },

  /**
   * Get asset hire details
   */
  async getAssetHireDetails(req, res) {
    try {
      const { assetId } = req.params;
      const { businessId } = req;

      const details = await AssetHireService.getAssetHireDetails(businessId, assetId);

      if (!details) {
        return res.status(404).json({
          success: false,
          error: 'Asset not found or not hireable'
        });
      }

      res.status(200).json({
        success: true,
        data: details
      });
    } catch (error) {
      console.error('Error fetching asset hire details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch asset hire details'
      });
    }
  }
};
