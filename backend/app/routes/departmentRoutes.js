import express from 'express';
import { departmentController } from '../controllers/departmentController.js';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  departmentQuerySchema
} from '../schemas/departmentSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Department Routes
router.post(
  '/',
  requirePermission('departments:create'),
  validateRequest(createDepartmentSchema),
  departmentController.createDepartment
);

router.get(
  '/',
  requirePermission('departments:read'),
  validateRequest(departmentQuerySchema, 'query'),
  departmentController.getDepartments
);

router.get(
  '/hierarchy',
  requirePermission('departments:read'),
  departmentController.getDepartmentHierarchy
);

router.get(
  '/:id',
  requirePermission('departments:read'),
  departmentController.getDepartmentById
);

router.put(
  '/:id',
  requirePermission('departments:update'),
  validateRequest(updateDepartmentSchema),
  departmentController.updateDepartment
);

router.delete(
  '/:id',
  requirePermission('departments:delete'),
  departmentController.deleteDepartment
);

export default router;
