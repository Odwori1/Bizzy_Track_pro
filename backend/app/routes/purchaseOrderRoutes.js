import express from 'express';
import { purchaseOrderController } from '../controllers/purchaseOrderController.js';
import {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  purchaseOrderQuerySchema
} from '../schemas/purchaseOrderSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Purchase Order Routes
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

export default router;
