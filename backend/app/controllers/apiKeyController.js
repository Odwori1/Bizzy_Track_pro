import { ApiKeyService } from '../services/apiKeyService.js';
import { log } from '../utils/logger.js';

export class ApiKeyController {

  // Create API key
  static async createApiKey(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const keyData = req.body;

      log.info('Creating API key', { businessId, userId, keyData: { name: keyData.name } });

      const apiKey = await ApiKeyService.createApiKey(businessId, keyData, userId);

      res.status(201).json({
        success: true,
        message: 'API key created successfully',
        data: apiKey
      });

    } catch (error) {
      log.error('Error creating API key', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to create API key',
        error: error.message
      });
    }
  }

  // Get all API keys
  static async getApiKeys(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      log.info('Fetching API keys', { businessId, filters });

      const apiKeys = await ApiKeyService.getApiKeys(businessId, filters);

      res.json({
        success: true,
        data: apiKeys,
        count: apiKeys.length
      });

    } catch (error) {
      log.error('Error fetching API keys', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch API keys',
        error: error.message
      });
    }
  }

  // Rotate API secret
  static async rotateApiSecret(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { apiKeyId } = req.params;

      log.info('Rotating API secret', { businessId, userId, apiKeyId });

      const apiKey = await ApiKeyService.rotateApiSecret(businessId, apiKeyId, userId);

      res.json({
        success: true,
        message: 'API secret rotated successfully',
        data: apiKey
      });

    } catch (error) {
      log.error('Error rotating API secret', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to rotate API secret',
        error: error.message
      });
    }
  }

  // Delete API key
  static async deleteApiKey(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { apiKeyId } = req.params;

      log.info('Deleting API key', { businessId, userId, apiKeyId });

      const deletedKey = await ApiKeyService.deleteApiKey(businessId, apiKeyId, userId);

      res.json({
        success: true,
        message: 'API key deleted successfully',
        data: deletedKey
      });

    } catch (error) {
      log.error('Error deleting API key', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to delete API key',
        error: error.message
      });
    }
  }

  // Get API key usage stats
  static async getApiKeyUsage(req, res) {
    try {
      const businessId = req.user.businessId;
      const { apiKeyId } = req.params;
      const { period = '7d' } = req.query;

      log.info('Fetching API key usage', { businessId, apiKeyId, period });

      // This would typically query api_key_usage_logs for statistics
      const usageStats = {
        total_requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        average_response_time: 0,
        endpoints: []
      };

      res.json({
        success: true,
        data: usageStats
      });

    } catch (error) {
      log.error('Error fetching API key usage', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch API key usage',
        error: error.message
      });
    }
  }
}
