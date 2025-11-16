import { Router } from 'express';
import { AnalyticsController } from '../controllers/analyticsController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import { 
  createAnalyticsDashboardSchema,
  createCustomerSegmentSchema,
  createExportJobSchema,
  analyticsQuerySchema
} from '../schemas/analyticsSchemas.js';

const router = Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Analytics Dashboard routes
router.post(
  '/dashboards',
  requirePermission('analytics:configure'),
  validateRequest(createAnalyticsDashboardSchema),
  AnalyticsController.createAnalyticsDashboard
);

router.get(
  '/dashboards',
  requirePermission('analytics:view'),
  validateRequest(analyticsQuerySchema, 'query'),
  AnalyticsController.getAnalyticsDashboards
);

// Customer Segmentation routes
router.post(
  '/customer-segments',
  requirePermission('behavioral_analytics:manage'),
  validateRequest(createCustomerSegmentSchema),
  AnalyticsController.createCustomerSegment
);

router.get(
  '/customer-segments',
  requirePermission('behavioral_analytics:view'),
  validateRequest(analyticsQuerySchema, 'query'),
  AnalyticsController.getCustomerSegments
);

// Business Overview routes
router.get(
  '/business-overview',
  requirePermission('analytics:view'),
  validateRequest(analyticsQuerySchema, 'query'),
  AnalyticsController.getBusinessOverview
);

// Export routes
router.post(
  '/export',
  requirePermission('data_export:csv'),
  validateRequest(createExportJobSchema),
  AnalyticsController.createExportJob
);

router.get(
  '/export-jobs',
  requirePermission('data_export:csv'),
  validateRequest(analyticsQuerySchema, 'query'),
  AnalyticsController.getExportJobs
);

export default router;
