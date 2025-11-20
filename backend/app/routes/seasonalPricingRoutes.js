import express from 'express';
import { seasonalPricingController } from '../controllers/seasonalPricingController.js';
import { validateRequest } from '../middleware/validation.js';
import {
  createSeasonalPricingSchema,
  updateSeasonalPricingSchema,
  seasonalPricingQuerySchema,
  evaluateSeasonalPricingSchema,
  bulkUpdateSeasonalStatusSchema,
  seasonalPricingSearchSchema
} from '../schemas/seasonalPricingSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// =============================================
// SEASONAL PRICING CRUD OPERATIONS
// =============================================

// Create seasonal pricing rule
router.post(
  '/',
  requirePermission('seasonal_pricing:create'),
  validateRequest(createSeasonalPricingSchema),
  seasonalPricingController.create
);

// Get all seasonal pricing rules (with optional filters)
router.get(
  '/',
  requirePermission('seasonal_pricing:read'),
  validateRequest(seasonalPricingQuerySchema, 'query'),
  seasonalPricingController.getAll
);

// Get seasonal pricing rule by ID
router.get(
  '/:id',
  requirePermission('seasonal_pricing:read'),
  seasonalPricingController.getById
);

// Update seasonal pricing rule
router.put(
  '/:id',
  requirePermission('seasonal_pricing:update'),
  validateRequest(updateSeasonalPricingSchema),
  seasonalPricingController.update
);

// Delete seasonal pricing rule
router.delete(
  '/:id',
  requirePermission('seasonal_pricing:delete'),
  seasonalPricingController.delete
);

// =============================================
// SEASONAL PRICING EVALUATION & ANALYSIS
// =============================================

// Get active seasonal pricing for a specific service
router.get(
  '/service/:serviceId/active',
  requirePermission('seasonal_pricing:read'),
  seasonalPricingController.getActiveForService
);

// Evaluate seasonal pricing for a specific scenario
router.post(
  '/evaluate',
  requirePermission('seasonal_pricing:read'),
  validateRequest(evaluateSeasonalPricingSchema),
  seasonalPricingController.evaluateSeasonalPricing
);

// =============================================
// BULK OPERATIONS & STATISTICS
// =============================================

// Bulk update seasonal pricing rule status
router.patch(
  '/bulk/status',
  requirePermission('seasonal_pricing:update'),
  validateRequest(bulkUpdateSeasonalStatusSchema),
  seasonalPricingController.bulkUpdateStatus
);

// Get seasonal pricing statistics
router.get(
  '/stats/summary',
  requirePermission('seasonal_pricing:read'),
  seasonalPricingController.getStats
);

// =============================================
// SEARCH AND FILTER ENDPOINTS
// =============================================

// Advanced search for seasonal pricing rules
router.post(
  '/search',
  requirePermission('seasonal_pricing:read'),
  validateRequest(seasonalPricingSearchSchema),
  seasonalPricingController.getAll // Reuse getAll with search params
);

export default router;
