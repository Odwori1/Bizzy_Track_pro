// backend/app/routes/departmentWorkflowRoutes.js
import express from 'express';
import { departmentWorkflowController } from '../controllers/departmentWorkflowController.js';
import {
  createHandoffSchema,
  acceptHandoffSchema,
  rejectHandoffSchema,
  handoffQuerySchema
} from '../schemas/departmentWorkflowSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Department Workflow Routes
router.post(
  '/handoff',
  requirePermission('workflow:handoff'),
  validateRequest(createHandoffSchema),
  departmentWorkflowController.createHandoff
);

router.put(
  '/:id/accept',
  requirePermission('workflow:accept'),
  validateRequest(acceptHandoffSchema),
  departmentWorkflowController.acceptHandoff
);

router.put(
  '/:id/reject',
  requirePermission('workflow:escalate'), // Using escalate permission for reject
  validateRequest(rejectHandoffSchema),
  departmentWorkflowController.rejectHandoff
);

router.get(
  '/job/:jobId',
  requirePermission('workflow:manage'),
  departmentWorkflowController.getJobWorkflow
);

router.get(
  '/department/:departmentId',
  requirePermission('workflow:manage'),
  validateRequest(handoffQuerySchema, 'query'),
  departmentWorkflowController.getDepartmentHandoffs
);

router.get(
  '/pending',
  requirePermission('workflow:manage'),
  departmentWorkflowController.getPendingHandoffs
);

export default router;
