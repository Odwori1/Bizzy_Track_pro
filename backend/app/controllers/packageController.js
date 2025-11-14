import { packageService } from '../services/packageService.js';
import { log } from '../utils/logger.js';

export const packageController = {
  async create(req, res, next) {
    try {
      const packageData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating service package', {
        packageName: packageData.name,
        userId,
        businessId
      });

      const newPackage = await packageService.createPackage(
        packageData,
        userId,
        businessId
      );

      res.status(201).json({
        success: true,
        message: 'Service package created successfully',
        data: newPackage
      });

    } catch (error) {
      log.error('Package creation controller error', error);
      next(error);
    }
  },

  async getAll(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { activeOnly, category } = req.query;

      log.info('Fetching all service packages', {
        businessId,
        filters: { activeOnly, category }
      });

      const options = {};
      if (activeOnly === 'true') options.activeOnly = true;
      if (category) options.category = category;

      const packages = await packageService.getAllPackages(businessId, options);

      res.json({
        success: true,
        data: packages
      });

    } catch (error) {
      log.error('Packages fetch controller error', error);
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      log.info('Fetching package by ID', {
        packageId: id,
        businessId
      });

      const servicePackage = await packageService.getPackageById(id, businessId);

      if (!servicePackage) {
        return res.status(404).json({
          success: false,
          message: 'Service package not found'
        });
      }

      res.json({
        success: true,
        data: servicePackage
      });

    } catch (error) {
      log.error('Package fetch by ID controller error', error);
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating service package', {
        packageId: id,
        userId,
        businessId
      });

      const updatedPackage = await packageService.updatePackage(
        id,
        updateData,
        userId,
        businessId
      );

      if (!updatedPackage) {
        return res.status(404).json({
          success: false,
          message: 'Service package not found'
        });
      }

      res.json({
        success: true,
        message: 'Service package updated successfully',
        data: updatedPackage
      });

    } catch (error) {
      log.error('Package update controller error', error);
      next(error);
    }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Deleting service package', {
        packageId: id,
        userId,
        businessId
      });

      const deletedPackage = await packageService.deletePackage(
        id,
        userId,
        businessId
      );

      if (!deletedPackage) {
        return res.status(404).json({
          success: false,
          message: 'Service package not found'
        });
      }

      res.json({
        success: true,
        message: 'Service package deleted successfully',
        data: deletedPackage
      });

    } catch (error) {
      log.error('Package deletion controller error', error);
      next(error);
    }
  },

  async getCategories(req, res, next) {
    try {
      const businessId = req.user.businessId;

      log.info('Fetching package categories', {
        businessId
      });

      const categories = await packageService.getPackageCategories(businessId);

      res.json({
        success: true,
        data: categories
      });

    } catch (error) {
      log.error('Package categories fetch controller error', error);
      next(error);
    }
  }
};
