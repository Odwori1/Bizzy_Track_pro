import express from 'express';
import { purchaseOrderController } from '../controllers/purchaseOrderController.js';
import {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  purchaseOrderQuerySchema,
  approvePurchaseOrderSchema,
  receivePurchaseOrderSchema,
  payPurchaseOrderSchema,
  purchaseOrderPaymentQuerySchema
} from '../schemas/purchaseOrderSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// ============================================================================
// EXISTING ROUTES
// ============================================================================
router.post(
  '/',
  requirePermission('purchase_orders:create'),
  validateRequest(createPurchaseOrderSchema),
  purchaseOrderController.createPurchaseOrder
);

router.get(
  '/',
  requirePermission('purchase_orders:read'),
  validateRequest(purchaseOrderQuerySchema, 'query'),
  purchaseOrderController.getPurchaseOrders
);

router.get(
  '/:id',
  requirePermission('purchase_orders:read'),
  purchaseOrderController.getPurchaseOrderById
);

// ============================================================================
// NEW: PURCHASE ORDER WORKFLOW ROUTES
// ============================================================================
router.post(
  '/:id/approve',
  requirePermission('purchase_orders:approve'),
  validateRequest(approvePurchaseOrderSchema),
  purchaseOrderController.approvePurchaseOrder
);

router.post(
  '/:id/receive',
  requirePermission('purchase_orders:receive'),
  validateRequest(receivePurchaseOrderSchema),
  purchaseOrderController.receivePurchaseOrder
);

router.post(
  '/:id/pay',
  requirePermission('purchase_orders:pay'),
  validateRequest(payPurchaseOrderSchema),
  purchaseOrderController.payPurchaseOrder
);

router.get(
  '/:id/payments',
  requirePermission('purchase_orders:read'),
  purchaseOrderController.getPurchaseOrderPayments
);

// ============================================================================
// NEW: REPORTS ROUTES
// ============================================================================
router.get(
  '/reports/ap-aging',
  requirePermission('purchase_orders:read'),
  purchaseOrderController.getApAgingReport
);

export default router;
