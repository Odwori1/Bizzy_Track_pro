import { userFeatureToggleService } from '../services/userFeatureToggleService.js';
import { log } from '../utils/logger.js';

export const userFeatureToggleController = {
  async create(req, res, next) {
    try {
      const toggleData = req.body;
      const grantedByUserId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating user feature toggle', {
        userId: toggleData.user_id,
        permissionId: toggleData.permission_id,
        grantedBy: grantedByUserId,
        businessId
      });

      const newToggle = await userFeatureToggleService.createUserFeatureToggle(
        toggleData,
        grantedByUserId,
        businessId
      );

      res.status(201).json({
        success: true,
        message: 'User feature toggle created successfully',
        data: newToggle
      });

    } catch (error) {
      log.error('User feature toggle creation controller error', error);
      next(error);
    }
  },

  async getByUser(req, res, next) {
    try {
      const { userId } = req.params;
      const businessId = req.user.businessId;

      log.info('Fetching user feature toggles', {
        userId,
        businessId
      });

      const toggles = await userFeatureToggleService.getUserFeatureToggles(userId, businessId);

      res.json({
        success: true,
        data: toggles
      });

    } catch (error) {
      log.error('User feature toggles fetch controller error', error);
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating user feature toggle', {
        toggleId: id,
        userId,
        businessId
      });

      const updatedToggle = await userFeatureToggleService.updateUserFeatureToggle(
        id,
        updateData,
        userId,
        businessId
      );

      if (!updatedToggle) {
        return res.status(404).json({
          success: false,
          message: 'User feature toggle not found'
        });
      }

      res.json({
        success: true,
        message: 'User feature toggle updated successfully',
        data: updatedToggle
      });

    } catch (error) {
      log.error('User feature toggle update controller error', error);
      next(error);
    }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Deleting user feature toggle', {
        toggleId: id,
        userId,
        businessId
      });

      const deletedToggle = await userFeatureToggleService.deleteUserFeatureToggle(
        id,
        userId,
        businessId
      );

      if (!deletedToggle) {
        return res.status(404).json({
          success: false,
          message: 'User feature toggle not found'
        });
      }

      res.json({
        success: true,
        message: 'User feature toggle deleted successfully',
        data: deletedToggle
      });

    } catch (error) {
      log.error('User feature toggle deletion controller error', error);
      next(error);
    }
  },

  async checkPermissionWithContext(req, res, next) {
    try {
      const { userId, permissionName } = req.params;
      const context = req.body.context || {};

      log.info('Checking user permission with context', {
        userId,
        permissionName,
        context
      });

      const result = await userFeatureToggleService.checkUserPermissionWithConditions(
        userId,
        permissionName,
        context
      );

      res.json({
        success: true,
        data: {
          user_id: userId,
          permission_name: permissionName,
          has_override: result !== null,
          is_allowed: result?.is_allowed || false,
          conditions: result?.conditions,
          reason: result?.reason
        }
      });

    } catch (error) {
      log.error('Permission context check controller error', error);
      next(error);
    }
  }
};
