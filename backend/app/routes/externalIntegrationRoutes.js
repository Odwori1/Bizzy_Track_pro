import { Router } from 'express';
import { ExternalIntegrationController } from '../controllers/externalIntegrationController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import {
  externalIntegrationCreateSchema
} from '../schemas/apiSecuritySchemas.js';

const router = Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// External Integration Management routes
router.post(
  '/',
  requirePermission('integrations:manage'),
  validateRequest(externalIntegrationCreateSchema),
  ExternalIntegrationController.createIntegration
);

router.get(
  '/',
  requirePermission('integrations:view'),
  ExternalIntegrationController.getIntegrations
);

router.put(
  '/:integrationId',
  requirePermission('integrations:manage'),
  validateRequest(externalIntegrationCreateSchema),
  ExternalIntegrationController.updateIntegration
);

router.post(
  '/:integrationId/test',
  requirePermission('integrations:sync'),
  ExternalIntegrationController.testIntegrationConnection
);

router.get(
  '/:integrationId/activity-logs',
  requirePermission('integrations:view'),
  ExternalIntegrationController.getIntegrationActivityLogs
);

export default router;
