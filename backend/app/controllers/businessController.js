import { businessService } from '../services/businessService.js';
import { businessRegistrationSchema } from '../schemas/businessSchemas.js';
import { log } from '../utils/logger.js';

export const businessController = {
  async register(req, res) {
    try {
      log.info('Business registration request received', {
        body: req.body,
        clientIP: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Validate input - USE req.body DIRECTLY
      const { error, value } = businessRegistrationSchema.validate(req.body);
      if (error) {
        log.warn('Business registration validation failed', { error: error.details });
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(detail => detail.message)
        });
      }

      // Register business
      const result = await businessService.registerBusiness(value);

      log.info('Business registration successful', {
        businessId: result.business.id,
        timezone: result.business.timezone
      });

      res.status(201).json(result);

    } catch (error) {
      log.error('Business registration controller error', error);

      // Handle specific errors with helpful messages
      if (error.message.includes('Invalid timezone')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid timezone provided',
          suggestion: 'Please use a valid IANA timezone like Africa/Lagos or Africa/Nairobi'
        });
      }

      if (error.message.includes('Unsupported currency')) {
        return res.status(400).json({
          success: false,
          error: 'Unsupported currency',
          suggestion: 'Please use a supported currency code like GHS, NGN, KES, etc.'
        });
      }

      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          error: 'Email already registered'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error during registration'
      });
    }
  },

  // ADD LOGIN METHOD
  async login(req, res) {
    try {
      const { email, password } = req.body;

      log.info('User login attempt', { email });

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }

      const result = await businessService.loginUser(email, password);

      res.json({
        success: true,
        message: 'Login successful',
        data: result
      });

    } catch (error) {
      log.error('Login controller error', error);
      
      if (error.message.includes('Invalid email or password')) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Login failed'
      });
    }
  },

  async getProfile(req, res) {
    try {
      const businessId = req.user.businessId;
      const business = await businessService.getBusinessProfile(businessId);

      if (!business) {
        return res.status(404).json({
          success: false,
          error: 'Business not found'
        });
      }

      res.json({
        success: true,
        business,
        // Include current time in business timezone
        currentTime: {
          server: new Date().toISOString(),
          businessTimezone: new Date().toLocaleString('en-US', {
            timeZone: business.timezone
          })
        }
      });

    } catch (error) {
      log.error('Get business profile error', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },

  // Get system configuration
  async getConfig(req, res) {
    try {
      const config = await businessService.getSystemConfig();
      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      log.error('Get config error', error);
      res.status(500).json({
        success: false,
        error: 'Failed to load configuration'
      });
    }
  },

  // Validate timezone
  async validateTimezone(req, res) {
    try {
      const { timezone } = req.body;

      if (!timezone) {
        return res.status(400).json({
          success: false,
          error: 'Timezone is required'
        });
      }

      // Simple timezone validation using Intl
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        res.json({
          success: true,
          isValid: true,
          message: 'Valid timezone'
        });
      } catch (e) {
        res.json({
          success: true,
          isValid: false,
          message: 'Invalid timezone'
        });
      }

    } catch (error) {
      log.error('Timezone validation error', error);
      res.status(500).json({
        success: false,
        error: 'Validation failed'
      });
    }
  }
};
