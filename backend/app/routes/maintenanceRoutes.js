import express from 'express';
import { maintenanceController } from '../controllers/maintenanceController.js';
import { createMaintenanceSchema, updateMaintenanceSchema } from '../schemas/maintenanceSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Create maintenance record
router.post(
  '/',
  requirePermission('asset:maintenance:create'),
  validateRequest(createMaintenanceSchema),
  maintenanceController.createMaintenance
);

// Get all maintenance records
router.get(
  '/',
  requirePermission('asset:maintenance:read'),
  maintenanceController.getAllMaintenance
);

// Get maintenance by asset ID
router.get(
  '/asset/:assetId',
  requirePermission('asset:maintenance:read'),
  maintenanceController.getMaintenanceByAssetId
);

// Get upcoming maintenance
router.get(
  '/upcoming',
  requirePermission('asset:maintenance:read'),
  maintenanceController.getUpcomingMaintenance
);

// Get maintenance by ID
router.get(
  '/:id',
  requirePermission('asset:maintenance:read'),
  maintenanceController.getMaintenanceById
);

// Update maintenance record
router.put(
  '/:id',
  requirePermission('asset:maintenance:update'),
  validateRequest(updateMaintenanceSchema),
  maintenanceController.updateMaintenance
);

// Delete maintenance record
router.delete(
  '/:id',
  requirePermission('asset:maintenance:delete'),
  maintenanceController.deleteMaintenance
);

export default router;
