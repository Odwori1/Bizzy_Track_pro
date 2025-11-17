import { Router } from 'express';
import { ApiSecurityController } from '../controllers/apiSecurityController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// API Security Overview and Analytics routes
router.get(
  '/overview',
  requirePermission('api_security:view'),
  ApiSecurityController.getSecurityOverview
);

router.get(
  '/analytics/usage',
  requirePermission('api_analytics:view'),
  ApiSecurityController.getApiUsageAnalytics
);

export default router;
