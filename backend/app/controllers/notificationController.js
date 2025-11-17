import { NotificationService } from '../services/notificationService.js';
import { log } from '../utils/logger.js';

export class NotificationController {

  // Send push notification
  static async sendPushNotification(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const notificationData = req.body;

      log.info('Sending push notification', { businessId, userId, notificationData: { title: notificationData.title } });

      const notification = await NotificationService.sendPushNotification(businessId, notificationData, userId);

      res.status(201).json({
        success: true,
        message: 'Push notification sent successfully',
        data: notification
      });

    } catch (error) {
      log.error('Error sending push notification', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to send push notification',
        error: error.message
      });
    }
  }

  // Get push notifications
  static async getPushNotifications(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      log.info('Fetching push notifications', { businessId, filters });

      const notifications = await NotificationService.getPushNotifications(businessId, filters);

      res.json({
        success: true,
        data: notifications,
        count: notifications.length
      });

    } catch (error) {
      log.error('Error fetching push notifications', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch push notifications',
        error: error.message
      });
    }
  }

  // Get target devices
  static async getTargetDevices(req, res) {
    try {
      const businessId = req.user.businessId;
      const { targetAudience } = req.body;

      log.info('Fetching target devices', { businessId, targetAudience });

      const devices = await NotificationService.getTargetDevices(businessId, targetAudience);

      res.json({
        success: true,
        data: devices,
        count: devices.length
      });

    } catch (error) {
      log.error('Error fetching target devices', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch target devices',
        error: error.message
      });
    }
  }
}
