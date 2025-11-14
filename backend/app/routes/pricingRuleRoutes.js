import express from 'express';
import { pricingRuleController } from '../controllers/pricingRuleController.js';
import { 
  createPricingRuleSchema, 
  updatePricingRuleSchema, 
  evaluatePricingSchema,
  evaluatePricingWithABACSchema,
  bulkUpdateStatusSchema,
  pricingRuleQuerySchema
} from '../schemas/pricingRuleSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// =============================================
// PRICING RULE CRUD OPERATIONS
// =============================================

// Create pricing rule
router.post(
  '/',
  requirePermission('pricing_rule:create'),
  validateRequest(createPricingRuleSchema),
  pricingRuleController.create
);

// Get all pricing rules (with optional query filters)
router.get(
  '/',
  requirePermission('pricing_rule:read'),
  validateRequest(pricingRuleQuerySchema, 'query'),
  pricingRuleController.getAll
);

// Get active pricing rules only
router.get(
  '/active',
  requirePermission('pricing_rule:read'),
  pricingRuleController.getActiveRules
);

// Get specific pricing rule
router.get(
  '/:id',
  requirePermission('pricing_rule:read'),
  pricingRuleController.getById
);

// Update pricing rule
router.put(
  '/:id',
  requirePermission('pricing_rule:update'),
  validateRequest(updatePricingRuleSchema),
  pricingRuleController.update
);

// Delete pricing rule
router.delete(
  '/:id',
  requirePermission('pricing_rule:delete'),
  pricingRuleController.delete
);

// =============================================
// PRICING EVALUATION ENDPOINTS
// =============================================

// Evaluate pricing rules (basic)
router.post(
  '/evaluate',
  requirePermission('pricing_rule:read'),
  validateRequest(evaluatePricingSchema),
  pricingRuleController.evaluate
);

// Evaluate pricing with ABAC integration
router.post(
  '/evaluate-with-abac',
  requirePermission('pricing_rule:read'),
  validateRequest(evaluatePricingWithABACSchema),
  pricingRuleController.evaluateWithABAC
);

// =============================================
// STATISTICS & REPORTING
// =============================================

// Get pricing rules statistics
router.get(
  '/stats/summary',
  requirePermission('pricing_rule:read'),
  pricingRuleController.getStats
);

// =============================================
// BULK OPERATIONS
// =============================================

// Bulk update pricing rule status
router.patch(
  '/bulk/status',
  requirePermission('pricing_rule:update'),
  validateRequest(bulkUpdateStatusSchema),
  pricingRuleController.bulkUpdateStatus
);

export default router;
