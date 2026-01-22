import express from 'express';
import { assetAdvancedController } from '../controllers/assetAdvancedController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// Apply authentication and RLS context
router.use(authenticate);
router.use(setRLSContext);

// Advanced asset endpoints
router.get('/search', 
  requirePermission('assets', 'read'), 
  assetAdvancedController.advancedSearch
);

router.get('/analytics', 
  requirePermission('assets', 'read'), 
  assetAdvancedController.getAnalytics
);

router.get('/depreciation-schedule', 
  requirePermission('assets', 'read'), 
  assetAdvancedController.getDepreciationSchedule
);

export default router;
