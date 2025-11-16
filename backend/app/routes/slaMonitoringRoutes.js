import { Router } from 'express';
import { SLAMonitoringController } from '../controllers/slaMonitoringController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// SLA Monitoring routes
router.get(
  '/violations/check',
  requirePermission('sla:view'),
  SLAMonitoringController.checkSLAViolations
);

router.get(
  '/violations/stats',
  requirePermission('sla:view'),
  SLAMonitoringController.getSLAViolationStats
);

router.get(
  '/violations/active',
  requirePermission('sla:view'),
  SLAMonitoringController.getActiveViolations
);

router.put(
  '/violations/:violationId/escalate',
  requirePermission('sla:escalate'),
  SLAMonitoringController.escalateViolation
);

export default router;
