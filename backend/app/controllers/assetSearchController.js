import { AssetSearchService } from '../services/assetSearchService.js';
import { log } from '../utils/logger.js';

export const assetSearchController = {
  /**
   * Advanced asset search
   */
  async searchAssets(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      // Parse numeric filters
      const parsedFilters = { ...filters };
      
      if (parsedFilters.limit) parsedFilters.limit = parseInt(parsedFilters.limit);
      if (parsedFilters.offset) parsedFilters.offset = parseInt(parsedFilters.offset);
      if (parsedFilters.min_value) parsedFilters.min_value = parseFloat(parsedFilters.min_value);
      if (parsedFilters.max_value) parsedFilters.max_value = parseFloat(parsedFilters.max_value);
      if (parsedFilters.is_existing_asset !== undefined) {
        parsedFilters.is_existing_asset = parsedFilters.is_existing_asset === 'true';
      }
      if (parsedFilters.is_active !== undefined) {
        parsedFilters.is_active = parsedFilters.is_active === 'true';
      }

      const result = await AssetSearchService.searchAssets(businessId, parsedFilters);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        message: 'Assets found successfully'
      });

    } catch (error) {
      log.error('Asset search error:', error);
      next(error);
    }
  },

  /**
   * Get search options and filters
   */
  async getSearchOptions(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const options = await AssetSearchService.getSearchOptions(businessId);

      res.json({
        success: true,
        data: options,
        message: 'Search options fetched successfully'
      });

    } catch (error) {
      log.error('Get search options error:', error);
      next(error);
    }
  },

  /**
   * Quick search for autocomplete
   */
  async quickSearch(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { q, limit = 10 } = req.query;

      if (!q || q.length < 2) {
        return res.json({
          success: true,
          data: [],
          message: 'Query must be at least 2 characters'
        });
      }

      const results = await AssetSearchService.quickSearch(businessId, q, parseInt(limit));

      res.json({
        success: true,
        data: results,
        message: 'Quick search completed'
      });

    } catch (error) {
      log.error('Quick search error:', error);
      next(error);
    }
  }
};
