import { Router } from 'express';
import { ApiKeyController } from '../controllers/apiKeyController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import {
  apiKeyCreateSchema,
  apiKeyUpdateSchema
} from '../schemas/apiSecuritySchemas.js';

const router = Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// API Key Management routes
router.post(
  '/',
  requirePermission('api_keys:manage'),
  validateRequest(apiKeyCreateSchema),
  ApiKeyController.createApiKey
);

router.get(
  '/',
  requirePermission('api_keys:view'),
  ApiKeyController.getApiKeys
);

router.post(
  '/:apiKeyId/rotate',
  requirePermission('api_keys:rotate'),
  ApiKeyController.rotateApiSecret
);

router.delete(
  '/:apiKeyId',
  requirePermission('api_keys:manage'),
  ApiKeyController.deleteApiKey
);

router.get(
  '/:apiKeyId/usage',
  requirePermission('api_keys:view'),
  ApiKeyController.getApiKeyUsage
);

export default router;
