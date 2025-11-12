import { customerCategoryService } from '../services/customerCategoryService.js';
import { log } from '../utils/logger.js';

export const customerCategoryController = {
  async create(req, res, next) {
    try {
      const { name, description, color, discount_percentage } = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;
      
      log.info('Creating customer category', { 
        name, 
        userId, 
        businessId 
      });
      
      const newCategory = await customerCategoryService.createCategory(
        { name, description, color, discount_percentage },
        userId,
        businessId
      );
      
      res.status(201).json({
        success: true,
        message: 'Customer category created successfully',
        data: newCategory
      });
      
    } catch (error) {
      log.error('Customer category creation controller error', error);
      next(error);
    }
  },

  async getAll(req, res, next) {
    try {
      const businessId = req.user.businessId;
      
      log.info('Fetching all customer categories', { businessId });
      
      const categories = await customerCategoryService.getAllCategories(businessId);
      
      res.json({
        success: true,
        data: categories
      });
      
    } catch (error) {
      log.error('Customer categories fetch controller error', error);
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;
      
      log.info('Fetching customer category by ID', { 
        categoryId: id, 
        businessId 
      });
      
      const category = await customerCategoryService.getCategoryById(id, businessId);
      
      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Customer category not found'
        });
      }
      
      res.json({
        success: true,
        data: category
      });
      
    } catch (error) {
      log.error('Customer category fetch by ID controller error', error);
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;
      
      log.info('Updating customer category', { 
        categoryId: id, 
        userId, 
        businessId 
      });
      
      const updatedCategory = await customerCategoryService.updateCategory(
        id,
        updateData,
        userId,
        businessId
      );
      
      if (!updatedCategory) {
        return res.status(404).json({
          success: false,
          message: 'Customer category not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Customer category updated successfully',
        data: updatedCategory
      });
      
    } catch (error) {
      log.error('Customer category update controller error', error);
      next(error);
    }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;
      
      log.info('Deleting customer category', { 
        categoryId: id, 
        userId, 
        businessId 
      });
      
      const deletedCategory = await customerCategoryService.deleteCategory(
        id,
        userId,
        businessId
      );
      
      if (!deletedCategory) {
        return res.status(404).json({
          success: false,
          message: 'Customer category not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Customer category deleted successfully',
        data: deletedCategory
      });
      
    } catch (error) {
      log.error('Customer category deletion controller error', error);
      next(error);
    }
  }
};
