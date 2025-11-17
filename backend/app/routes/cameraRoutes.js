import { Router } from 'express';
import { CameraController } from '../controllers/cameraController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import { 
  createCameraTemplateSchema,
  uploadMediaAttachmentSchema,
  mobileQuerySchema
} from '../schemas/mobileSchemas.js';

const router = Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Camera Template routes
router.post(
  '/templates',
  requirePermission('mobile:camera'),
  validateRequest(createCameraTemplateSchema),
  CameraController.createCameraTemplate
);

router.get(
  '/templates',
  requirePermission('mobile:camera'),
  validateRequest(mobileQuerySchema, 'query'),
  CameraController.getCameraTemplates
);

// Media Attachment routes
router.post(
  '/media/upload',
  requirePermission('mobile:camera'),
  validateRequest(uploadMediaAttachmentSchema),
  CameraController.uploadMediaAttachment
);

router.get(
  '/media',
  requirePermission('mobile:camera'),
  validateRequest(mobileQuerySchema, 'query'),
  CameraController.getMediaAttachments
);

export default router;
