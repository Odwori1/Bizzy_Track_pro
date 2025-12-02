import express from 'express';
import { assetHireController } from '../controllers/assetHireController.js';
import { markAssetHireableSchema } from '../schemas/assetHireSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

router.use(authenticate, setRLSContext);

// Get assets that can be marked as hireable (equipment type)
router.get(
  '/assets/hireable',
  requirePermission('assets:read'),
  assetHireController.getHireableAssets
);

// Mark asset as hireable
router.post(
  '/assets/:assetId/mark-hireable',
  requirePermission('assets:update'),
  validateRequest(markAssetHireableSchema),
  assetHireController.markAssetAsHireable
);

// Get hireable assets with hire details
router.get(
  '/assets/hireable-with-details',
  requirePermission('assets:read'),
  assetHireController.getHireableAssetsWithDetails
);

// Get asset hire details by ID
router.get(
  '/assets/:assetId/hire-details',
  requirePermission('assets:read'),
  assetHireController.getAssetHireDetails
);

export default router;
