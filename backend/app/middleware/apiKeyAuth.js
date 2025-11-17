import { ApiKeyService } from '../services/apiKeyService.js';
import { log } from '../utils/logger.js';

export const apiKeyAuth = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required'
      });
    }

    const clientIp = req.ip || req.connection.remoteAddress;

    // Validate API key
    const validation = await ApiKeyService.validateApiKey(apiKey, clientIp);

    if (!validation.isValid) {
      log.warn('Invalid API key attempt', { apiKey: apiKey.substring(0, 10) + '...', ip: clientIp, reason: validation.reason });

      return res.status(401).json({
        success: false,
        message: `Invalid API key: ${validation.reason}`
      });
    }

    // ✅ FIX: Set user context for RLS - CRITICAL!
    req.user = {
      businessId: validation.businessId,
      userId: 'api-key-user', // Placeholder user ID for RLS context
      role: 'api_key',
      timezone: validation.timezone
    };

    req.businessId = validation.businessId;
    req.apiKeyPermissions = validation.permissions;
    req.apiKeyRateLimit = validation.rateLimit;
    req.timezone = validation.timezone;

    // ✅ FIX: Get API key record ID for logging (not the API key string)
    const apiKeyRecord = await ApiKeyService.getApiKeyRecord(apiKey);
    if (apiKeyRecord) {
      // Log API usage (async - don't await)
      ApiKeyService.logApiUsage(validation.businessId, apiKeyRecord.id, {
        endpoint: req.path,
        method: req.method,
        request_headers: req.headers,
        ip_address: clientIp,
        user_agent: req.headers['user-agent']
      }).catch(err => {
        console.error('Failed to log API usage:', err);
      });
    }

    next();

  } catch (error) {
    log.error('API key authentication error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error.message
    });
  }
};

// Middleware to check API key permissions
export const requireApiPermission = (permission) => {
  return (req, res, next) => {
    if (!req.apiKeyPermissions || !req.apiKeyPermissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: `API key missing required permission: ${permission}`
      });
    }
    next();
  };
};
