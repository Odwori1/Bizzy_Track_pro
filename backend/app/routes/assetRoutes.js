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

export default router;
