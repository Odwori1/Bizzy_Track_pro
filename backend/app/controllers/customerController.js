import { customerService } from '../services/customerService.js';
import { log } from '../utils/logger.js';

export const customerController = {
  async create(req, res, next) {
    try {
      const customerData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;
      
      log.info('Creating customer', { 
        customerName: `${customerData.first_name} ${customerData.last_name}`,
        userId, 
        businessId 
      });
      
      const newCustomer = await customerService.createCustomer(
        customerData,
        userId,
        businessId
      );
      
      res.status(201).json({
        success: true,
        message: 'Customer created successfully',
        data: newCustomer
      });
      
    } catch (error) {
      log.error('Customer creation controller error', error);
      next(error);
    }
  },

  async getAll(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { activeOnly, category_id } = req.query;
      
      log.info('Fetching all customers', { 
        businessId,
        filters: { activeOnly, category_id }
      });
      
      const options = {};
      if (activeOnly === 'true') options.activeOnly = true;
      if (category_id) options.category_id = category_id;
      
      const customers = await customerService.getAllCustomers(businessId, options);
      
      res.json({
        success: true,
        data: customers
      });
      
    } catch (error) {
      log.error('Customers fetch controller error', error);
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;
      
      log.info('Fetching customer by ID', { 
        customerId: id, 
        businessId 
      });
      
      const customer = await customerService.getCustomerById(id, businessId);
      
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }
      
      res.json({
        success: true,
        data: customer
      });
      
    } catch (error) {
      log.error('Customer fetch by ID controller error', error);
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;
      
      log.info('Updating customer', { 
        customerId: id, 
        userId, 
        businessId 
      });
      
      const updatedCustomer = await customerService.updateCustomer(
        id,
        updateData,
        userId,
        businessId
      );
      
      if (!updatedCustomer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Customer updated successfully',
        data: updatedCustomer
      });
      
    } catch (error) {
      log.error('Customer update controller error', error);
      next(error);
    }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;
      
      log.info('Deleting customer', { 
        customerId: id, 
        userId, 
        businessId 
      });
      
      const deletedCustomer = await customerService.deleteCustomer(
        id,
        userId,
        businessId
      );
      
      if (!deletedCustomer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Customer deleted successfully',
        data: deletedCustomer
      });
      
    } catch (error) {
      log.error('Customer deletion controller error', error);
      next(error);
    }
  },

  async search(req, res, next) {
    try {
      const { q } = req.query;
      const businessId = req.user.businessId;
      
      if (!q || q.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search term must be at least 2 characters'
        });
      }
      
      log.info('Searching customers', { 
        searchTerm: q,
        businessId 
      });
      
      const customers = await customerService.searchCustomers(businessId, q.trim());
      
      res.json({
        success: true,
        data: customers
      });
      
    } catch (error) {
      log.error('Customer search controller error', error);
      next(error);
    }
  }
};
