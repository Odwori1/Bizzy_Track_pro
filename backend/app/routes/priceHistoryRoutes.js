import express from 'express';
import { priceHistoryController } from '../controllers/priceHistoryController.js';
import { validateRequest } from '../middleware/validation.js';
import {
  priceHistoryQuerySchema,
  businessPriceHistoryQuerySchema,
  priceHistoryStatsSchema,
  priceChangeSummarySchema,
  exportPriceHistorySchema
} from '../schemas/priceHistorySchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// =============================================
// PRICE HISTORY READ OPERATIONS
// =============================================

// Get price history for a specific entity (service or package)
router.get(
  '/entity/:entityType/:entityId',
  requirePermission('price_history:read'),
  validateRequest(priceHistoryQuerySchema, 'query'),
  priceHistoryController.getByEntity
);

// Get price history for entire business with filters
router.get(
  '/business',
  requirePermission('price_history:read'),
  validateRequest(businessPriceHistoryQuerySchema, 'query'),
  priceHistoryController.getByBusiness
);

// Get price change summary for a specific entity
router.get(
  '/entity/:entityType/:entityId/summary',
  requirePermission('price_history:read'),
  validateRequest(priceChangeSummarySchema, 'query'),
  priceHistoryController.getChangeSummary
);

// =============================================
// STATISTICS & ANALYTICS
// =============================================

// Get price history statistics
router.get(
  '/stats/summary',
  requirePermission('price_history:read'),
  validateRequest(priceHistoryStatsSchema, 'query'),
  priceHistoryController.getStats
);

// =============================================
// EXPORT FUNCTIONALITY
// =============================================

// Export price history data
router.get(
  '/export',
  requirePermission('price_history:read'),
  validateRequest(exportPriceHistorySchema, 'query'),
  priceHistoryController.exportPriceHistory
);

export default router;
