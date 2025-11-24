import { MaintenanceService } from '../services/maintenanceService.js';
import { log } from '../utils/logger.js';

export const maintenanceController = {
  async createMaintenance(req, res, next) {
    try {
      const maintenanceData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      const newMaintenance = await MaintenanceService.createMaintenance(businessId, maintenanceData, userId);

      res.status(201).json({
        success: true,
        message: 'Maintenance record created successfully',
        data: newMaintenance
      });

    } catch (error) {
      log.error('Maintenance creation controller error', error);
      next(error);
    }
  },

  async getAllMaintenance(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { asset_id, maintenance_type, status } = req.query;

      const maintenance = await MaintenanceService.getAllMaintenance(businessId, {
        asset_id,
        maintenance_type,
        status
      });

      res.json({
        success: true,
        data: maintenance,
        count: maintenance.length,
        message: 'Maintenance records fetched successfully'
      });

    } catch (error) {
      log.error('Maintenance fetch controller error', error);
      next(error);
    }
  },

  async getMaintenanceByAssetId(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { assetId } = req.params;

      const maintenance = await MaintenanceService.getMaintenanceByAssetId(businessId, assetId);

      res.json({
        success: true,
        data: maintenance,
        count: maintenance.length,
        message: 'Asset maintenance history fetched successfully'
      });

    } catch (error) {
      log.error('Asset maintenance history fetch controller error', error);
      next(error);
    }
  },

  async getUpcomingMaintenance(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { days = 30 } = req.query;

      const upcomingMaintenance = await MaintenanceService.getUpcomingMaintenance(businessId, parseInt(days));

      res.json({
        success: true,
        data: upcomingMaintenance,
        count: upcomingMaintenance.length,
        message: 'Upcoming maintenance fetched successfully'
      });

    } catch (error) {
      log.error('Upcoming maintenance fetch controller error', error);
      next(error);
    }
  },

  async getMaintenanceById(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { id } = req.params;

      const maintenance = await MaintenanceService.getMaintenanceById(businessId, id);

      res.json({
        success: true,
        data: maintenance,
        message: 'Maintenance record fetched successfully'
      });

    } catch (error) {
      log.error('Maintenance record fetch controller error', error);
      next(error);
    }
  },

  async updateMaintenance(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;

      const updatedMaintenance = await MaintenanceService.updateMaintenance(businessId, id, updateData, userId);

      res.json({
        success: true,
        message: 'Maintenance record updated successfully',
        data: updatedMaintenance
      });

    } catch (error) {
      log.error('Maintenance update controller error', error);
      next(error);
    }
  },

  async deleteMaintenance(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { id } = req.params;
      const userId = req.user.userId;

      await MaintenanceService.deleteMaintenance(businessId, id, userId);

      res.json({
        success: true,
        message: 'Maintenance record deleted successfully'
      });

    } catch (error) {
      log.error('Maintenance deletion controller error', error);
      next(error);
    }
  }
};
