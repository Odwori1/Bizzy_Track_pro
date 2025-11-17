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
