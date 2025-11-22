import express from 'express';
import { serviceCategoryController } from '../controllers/serviceCategoryController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { createServiceCategorySchema, updateServiceCategorySchema } from '../schemas/serviceCategorySchemas.js';

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

// GET /api/service-categories - Get all service categories (requires service_category:read permission)
router.get('/', requirePermission('service_category:read'), serviceCategoryController.getAll);

// GET /api/service-categories/:id - Get service category by ID (requires service_category:read permission)
router.get('/:id', requirePermission('service_category:read'), serviceCategoryController.getById);

// POST /api/service-categories - Create new service category (requires service_category:create permission)
router.post(
  '/',
  requirePermission('service_category:create'),
  validateRequest(createServiceCategorySchema),
  serviceCategoryController.create
);

// PUT /api/service-categories/:id - Update service category (requires service_category:update permission)
router.put(
  '/:id',
  requirePermission('service_category:update'),
  validateRequest(updateServiceCategorySchema),
  serviceCategoryController.update
);

// DELETE /api/service-categories/:id - Delete service category (requires service_category:delete permission)
router.delete('/:id', requirePermission('service_category:delete'), serviceCategoryController.delete);

export default router;
