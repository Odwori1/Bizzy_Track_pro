import express from 'express';
import { packageController } from '../controllers/packageController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { createPackageSchema, updatePackageSchema } from '../schemas/packageSchemas.js';

const router = express.Router();

// Validation middleware
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errorMessages
      });
    }

    req.body = value;
    next();
  };
};

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// ============================================================================
// EXISTING PACKAGE CRUD ROUTES
// ============================================================================

// GET /api/packages - Get all packages (requires package:read permission)
router.get('/', requirePermission('package:read'), packageController.getAll);

// GET /api/packages/categories - Get package categories (requires package:read permission)
router.get('/categories', requirePermission('package:read'), packageController.getCategories);

// GET /api/packages/:id - Get package by ID (requires package:read permission)
router.get('/:id', requirePermission('package:read'), packageController.getById);

// POST /api/packages - Create new package (requires package:create permission)
router.post(
  '/',
  requirePermission('package:create'),
  validateRequest(createPackageSchema),
  packageController.create
);

// PUT /api/packages/:id - Update package (requires package:update permission)
router.put(
  '/:id',
  requirePermission('package:update'),
  validateRequest(updatePackageSchema),
  packageController.update
);

// DELETE /api/packages/:id - Delete package (requires package:delete permission)
router.delete('/:id', requirePermission('package:delete'), packageController.delete);

// ============================================================================
// NEW PACKAGE DECONSTRUCTION ROUTES
// ============================================================================

// POST /api/packages/:id/validate-deconstruction - Validate package deconstruction
router.post(
  '/:id/validate-deconstruction',
  requirePermission('package:deconstruct'),
  packageController.validateDeconstruction
);

// GET /api/packages/:id/deconstruction-rules - Get package deconstruction rules
router.get(
  '/:id/deconstruction-rules',
  requirePermission('package:read'),
  packageController.getDeconstructionRules
);

// PUT /api/packages/:id/deconstruction-rules - Update package deconstruction rules
router.put(
  '/:id/deconstruction-rules',
  requirePermission('package:rules:manage'),
  packageController.updateDeconstructionRules
);

// GET /api/packages/customizable - Get only customizable packages
router.get(
  '/filter/customizable',
  requirePermission('package:read'),
  packageController.getCustomizablePackages
);

export default router;
