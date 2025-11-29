import express from 'express';
import { posController } from '../controllers/posController.js';
import {
  createPOSTransactionSchema,
  updatePOSTransactionSchema,
  posQuerySchema
} from '../schemas/posSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// POS Transaction Routes
router.post(
  '/transactions',
  requirePermission('pos:create'),
  validateRequest(createPOSTransactionSchema),
  posController.createTransaction
);

router.get(
  '/transactions',
  requirePermission('pos:read'),
  validateRequest(posQuerySchema, 'query'),
  posController.getTransactions
);

router.get(
  '/transactions/:id',
  requirePermission('pos:read'),
  posController.getTransactionById
);

router.put(
  '/transactions/:id',
  requirePermission('pos:update'),
  validateRequest(updatePOSTransactionSchema),
  posController.updateTransaction
);

// POS Reports
router.get(
  '/analytics/sales',
  requirePermission('pos:read'),
  posController.getSalesAnalytics
);

router.get(
  '/analytics/today-sales',
  requirePermission('pos:read'),
  posController.getTodaySales
);

router.delete(
  '/transactions/:id',
  requirePermission('pos:delete'),
  posController.deleteTransaction
);

export default router;
