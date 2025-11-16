import { SupplierService } from '../services/supplierService.js';
import { log } from '../utils/logger.js';

export const supplierController = {
  async createSupplier(req, res, next) {
    try {
      const supplierData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating supplier', { businessId, userId, supplierName: supplierData.name });

      const newSupplier = await SupplierService.createSupplier(businessId, supplierData, userId);

      res.status(201).json({
        success: true,
        message: 'Supplier created successfully',
        data: newSupplier
      });

    } catch (error) {
      log.error('Supplier creation controller error', error);
      next(error);
    }
  },

  async getSuppliers(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { is_active, search, page, limit } = req.query;

      const filters = {};
      if (is_active !== undefined) filters.is_active = is_active === 'true';
      if (search) filters.search = search;
      if (page) filters.page = parseInt(page);
      if (limit) filters.limit = parseInt(limit);

      const suppliers = await SupplierService.getSuppliers(businessId, filters);

      res.json({
        success: true,
        data: suppliers,
        count: suppliers.length,
        message: 'Suppliers fetched successfully'
      });

    } catch (error) {
      log.error('Suppliers fetch controller error', error);
      next(error);
    }
  },

  async getSupplierById(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { id } = req.params;

      const supplier = await SupplierService.getSupplierById(businessId, id);

      res.json({
        success: true,
        data: supplier,
        message: 'Supplier fetched successfully'
      });

    } catch (error) {
      log.error('Supplier fetch by ID controller error', error);
      next(error);
    }
  },

  async updateSupplier(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating supplier', { businessId, userId, supplierId: id });

      const updatedSupplier = await SupplierService.updateSupplier(businessId, id, updateData, userId);

      res.json({
        success: true,
        message: 'Supplier updated successfully',
        data: updatedSupplier
      });

    } catch (error) {
      log.error('Supplier update controller error', error);
      next(error);
    }
  },

  async getStatistics(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const statistics = await SupplierService.getSupplierStatistics(businessId);

      res.json({
        success: true,
        data: statistics,
        message: 'Supplier statistics fetched successfully'
      });

    } catch (error) {
      log.error('Supplier statistics fetch controller error', error);
      next(error);
    }
  }
};
