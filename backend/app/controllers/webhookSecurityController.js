import { WebhookSecurityService } from '../services/webhookSecurityService.js';
import { log } from '../utils/logger.js';

export class WebhookSecurityController {

  // Create webhook endpoint
  static async createWebhookEndpoint(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const webhookData = req.body;

      log.info('Creating webhook endpoint', { businessId, userId, webhookData: { name: webhookData.name } });

      const webhook = await WebhookSecurityService.createWebhookEndpoint(businessId, webhookData, userId);

      res.status(201).json({
        success: true,
        message: 'Webhook endpoint created successfully',
        data: webhook
      });

    } catch (error) {
      log.error('Error creating webhook endpoint', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to create webhook endpoint',
        error: error.message
      });
    }
  }

  // Get webhook endpoints
  static async getWebhookEndpoints(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      log.info('Fetching webhook endpoints', { businessId, filters });

      const webhooks = await WebhookSecurityService.getWebhookEndpoints(businessId, filters);

      res.json({
        success: true,
        data: webhooks,
        count: webhooks.length
      });

    } catch (error) {
      log.error('Error fetching webhook endpoints', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch webhook endpoints',
        error: error.message
      });
    }
  }

  // Verify webhook signature
  static async verifyWebhookSignature(req, res) {
    try {
      const businessId = req.user.businessId;
      const { providerName, payload, signature, timestamp } = req.body;

      log.info('Verifying webhook signature', { businessId, providerName });

      const verification = await WebhookSecurityService.verifyWebhookSignature(
        businessId, providerName, payload, signature, timestamp
      );

      res.json({
        success: true,
        data: verification
      });

    } catch (error) {
      log.error('Error verifying webhook signature', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to verify webhook signature',
        error: error.message
      });
    }
  }

  // Get webhook delivery logs
  static async getWebhookDeliveryLogs(req, res) {
    try {
      const businessId = req.user.businessId;
      const { webhookEndpointId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      log.info('Fetching webhook delivery logs', { businessId, webhookEndpointId });

      // This would query webhook_delivery_logs table
      const deliveryLogs = [];

      res.json({
        success: true,
        data: deliveryLogs,
        count: deliveryLogs.length
      });

    } catch (error) {
      log.error('Error fetching webhook delivery logs', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch webhook delivery logs',
        error: error.message
      });
    }
  }

  // ✅ ADD MISSING METHOD: Create webhook signature
  static async createWebhookSignature(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const signatureData = req.body;

      log.info('Creating webhook signature', { businessId, userId, signatureData: { provider_name: signatureData.provider_name } });

      const signature = await WebhookSecurityService.createWebhookSignature(businessId, signatureData, userId);

      res.status(201).json({
        success: true,
        message: 'Webhook signature created successfully',
        data: signature
      });

    } catch (error) {
      log.error('Error creating webhook signature', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to create webhook signature',
        error: error.message
      });
    }
  }

  // ✅ ADD MISSING METHOD: Get webhook signatures
  static async getWebhookSignatures(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      log.info('Fetching webhook signatures', { businessId, filters });

      const signatures = await WebhookSecurityService.getWebhookSignatures(businessId, filters);

      res.json({
        success: true,
        data: signatures,
        count: signatures.length
      });

    } catch (error) {
      log.error('Error fetching webhook signatures', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch webhook signatures',
        error: error.message
      });
    }
  }

  // ✅ ADD THE NEW METHOD: Update webhook signature
  static async updateWebhookSignature(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { signatureId } = req.params;
      const signatureData = req.body;

      log.info('Updating webhook signature', { businessId, userId, signatureId });

      const signature = await WebhookSecurityService.updateWebhookSignature(
        businessId, signatureId, signatureData, userId
      );

      res.json({
        success: true,
        message: 'Webhook signature updated successfully',
        data: signature
      });

    } catch (error) {
      log.error('Error updating webhook signature', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to update webhook signature',
        error: error.message
      });
    }
  }

}
