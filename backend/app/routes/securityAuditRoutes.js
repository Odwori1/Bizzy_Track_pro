import { Router } from 'express';
import { SecurityAuditController } from '../controllers/securityAuditController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import {
  createSecurityScanSchema,
  createComplianceFrameworkSchema
} from '../schemas/securityAuditSchemas.js';

const router = Router();

// Apply authentication and RLS context to all routes
router.use(authenticate, setRLSContext);

// Security scans
router.post(
  '/audits/permission-audit',
  requirePermission('security_audit:run'),
  SecurityAuditController.runPermissionAudit
);

router.get(
  '/audits/scans',
  requirePermission('security_audit:view'),
  SecurityAuditController.getSecurityScans
);

// NEW ROUTES FOR WEEK 16 COMPLETION
router.get(
  '/audits/metrics',
  requirePermission('security_audit:view'),
  SecurityAuditController.getSecurityMetrics
);

router.post(
  '/audits/verify-audit-trail',
  requirePermission('security_audit:run'),
  SecurityAuditController.verifyAuditTrail
);

router.get(
  '/audits/analytics',
  requirePermission('security_analytics:view'),
  SecurityAuditController.getSecurityAnalytics
);

router.post(
  '/audits/compliance-event',
  requirePermission('compliance:audit'),
  SecurityAuditController.logComplianceEvent
);

// Compliance frameworks
router.post(
  '/compliance/frameworks',
  requirePermission('compliance:manage'),
  validateRequest(createComplianceFrameworkSchema),
  SecurityAuditController.createComplianceFramework
);

router.get(
  '/compliance/frameworks',
  requirePermission('compliance:view'),
  SecurityAuditController.getComplianceFrameworks
);

export default router;
