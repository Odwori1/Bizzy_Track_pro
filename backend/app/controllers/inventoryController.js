import { InventoryService } from '../services/inventoryService.js';
import { log } from '../utils/logger.js';

export const inventoryController = {
  async createCategory(req, res, next) {
    try {
      const categoryData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating inventory category', { businessId, userId, categoryName: categoryData.name });

      const newCategory = await InventoryService.createCategory(businessId, categoryData, userId);

      res.status(201).json({
        success: true,
        message: 'Inventory category created successfully',
        data: newCategory
      });

    } catch (error) {
      log.error('Inventory category creation controller error', error);
      next(error);
    }
  },

  async createItem(req, res, next) {
    try {
      const itemData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating inventory item', { businessId, userId, itemName: itemData.name });

      const newItem = await InventoryService.createItem(businessId, itemData, userId);

      res.status(201).json({
        success: true,
        message: 'Inventory item created successfully',
        data: newItem
      });

    } catch (error) {
      log.error('Inventory item creation controller error', error);
      next(error);
    }
  },

  async recordMovement(req, res, next) {
    try {
      const movementData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Recording inventory movement', { 
        businessId, 
        userId, 
        itemId: movementData.inventory_item_id,
        movementType: movementData.movement_type
      });

      const result = await InventoryService.recordMovement(businessId, movementData, userId);

      res.status(201).json({
        success: true,
        message: 'Inventory movement recorded successfully',
        data: result
      });

    } catch (error) {
      log.error('Inventory movement recording controller error', error);
      next(error);
    }
  },

  async getCategories(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { is_active } = req.query;

      const filters = {};
      if (is_active !== undefined) filters.is_active = is_active === 'true';

      const categories = await InventoryService.getCategories(businessId, filters);

      res.json({
        success: true,
        data: categories,
        count: categories.length,
        message: 'Inventory categories fetched successfully'
      });

    } catch (error) {
      log.error('Inventory categories fetch controller error', error);
      next(error);
    }
  },

  async getItems(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { category_id, is_active, low_stock, page, limit } = req.query;

      const filters = {};
      if (category_id) filters.category_id = category_id;
      if (is_active !== undefined) filters.is_active = is_active === 'true';
      if (low_stock !== undefined) filters.low_stock = low_stock === 'true';
      if (page) filters.page = parseInt(page);
      if (limit) filters.limit = parseInt(limit);

      const items = await InventoryService.getItems(businessId, filters);

      res.json({
        success: true,
        data: items,
        count: items.length,
        message: 'Inventory items fetched successfully'
      });

    } catch (error) {
      log.error('Inventory items fetch controller error', error);
      next(error);
    }
  },

  async getLowStockAlerts(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const alerts = await InventoryService.getLowStockAlerts(businessId);

      res.json({
        success: true,
        data: alerts,
        count: alerts.length,
        message: 'Low stock alerts fetched successfully'
      });

    } catch (error) {
      log.error('Low stock alerts fetch controller error', error);
      next(error);
    }
  },

  async getStatistics(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const statistics = await InventoryService.getInventoryStatistics(businessId);

      res.json({
        success: true,
        data: statistics,
        message: 'Inventory statistics fetched successfully'
      });

    } catch (error) {
      log.error('Inventory statistics fetch controller error', error);
      next(error);
    }
  }
};
