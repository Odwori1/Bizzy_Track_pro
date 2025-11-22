import { serviceCategoryService } from '../services/serviceCategoryService.js';
import { log } from '../utils/logger.js';

export const serviceCategoryController = {
  async create(req, res, next) {
    try {
      const { name, description, color, sort_order } = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating service category', {
        name,
        userId,
        businessId
      });

      const newCategory = await serviceCategoryService.createCategory(
        { name, description, color, sort_order },
        userId,
        businessId
      );

      res.status(201).json({
        success: true,
        message: 'Service category created successfully',
        data: newCategory
      });

    } catch (error) {
      log.error('Service category creation controller error', error);
      next(error);
    }
  },

  async getAll(req, res, next) {
    try {
      const businessId = req.user.businessId;

      log.info('Fetching all service categories', { businessId });

      const categories = await serviceCategoryService.getAllCategories(businessId);

      res.json({
        success: true,
        data: categories
      });

    } catch (error) {
      log.error('Service categories fetch controller error', error);
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      log.info('Fetching service category by ID', {
        categoryId: id,
        businessId
      });

      const category = await serviceCategoryService.getCategoryById(id, businessId);

      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Service category not found'
        });
      }

      res.json({
        success: true,
        data: category
      });

    } catch (error) {
      log.error('Service category fetch by ID controller error', error);
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating service category', {
        categoryId: id,
        userId,
        businessId
      });

      const updatedCategory = await serviceCategoryService.updateCategory(
        id,
        updateData,
        userId,
        businessId
      );

      if (!updatedCategory) {
        return res.status(404).json({
          success: false,
          message: 'Service category not found'
        });
      }

      res.json({
        success: true,
        message: 'Service category updated successfully',
        data: updatedCategory
      });

    } catch (error) {
      log.error('Service category update controller error', error);
      next(error);
    }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Deleting service category', {
        categoryId: id,
        userId,
        businessId
      });

      const deletedCategory = await serviceCategoryService.deleteCategory(
        id,
        userId,
        businessId
      );

      if (!deletedCategory) {
        return res.status(404).json({
          success: false,
          message: 'Service category not found'
        });
      }

      res.json({
        success: true,
        message: 'Service category deleted successfully',
        data: deletedCategory
      });

    } catch (error) {
      log.error('Service category deletion controller error', error);
      next(error);
    }
  }
};
