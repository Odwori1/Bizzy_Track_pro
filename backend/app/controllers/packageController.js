import { packageService } from '../services/packageService.js';
import { log } from '../utils/logger.js';

export const packageController = {
  // EXISTING METHODS (unchanged)
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
      log.error('Package fetch all controller error', error);
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
      const packageData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating service package', {
        packageId: id,
        userId,
        businessId
      });

      const updatedPackage = await packageService.updatePackage(
        id,
        packageData,
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
  },

  // ==========================================================================
  // NEW DECONSTRUCTION CONTROLLER METHODS
  // ==========================================================================

  async validateDeconstruction(req, res, next) {
    try {
      const { id } = req.params;
      const { selected_services } = req.body;
      const businessId = req.user.businessId;

      log.info('Validating package deconstruction', {
        packageId: id,
        businessId,
        selectedServicesCount: selected_services?.length || 0
      });

      if (!selected_services || !Array.isArray(selected_services)) {
        return res.status(400).json({
          success: false,
          message: 'Selected services array is required'
        });
      }

      const validationResult = await packageService.validatePackageDeconstruction(
        id,
        selected_services,
        businessId
      );

      res.json({
        success: true,
        data: validationResult
      });

    } catch (error) {
      log.error('Package deconstruction validation controller error', error);
      next(error);
    }
  },

  async getDeconstructionRules(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      log.info('Fetching package deconstruction rules', {
        packageId: id,
        businessId
      });

      const rules = await packageService.getDeconstructionRules(id, businessId);

      res.json({
        success: true,
        data: rules
      });

    } catch (error) {
      log.error('Package deconstruction rules fetch controller error', error);
      next(error);
    }
  },

  async updateDeconstructionRules(req, res, next) {
    try {
      const { id } = req.params;
      const { rules } = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating package deconstruction rules', {
        packageId: id,
        userId,
        businessId,
        ruleCount: rules?.length || 0
      });

      if (!rules || !Array.isArray(rules)) {
        return res.status(400).json({
          success: false,
          message: 'Rules array is required'
        });
      }

      const updatedRules = await packageService.updateDeconstructionRules(
        id,
        rules,
        userId,
        businessId
      );

      res.json({
        success: true,
        message: 'Deconstruction rules updated successfully',
        data: updatedRules
      });

    } catch (error) {
      log.error('Package deconstruction rules update controller error', error);
      next(error);
    }
  },

  async getCustomizablePackages(req, res, next) {
    try {
      const businessId = req.user.businessId;

      log.info('Fetching customizable packages', {
        businessId
      });

      const packages = await packageService.getAllPackages(businessId, {
        activeOnly: true,
        customizableOnly: true
      });

      res.json({
        success: true,
        data: packages
      });

    } catch (error) {
      log.error('Customizable packages fetch controller error', error);
      next(error);
    }
  }
};
