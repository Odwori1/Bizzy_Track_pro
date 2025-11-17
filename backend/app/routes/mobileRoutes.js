import { Router } from 'express';
import { MobileController } from '../controllers/mobileController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import { 
  registerMobileDeviceSchema,
  mobileAppSettingsSchema,
  startOfflineSyncSchema,
  completeOfflineSyncSchema,
  mobilePerformanceSchema,
  mobileQuerySchema
} from '../schemas/mobileSchemas.js';

const router = Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Mobile Device Registration routes
router.post(
  '/devices/register',
  requirePermission('mobile:access'),
  validateRequest(registerMobileDeviceSchema),
  MobileController.registerMobileDevice
);

// Mobile App Settings routes
router.get(
  '/settings',
  requirePermission('mobile:access'),
  MobileController.getMobileAppSettings
);

router.put(
  '/settings',
  requirePermission('mobile:access'),
  validateRequest(mobileAppSettingsSchema),
  MobileController.updateMobileAppSettings
);

// Offline Sync routes
router.post(
  '/sync/start',
  requirePermission('mobile:offline'),
  validateRequest(startOfflineSyncSchema),
  MobileController.startOfflineSync
);

router.put(
  '/sync/:batchId/complete',
  requirePermission('mobile:offline'),
  validateRequest(completeOfflineSyncSchema),
  MobileController.completeOfflineSync
);

router.get(
  '/offline-data',
  requirePermission('mobile:offline'),
  MobileController.getOfflineData
);

// Performance Logging routes
router.post(
  '/performance/log',
  requirePermission('mobile:access'),
  validateRequest(mobilePerformanceSchema),
  MobileController.logMobilePerformance
);

export default router;
