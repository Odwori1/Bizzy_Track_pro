import { Router } from 'express';
import { WebhookSecurityController } from '../controllers/webhookSecurityController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import {
  webhookEndpointCreateSchema,
  webhookSignatureSchema,
  webhookVerificationSchema  // ✅ ADD THIS IMPORT
} from '../schemas/apiSecuritySchemas.js';

const router = Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Webhook Management routes
router.post(
  '/endpoints',
  requirePermission('webhooks:manage'),
  validateRequest(webhookEndpointCreateSchema),
  WebhookSecurityController.createWebhookEndpoint
);

router.get(
  '/endpoints',
  requirePermission('webhooks:view'),
  WebhookSecurityController.getWebhookEndpoints
);

// Webhook Signature routes
router.post(
  '/signatures',
  requirePermission('webhooks:manage'),
  validateRequest(webhookSignatureSchema),
  WebhookSecurityController.createWebhookSignature
);

router.get(
  '/signatures',
  requirePermission('webhooks:view'),
  WebhookSecurityController.getWebhookSignatures
);

router.post(
  '/verify-signature',
  requirePermission('webhooks:verify'),
  validateRequest(webhookVerificationSchema), // ✅ Now this will work
  WebhookSecurityController.verifyWebhookSignature
);

router.get(
  '/endpoints/:webhookEndpointId/delivery-logs',
  requirePermission('webhooks:view'),
  WebhookSecurityController.getWebhookDeliveryLogs
);

// Add this route after the create signature route
router.put(
  '/signatures/:signatureId',
  requirePermission('webhooks:manage'),
  validateRequest(webhookSignatureSchema),
  WebhookSecurityController.updateWebhookSignature
);

export default router;
