import { Router } from 'express';
import { BehavioralAnalyticsController } from '../controllers/behavioralAnalyticsController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import { analyticsQuerySchema } from '../schemas/analyticsSchemas.js';

const router = Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Customer Behavior Tracking routes
router.post(
  '/customer-behavior',
  requirePermission('behavioral_analytics:manage'),
  BehavioralAnalyticsController.recordCustomerBehavior
);

// Customer LTV routes
router.get(
  '/customers/:customerId/ltv',
  requirePermission('behavioral_analytics:view'),
  BehavioralAnalyticsController.calculateCustomerLTV
);

// Insights routes
router.get(
  '/customer-insights',
  requirePermission('behavioral_analytics:view'),
  validateRequest(analyticsQuerySchema, 'query'),
  BehavioralAnalyticsController.getCustomerInsights
);

router.get(
  '/customer-ltv-analysis',
  requirePermission('behavioral_analytics:view'),
  BehavioralAnalyticsController.getCustomerLTVAnalysis
);

export default router;
