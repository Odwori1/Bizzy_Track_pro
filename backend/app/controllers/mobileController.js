import { MobileService } from '../services/mobileService.js';
import { log } from '../utils/logger.js';

export class MobileController {

  // Register mobile device
  static async registerMobileDevice(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const deviceData = req.body;

      log.info('Registering mobile device', { businessId, userId, deviceData: { device_id: deviceData.device_id } });

      const device = await MobileService.registerMobileDevice(businessId, deviceData, userId);

      res.status(201).json({
        success: true,
        message: 'Mobile device registered successfully',
        data: device
      });

    } catch (error) {
      log.error('Error registering mobile device', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to register mobile device',
        error: error.message
      });
    }
  }

  // Get mobile app settings
  static async getMobileAppSettings(req, res) {
    try {
      const businessId = req.user.businessId;
      const staffProfileId = req.user.staffProfileId;

      log.info('Fetching mobile app settings', { businessId, staffProfileId });

      const settings = await MobileService.getMobileAppSettings(businessId, staffProfileId);

      res.json({
        success: true,
        data: settings
      });

    } catch (error) {
      log.error('Error fetching mobile app settings', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch mobile app settings',
        error: error.message
      });
    }
  }

  // Update mobile app settings
  static async updateMobileAppSettings(req, res) {
    try {
      const businessId = req.user.businessId;
      const staffProfileId = req.user.staffProfileId;
      const userId = req.user.userId;
      const settingsData = req.body;

      log.info('Updating mobile app settings', { businessId, staffProfileId, settingsData });

      const settings = await MobileService.updateMobileAppSettings(businessId, staffProfileId, settingsData, userId);

      res.json({
        success: true,
        message: 'Mobile app settings updated successfully',
        data: settings
      });

    } catch (error) {
      log.error('Error updating mobile app settings', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to update mobile app settings',
        error: error.message
      });
    }
  }

  // Start offline sync
  static async startOfflineSync(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const batchData = req.body;

      log.info('Starting offline sync', { businessId, userId, batchData: { device_id: batchData.device_id } });

      const batch = await MobileService.startOfflineSyncBatch(businessId, batchData, userId);

      res.status(201).json({
        success: true,
        message: 'Offline sync started successfully',
        data: batch
      });

    } catch (error) {
      log.error('Error starting offline sync', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to start offline sync',
        error: error.message
      });
    }
  }

  // Complete offline sync
  static async completeOfflineSync(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { batchId } = req.params;
      const syncData = req.body;

      log.info('Completing offline sync', { businessId, userId, batchId, syncData });

      const batch = await MobileService.completeOfflineSyncBatch(businessId, batchId, syncData, userId);

      res.json({
        success: true,
        message: 'Offline sync completed successfully',
        data: batch
      });

    } catch (error) {
      log.error('Error completing offline sync', { error: error.message, businessId: req.user.businessId, batchId: req.params.batchId });
      res.status(500).json({
        success: false,
        message: 'Failed to complete offline sync',
        error: error.message
      });
    }
  }

  // Get offline data
  static async getOfflineData(req, res) {
    try {
      const businessId = req.user.businessId;
      const staffProfileId = req.user.staffProfileId;

      log.info('Fetching offline data', { businessId, staffProfileId });

      const offlineData = await MobileService.getOfflineData(businessId, staffProfileId);

      res.json({
        success: true,
        data: offlineData
      });

    } catch (error) {
      log.error('Error fetching offline data', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch offline data',
        error: error.message
      });
    }
  }

  // Log mobile performance
  static async logMobilePerformance(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const performanceData = req.body;

      log.info('Logging mobile performance', { businessId, userId, performanceData: { event_type: performanceData.event_type } });

      const logEntry = await MobileService.logMobilePerformance(businessId, performanceData, userId);

      res.status(201).json({
        success: true,
        message: 'Mobile performance logged successfully',
        data: logEntry
      });

    } catch (error) {
      log.error('Error logging mobile performance', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to log mobile performance',
        error: error.message
      });
    }
  }
}
