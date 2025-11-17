import { Router } from 'express';
import { apiKeyAuth, requireApiPermission } from '../middleware/apiKeyAuth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { timezoneMiddleware } from '../middleware/timezone.js';

const router = Router();

// ✅ FIX: Apply middleware in correct order for external API
router.use(apiKeyAuth); // First: Validate API key and set req.user
router.use(setRLSContext); // Second: Set RLS context using req.user from apiKeyAuth
router.use(timezoneMiddleware.setTimezoneContext); // Third: Set timezone context

// Public API endpoints for external access
router.get(
  '/business/profile',
  requireApiPermission('business:view'),
  async (req, res) => {
    try {
      // This would fetch business profile
      const businessProfile = {
        id: req.businessId,
        name: 'Business Name',
        status: 'active',
        timezone: req.timezone,
        permissions: req.apiKeyPermissions
      };

      res.json({
        success: true,
        data: businessProfile
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch business profile',
        error: error.message
      });
    }
  }
);

router.get(
  '/customers',
  requireApiPermission('customers:view'),
  async (req, res) => {
    try {
      // Return empty array for now - would query customers table
      res.json({
        success: true,
        data: [],
        count: 0
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customers',
        error: error.message
      });
    }
  }
);

router.get(
  '/jobs',
  requireApiPermission('jobs:view'),
  async (req, res) => {
    try {
      // This would fetch jobs with API key permissions
      res.json({
        success: true,
        data: [],
        count: 0
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch jobs',
        error: error.message
      });
    }
  }
);

// Add more external API endpoints as needed

export default router;
