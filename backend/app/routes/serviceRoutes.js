import express from 'express';
import { serviceController } from '../controllers/serviceController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { createServiceSchema, updateServiceSchema } from '../schemas/serviceSchemas.js';

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

// GET /api/services - Get all services (requires service:read permission)
router.get('/', requirePermission('service:read'), serviceController.getAll);

// GET /api/services/categories - Get service categories (requires service:read permission)
router.get('/categories', requirePermission('service:read'), serviceController.getCategories);

// GET /api/services/:id - Get service by ID (requires service:read permission)
router.get('/:id', requirePermission('service:read'), serviceController.getById);

// POST /api/services - Create new service (requires service:create permission)
router.post(
  '/', 
  requirePermission('service:create'),
  validateRequest(createServiceSchema),
  serviceController.create
);

// PUT /api/services/:id - Update service (requires service:update permission)
router.put(
  '/:id',
  requirePermission('service:update'),
  validateRequest(updateServiceSchema),
  serviceController.update
);

// DELETE /api/services/:id - Delete service (requires service:delete permission)
router.delete('/:id', requirePermission('service:delete'), serviceController.delete);

export default router;
