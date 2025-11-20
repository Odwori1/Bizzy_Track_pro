import { PriceHistoryService } from '../services/priceHistoryService.js';
import { log } from '../utils/logger.js';

export const priceHistoryController = {
  async getByEntity(req, res, next) {
    try {
      const { entityType, entityId } = req.params;
      const businessId = req.user.businessId;
      const { limit = 50, offset = 0, change_type, date_from, date_to } = req.query;

      log.info('Fetching price history for entity', {
        entityType,
        entityId,
        businessId,
        limit,
        offset
      });

      const history = await PriceHistoryService.getPriceHistoryByEntity(
        businessId,
        entityType,
        entityId,
        {
          limit: parseInt(limit),
          offset: parseInt(offset),
          change_type,
          date_from,
          date_to
        }
      );

      res.json({
        success: true,
        data: history,
        count: history.length,
        message: 'Price history fetched successfully'
      });

    } catch (error) {
      log.error('Price history fetch controller error', error);
      next(error);
    }
  },

  async getByBusiness(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { 
        limit = 100, 
        offset = 0, 
        entity_type, 
        change_type, 
        date_from, 
        date_to,
        search 
      } = req.query;

      log.info('Fetching price history for business', {
        businessId,
        limit,
        offset,
        filters: { entity_type, change_type, date_from, date_to, search }
      });

      const history = await PriceHistoryService.getPriceHistoryByBusiness(
        businessId,
        {
          limit: parseInt(limit),
          offset: parseInt(offset),
          entity_type,
          change_type,
          date_from,
          date_to,
          search
        }
      );

      res.json({
        success: true,
        data: history.records,
        count: history.records.length,
        total_count: history.totalCount,
        message: 'Business price history fetched successfully'
      });

    } catch (error) {
      log.error('Business price history fetch controller error', error);
      next(error);
    }
  },

  async getStats(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { days = 30 } = req.query;

      log.info('Fetching price history statistics', {
        businessId,
        days
      });

      const stats = await PriceHistoryService.getPriceHistoryStats(businessId, parseInt(days));

      res.json({
        success: true,
        data: stats,
        message: 'Price history statistics fetched successfully'
      });

    } catch (error) {
      log.error('Price history stats fetch controller error', error);
      next(error);
    }
  },

  async getChangeSummary(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { entityType, entityId } = req.params;
      const { days = 365 } = req.query;

      log.info('Fetching price change summary', {
        businessId,
        entityType,
        entityId,
        days
      });

      const summary = await PriceHistoryService.getPriceChangeSummary(
        businessId,
        entityType,
        entityId,
        parseInt(days)
      );

      res.json({
        success: true,
        data: summary,
        message: 'Price change summary fetched successfully'
      });

    } catch (error) {
      log.error('Price change summary fetch controller error', error);
      next(error);
    }
  },

  async exportPriceHistory(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { format = 'csv', entity_type, date_from, date_to } = req.query;

      log.info('Exporting price history', {
        businessId,
        format,
        entity_type,
        date_from,
        date_to
      });

      const exportData = await PriceHistoryService.exportPriceHistory(
        businessId,
        {
          format,
          entity_type,
          date_from,
          date_to
        }
      );

      // Set appropriate headers for download
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="price_history_${businessId}_${new Date().toISOString().split('T')[0]}.csv"`);
        return res.send(exportData);
      } else {
        res.json({
          success: true,
          data: exportData,
          message: 'Price history exported successfully'
        });
      }

    } catch (error) {
      log.error('Price history export controller error', error);
      next(error);
    }
  }
};
