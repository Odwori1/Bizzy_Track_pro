import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import { 
  sendPushNotificationSchema,
  targetAudienceSchema,
  mobileQuerySchema
} from '../schemas/mobileSchemas.js';

const router = Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Push Notification routes
router.post(
  '/push/send',
  requirePermission('notifications:send'),
  validateRequest(sendPushNotificationSchema),
  NotificationController.sendPushNotification
);

router.get(
  '/push',
  requirePermission('notifications:send'),
  validateRequest(mobileQuerySchema, 'query'),
  NotificationController.getPushNotifications
);

// Device Targeting routes
router.post(
  '/devices/target',
  requirePermission('notifications:send'),
  validateRequest(targetAudienceSchema),
  NotificationController.getTargetDevices
);

export default router;
