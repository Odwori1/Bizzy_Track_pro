import express from 'express';
import { departmentPerformanceController } from '../controllers/departmentPerformanceController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Department Performance Routes
router.get(
  '/',
  requirePermission('department_analytics:view'),
  departmentPerformanceController.getDepartmentPerformance
);

router.get(
  '/department/:departmentId',
  requirePermission('department_analytics:view'),
  departmentPerformanceController.getDepartmentPerformanceById
);

router.get(
  '/metrics',
  requirePermission('department_analytics:view'),
  departmentPerformanceController.getDepartmentMetrics
);

export default router;
