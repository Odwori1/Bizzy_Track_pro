import express from 'express';
import { inventoryController } from '../controllers/inventoryController.js';
import {
  createInventoryCategorySchema,
  createInventoryItemSchema,
  createInventoryMovementSchema,
  inventoryQuerySchema
} from '../schemas/inventorySchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// NEW: Inventory Overview Dashboard
router.get(
  '/',
  requirePermission('inventory:read'),
  inventoryController.getOverview
);

// Inventory Categories
router.post(
  '/categories',
  requirePermission('inventory:create'),
  validateRequest(createInventoryCategorySchema),
  inventoryController.createCategory
);

router.get(
  '/categories',
  requirePermission('inventory:read'),
  inventoryController.getCategories
);

// Inventory Items
router.post(
  '/items',
  requirePermission('inventory:create'),
  validateRequest(createInventoryItemSchema),
  inventoryController.createItem
);

router.get(
  '/items',
  requirePermission('inventory:read'),
  validateRequest(inventoryQuerySchema, 'query'),
  inventoryController.getItems
);

// Inventory Movements
router.post(
  '/movements',
  requirePermission('inventory:update'),
  validateRequest(createInventoryMovementSchema),
  inventoryController.recordMovement
);

// Inventory Reports
router.get(
  '/low-stock-alerts',
  requirePermission('inventory:read'),
  inventoryController.getLowStockAlerts
);

router.get(
  '/statistics',
  requirePermission('inventory:read'),
  inventoryController.getStatistics
);

export default router;
