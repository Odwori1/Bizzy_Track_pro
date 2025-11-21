import express from 'express';
import { PricingABACService } from '../services/pricingABACService.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

router.use(authenticate, setRLSContext);

// Get ABAC permissions for current user
router.get('/permissions', 
  requirePermission('pricing:read'),
  async (req, res) => {
    try {
      const { userId, businessId } = req.user;
      
      const permissions = {
        can_override: await PricingABACService.canOverridePricing(userId, businessId),
        can_approve_discounts: await PricingABACService.canApproveDiscounts(userId, businessId),
        user_discount_limit: await PricingABACService.getUserDiscountLimit(userId, businessId),
        pricing_restrictions: await PricingABACService.getUserPricingRestrictions(userId, businessId)
      };

      res.json({
        success: true,
        data: permissions,
        message: 'ABAC permissions fetched successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Evaluate ABAC rules
router.post('/evaluate',
  requirePermission('pricing:read'),
  async (req, res) => {
    try {
      const { action, resource_type, resource_attributes, user_attributes } = req.body;
      const { userId, businessId } = req.user;

      const result = await PricingABACService.evaluateABACRules(
        userId,
        businessId,
        action,
        resource_type,
        resource_attributes,
        user_attributes
      );

      res.json({
        success: true,
        data: result,
        message: 'ABAC evaluation completed successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

export default router;
