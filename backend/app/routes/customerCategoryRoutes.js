import express from 'express';
import { customerCategoryController } from '../controllers/customerCategoryController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { createCustomerCategorySchema, updateCustomerCategorySchema } from '../schemas/customerCategorySchemas.js';

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

// GET /api/customer-categories - Get all categories (requires category:read permission)
router.get('/', requirePermission('category:read'), customerCategoryController.getAll);

// GET /api/customer-categories/:id - Get category by ID (requires category:read permission)
router.get('/:id', requirePermission('category:read'), customerCategoryController.getById);

// POST /api/customer-categories - Create new category (requires category:create permission)
router.post(
  '/', 
  requirePermission('category:create'),
  validateRequest(createCustomerCategorySchema),
  customerCategoryController.create
);

// PUT /api/customer-categories/:id - Update category (requires category:update permission)
router.put(
  '/:id',
  requirePermission('category:update'),
  validateRequest(updateCustomerCategorySchema),
  customerCategoryController.update
);

// DELETE /api/customer-categories/:id - Delete category (requires category:delete permission)
router.delete('/:id', requirePermission('category:delete'), customerCategoryController.delete);

export default router;
