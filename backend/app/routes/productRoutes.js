import express from 'express';
import { productController } from '../controllers/productController.js';
import {
  createProductSchema,
  updateProductSchema,
  createProductVariantSchema,
  productQuerySchema
} from '../schemas/productSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Product Routes
router.post(
  '/',
  requirePermission('products:create'),
  validateRequest(createProductSchema),
  productController.createProduct
);

router.get(
  '/',
  requirePermission('products:read'),
  validateRequest(productQuerySchema, 'query'),
  productController.getProducts
);

router.get(
  '/:id',
  requirePermission('products:read'),
  productController.getProductById
);

router.put(
  '/:id',
  requirePermission('products:update'),
  validateRequest(updateProductSchema),
  productController.updateProduct
);

// Product Variant Routes
router.post(
  '/variants',
  requirePermission('products:manage_variants'),
  validateRequest(createProductVariantSchema),
  productController.createProductVariant
);

router.get(
  '/:productId/variants',
  requirePermission('products:read'),
  productController.getProductVariants
);

// Product Reports
router.get(
  '/reports/statistics',
  requirePermission('products:read'),
  productController.getStatistics
);

export default router;
