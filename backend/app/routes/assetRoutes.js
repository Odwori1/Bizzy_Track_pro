import express from 'express';
import { assetController } from '../controllers/assetController.js';
import { createFixedAssetSchema, updateFixedAssetSchema } from '../schemas/assetSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Asset CRUD operations
router.post(
  '/',
  requirePermission('asset:create'),
  validateRequest(createFixedAssetSchema),
  assetController.create
);

// Existing asset registration
router.post(
  '/existing',
  requirePermission('asset:create'),
  assetController.registerExistingAsset
);

router.get(
  '/',
  requirePermission('asset:read'),
  assetController.getAll
);

router.get(
  '/statistics',
  requirePermission('asset:read'),
  assetController.getStatistics
);

router.get(
  '/:id',
  requirePermission('asset:read'),
  assetController.getById
);

router.put(
  '/:id',
  requirePermission('asset:update'),
  validateRequest(updateFixedAssetSchema),
  assetController.update
);

// NEW: Asset reports
router.get(
  '/reports/register',
  requirePermission('asset:read'),
  assetController.getAssetRegister
);

// Enhanced asset register
router.get(
  '/reports/enhanced-register',
  requirePermission('asset:read'),
  assetController.getEnhancedAssetRegister
);

router.get(
  '/reports/depreciation-schedule',
  requirePermission('asset:read'),
  assetController.getDepreciationSchedule
);

router.get(
  '/reports/by-category',
  requirePermission('asset:read'),
  assetController.getAssetsByCategory
);

// NEW: Depreciation operations
router.post(
  '/depreciations/post-monthly',
  requirePermission('asset:update'),
  assetController.postMonthlyDepreciation
);

router.post(
  '/:id/calculate-depreciation',
  requirePermission('asset:read'),
  assetController.calculateDepreciation
);

// Historical depreciation calculation
router.post(
  '/:id/historical-depreciation/calculate',
  requirePermission('asset:read'),
  assetController.calculateHistoricalDepreciation
);

// Historical depreciation posting
router.post(
  '/:id/historical-depreciation/post',
  requirePermission('asset:update'),
  assetController.postHistoricalDepreciation
);

// NEW: Asset disposal
router.post(
  '/:id/dispose',
  requirePermission('asset:update'),
  assetController.disposeAsset
);

// NEW: System test
router.get(
  '/test/system',
  requirePermission('asset:read'),
  assetController.testSystem
);

export default router;
