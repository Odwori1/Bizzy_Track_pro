import express from 'express';
import { depreciationController } from '../controllers/depreciationController.js';
import { calculateDepreciationSchema } from '../schemas/depreciationSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Calculate and record depreciation
router.post(
  '/calculate',
  requirePermission('asset:depreciate'),
  validateRequest(calculateDepreciationSchema),
  depreciationController.calculateDepreciation
);

// Get depreciation by asset ID
router.get(
  '/asset/:assetId',
  requirePermission('asset:depreciate'),
  depreciationController.getDepreciationByAssetId
);

// Get depreciation schedule for an asset
router.get(
  '/schedule/:assetId',
  requirePermission('asset:depreciate'),
  depreciationController.getDepreciationSchedule
);

// Get business depreciation summary
router.get(
  '/business-summary',
  requirePermission('asset:depreciate'),
  depreciationController.getBusinessDepreciationSummary
);

// Get current asset values
router.get(
  '/current-values',
  requirePermission('asset:depreciate'),
  depreciationController.getCurrentAssetValues
);

export default router;
