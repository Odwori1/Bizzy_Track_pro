import { Router } from 'express';
import { JobRoutingController } from '../controllers/jobRoutingController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// SLA Configuration routes
router.post(
  '/sla-configurations',
  requirePermission('sla:manage'),
  JobRoutingController.createSLAConfiguration
);

router.get(
  '/sla-configurations',
  requirePermission('sla:view'),
  JobRoutingController.getSLAConfigurations
);

// Job Routing Rules routes
router.post(
  '/routing-rules',
  requirePermission('job_routing:configure'),
  JobRoutingController.createJobRoutingRule
);

router.get(
  '/routing-rules',
  requirePermission('job_routing:view'),
  JobRoutingController.getJobRoutingRules
);

// Auto-assignment routes
router.post(
  '/jobs/:jobId/auto-assign',
  requirePermission('job_routing:configure'),
  JobRoutingController.autoAssignJob
);

export default router;
