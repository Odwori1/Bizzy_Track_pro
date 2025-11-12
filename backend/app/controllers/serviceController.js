import { serviceService } from '../services/serviceService.js';
import { log } from '../utils/logger.js';

export const serviceController = {
  async create(req, res, next) {
    try {
      const serviceData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;
      
      log.info('Creating service', { 
        serviceName: serviceData.name,
        userId, 
        businessId 
      });
      
      const newService = await serviceService.createService(
        serviceData,
        userId,
        businessId
      );
      
      res.status(201).json({
        success: true,
        message: 'Service created successfully',
        data: newService
      });
      
    } catch (error) {
      log.error('Service creation controller error', error);
      next(error);
    }
  },

  async getAll(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { activeOnly, category } = req.query;
      
      log.info('Fetching all services', { 
        businessId,
        filters: { activeOnly, category }
      });
      
      const options = {};
      if (activeOnly === 'true') options.activeOnly = true;
      if (category) options.category = category;
      
      const services = await serviceService.getAllServices(businessId, options);
      
      res.json({
        success: true,
        data: services
      });
      
    } catch (error) {
      log.error('Services fetch controller error', error);
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;
      
      log.info('Fetching service by ID', { 
        serviceId: id, 
        businessId 
      });
      
      const service = await serviceService.getServiceById(id, businessId);
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      res.json({
        success: true,
        data: service
      });
      
    } catch (error) {
      log.error('Service fetch by ID controller error', error);
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;
      
      log.info('Updating service', { 
        serviceId: id, 
        userId, 
        businessId 
      });
      
      const updatedService = await serviceService.updateService(
        id,
        updateData,
        userId,
        businessId
      );
      
      if (!updatedService) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Service updated successfully',
        data: updatedService
      });
      
    } catch (error) {
      log.error('Service update controller error', error);
      next(error);
    }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;
      
      log.info('Deleting service', { 
        serviceId: id, 
        userId, 
        businessId 
      });
      
      const deletedService = await serviceService.deleteService(
        id,
        userId,
        businessId
      );
      
      if (!deletedService) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Service deleted successfully',
        data: deletedService
      });
      
    } catch (error) {
      log.error('Service deletion controller error', error);
      next(error);
    }
  },

  async getCategories(req, res, next) {
    try {
      const businessId = req.user.businessId;
      
      log.info('Fetching service categories', { 
        businessId 
      });
      
      const categories = await serviceService.getServiceCategories(businessId);
      
      res.json({
        success: true,
        data: categories
      });
      
    } catch (error) {
      log.error('Service categories fetch controller error', error);
      next(error);
    }
  }
};
