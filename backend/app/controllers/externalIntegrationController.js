import { ExternalIntegrationService } from '../services/externalIntegrationService.js';
import { log } from '../utils/logger.js';

export class ExternalIntegrationController {

  // Create integration
  static async createIntegration(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const integrationData = req.body;

      log.info('Creating external integration', { 
        businessId, 
        userId, 
        integrationData: { 
          service_name: integrationData.service_name,
          provider: integrationData.provider
        } 
      });

      const integration = await ExternalIntegrationService.createIntegration(businessId, integrationData, userId);

      res.status(201).json({
        success: true,
        message: 'Integration created successfully',
        data: integration
      });

    } catch (error) {
      log.error('Error creating integration', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to create integration',
        error: error.message
      });
    }
  }

  // Get integrations
  static async getIntegrations(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      log.info('Fetching integrations', { businessId, filters });

      const integrations = await ExternalIntegrationService.getIntegrations(businessId, filters);

      res.json({
        success: true,
        data: integrations,
        count: integrations.length
      });

    } catch (error) {
      log.error('Error fetching integrations', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch integrations',
        error: error.message
      });
    }
  }

  // Update integration
  static async updateIntegration(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { integrationId } = req.params;
      const updateData = req.body;

      log.info('Updating integration', { businessId, userId, integrationId });

      const integration = await ExternalIntegrationService.updateIntegration(
        businessId, integrationId, updateData, userId
      );

      res.json({
        success: true,
        message: 'Integration updated successfully',
        data: integration
      });

    } catch (error) {
      log.error('Error updating integration', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to update integration',
        error: error.message
      });
    }
  }

  // Test integration connection
  static async testIntegrationConnection(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { integrationId } = req.params;

      log.info('Testing integration connection', { businessId, userId, integrationId });

      const testResult = await ExternalIntegrationService.testIntegrationConnection(
        businessId, integrationId, userId
      );

      res.json({
        success: true,
        message: 'Integration connection test completed',
        data: testResult
      });

    } catch (error) {
      log.error('Error testing integration connection', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to test integration connection',
        error: error.message
      });
    }
  }

  // Get integration activity logs
  static async getIntegrationActivityLogs(req, res) {
    try {
      const businessId = req.user.businessId;
      const { integrationId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      log.info('Fetching integration activity logs', { businessId, integrationId });

      // This would query integration_audit_logs table
      const activityLogs = [];

      res.json({
        success: true,
        data: activityLogs,
        count: activityLogs.length
      });

    } catch (error) {
      log.error('Error fetching integration activity logs', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch integration activity logs',
        error: error.message
      });
    }
  }
}
