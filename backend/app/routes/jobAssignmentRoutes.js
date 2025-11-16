import express from 'express';
import { jobAssignmentController } from '../controllers/jobAssignmentController.js';
import {
  createJobAssignmentSchema,
  createWorkflowHandoffSchema,
  updateJobAssignmentSchema
} from '../schemas/departmentSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Job Assignment Routes
router.post(
  '/assign',
  requirePermission('job_assignments:create'),
  validateRequest(createJobAssignmentSchema),
  jobAssignmentController.assignJobToDepartment
);

router.post(
  '/handoff',
  requirePermission('workflow:handoff'),
  validateRequest(createWorkflowHandoffSchema),
  jobAssignmentController.processDepartmentHandoff
);

router.get(
  '/job/:jobId',
  requirePermission('job_assignments:read'),
  jobAssignmentController.getJobAssignments
);

router.get(
  '/department/:departmentId',
  requirePermission('job_assignments:read'),
  jobAssignmentController.getDepartmentAssignments
);

router.put(
  '/:id',
  requirePermission('job_assignments:update'),
  validateRequest(updateJobAssignmentSchema),
  jobAssignmentController.updateJobAssignment
);

export default router;
