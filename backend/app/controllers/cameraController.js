import { CameraService } from '../services/cameraService.js';
import { log } from '../utils/logger.js';

export class CameraController {

  // Create camera template
  static async createCameraTemplate(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const templateData = req.body;

      log.info('Creating camera template', { businessId, userId, templateData: { name: templateData.name } });

      const template = await CameraService.createCameraTemplate(businessId, templateData, userId);

      res.status(201).json({
        success: true,
        message: 'Camera template created successfully',
        data: template
      });

    } catch (error) {
      log.error('Error creating camera template', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to create camera template',
        error: error.message
      });
    }
  }

  // Upload media attachment
  static async uploadMediaAttachment(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const mediaData = req.body;

      log.info('Uploading media attachment', { businessId, userId, mediaData: { file_name: mediaData.file_name } });

      const attachment = await CameraService.uploadMediaAttachment(businessId, mediaData, userId);

      res.status(201).json({
        success: true,
        message: 'Media attachment uploaded successfully',
        data: attachment
      });

    } catch (error) {
      log.error('Error uploading media attachment', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to upload media attachment',
        error: error.message
      });
    }
  }

  // Get camera templates
  static async getCameraTemplates(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      log.info('Fetching camera templates', { businessId, filters });

      const templates = await CameraService.getCameraTemplates(businessId, filters);

      res.json({
        success: true,
        data: templates,
        count: templates.length
      });

    } catch (error) {
      log.error('Error fetching camera templates', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch camera templates',
        error: error.message
      });
    }
  }

  // Get media attachments
  static async getMediaAttachments(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      log.info('Fetching media attachments', { businessId, filters });

      const attachments = await CameraService.getMediaAttachments(businessId, filters);

      res.json({
        success: true,
        data: attachments,
        count: attachments.length
      });

    } catch (error) {
      log.error('Error fetching media attachments', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch media attachments',
        error: error.message
      });
    }
  }
}
