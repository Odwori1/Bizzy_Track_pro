import express from 'express';
import { customerController } from '../controllers/customerController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { createCustomerSchema, updateCustomerSchema } from '../schemas/customerSchemas.js';

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

// GET /api/customers - Get all customers (requires customer:read permission)
router.get('/', requirePermission('customer:read'), customerController.getAll);

// GET /api/customers/search - Search customers (requires customer:read permission)
router.get('/search', requirePermission('customer:read'), customerController.search);

// GET /api/customers/:id - Get customer by ID (requires customer:read permission)
router.get('/:id', requirePermission('customer:read'), customerController.getById);

// POST /api/customers - Create new customer (requires customer:create permission)
router.post(
  '/', 
  requirePermission('customer:create'),
  validateRequest(createCustomerSchema),
  customerController.create
);

// PUT /api/customers/:id - Update customer (requires customer:update permission)
router.put(
  '/:id',
  requirePermission('customer:update'),
  validateRequest(updateCustomerSchema),
  customerController.update
);

// DELETE /api/customers/:id - Delete customer (requires customer:delete permission)
router.delete('/:id', requirePermission('customer:delete'), customerController.delete);

export default router;
