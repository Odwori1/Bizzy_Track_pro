import express from 'express';
import { supplierController } from '../controllers/supplierController.js';
import {
  createSupplierSchema,
  updateSupplierSchema,
  supplierQuerySchema
} from '../schemas/supplierSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Supplier Routes
router.post(
  '/',
  requirePermission('suppliers:create'),
  validateRequest(createSupplierSchema),
  supplierController.createSupplier
);

router.get(
  '/',
  requirePermission('suppliers:read'),
  validateRequest(supplierQuerySchema, 'query'),
  supplierController.getSuppliers
);

router.get(
  '/:id',
  requirePermission('suppliers:read'),
  supplierController.getSupplierById
);

router.put(
  '/:id',
  requirePermission('suppliers:update'),
  validateRequest(updateSupplierSchema),
  supplierController.updateSupplier
);

// Supplier Reports
router.get(
  '/reports/statistics',
  requirePermission('suppliers:read'),
  supplierController.getStatistics
);

export default router;
