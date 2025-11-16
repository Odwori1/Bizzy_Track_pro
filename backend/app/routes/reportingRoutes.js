import { Router } from 'express';
import { ReportingController } from '../controllers/reportingController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import { 
  createScheduledReportSchema,
  analyticsQuerySchema
} from '../schemas/analyticsSchemas.js';

const router = Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Scheduled Reports routes
router.post(
  '/scheduled-reports',
  requirePermission('reports:schedule'),
  validateRequest(createScheduledReportSchema),
  ReportingController.createScheduledReport
);

router.get(
  '/scheduled-reports',
  requirePermission('reports:view'),
  validateRequest(analyticsQuerySchema, 'query'),
  ReportingController.getScheduledReports
);

// Report Generation routes
router.get(
  '/financial',
  requirePermission('reports:generate'),
  validateRequest(analyticsQuerySchema, 'query'),
  ReportingController.generateFinancialReport
);

router.get(
  '/customer',
  requirePermission('reports:generate'),
  validateRequest(analyticsQuerySchema, 'query'),
  ReportingController.generateCustomerReport
);

export default router;
