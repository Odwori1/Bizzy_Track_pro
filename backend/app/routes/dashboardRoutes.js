import express from 'express';
import { dashboardController } from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// All dashboard routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// GET /api/dashboard/overview - Get business overview (requires dashboard:view permission)
router.get(
  '/overview', 
  requirePermission('dashboard:view'), 
  dashboardController.getOverview
);

// GET /api/dashboard/financial-summary - Get financial summary (requires dashboard:view permission)
router.get(
  '/financial-summary', 
  requirePermission('dashboard:view'), 
  dashboardController.getFinancialSummary
);

// GET /api/dashboard/activity-timeline - Get activity timeline (requires dashboard:view permission)
router.get(
  '/activity-timeline', 
  requirePermission('dashboard:view'), 
  dashboardController.getActivityTimeline
);

// GET /api/dashboard/quick-stats - Get quick statistics (requires dashboard:view permission)
router.get(
  '/quick-stats', 
  requirePermission('dashboard:view'), 
  dashboardController.getQuickStats
);

export default router;
