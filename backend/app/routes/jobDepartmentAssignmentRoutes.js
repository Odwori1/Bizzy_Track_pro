import express from 'express';
import { jobDepartmentAssignmentController } from '../controllers/jobDepartmentAssignmentController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Job Department Assignment Routes
router.post(
  '/',
  requirePermission('department-assignments:create'),
  jobDepartmentAssignmentController.createAssignment
);

router.get(
  '/',
  requirePermission('department-assignments:read'),
  jobDepartmentAssignmentController.getAssignments
);

router.get(
  '/job/:jobId',
  requirePermission('department-assignments:read'),
  jobDepartmentAssignmentController.getAssignmentsByJob
);

router.get(
  '/department/:departmentId',
  requirePermission('department-assignments:read'),
  jobDepartmentAssignmentController.getAssignmentsByDepartment
);

router.get(
  '/:id',
  requirePermission('department-assignments:read'),
  jobDepartmentAssignmentController.getAssignmentById
);

router.put(
  '/:id',
  requirePermission('department-assignments:update'),
  jobDepartmentAssignmentController.updateAssignment
);

router.delete(
  '/:id',
  requirePermission('department-assignments:delete'),
  jobDepartmentAssignmentController.deleteAssignment
);

export default router;
