import express from 'express';
import { customerCommunicationController } from '../controllers/customerCommunicationController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { createCustomerCommunicationSchema, updateCustomerCommunicationSchema } from '../schemas/customerCommunicationSchemas.js';

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

// GET /api/customer-communications - Get all communications (requires customer_communication:read permission)
router.get('/', requirePermission('customer_communication:read'), customerCommunicationController.getAll);

// GET /api/customer-communications/customer/:customerId - Get communications by customer (requires customer_communication:read permission)
router.get('/customer/:customerId', requirePermission('customer_communication:read'), customerCommunicationController.getByCustomerId);

// GET /api/customer-communications/:id - Get communication by ID (requires customer_communication:read permission)
router.get('/:id', requirePermission('customer_communication:read'), customerCommunicationController.getById);

// POST /api/customer-communications - Create new communication (requires customer_communication:create permission)
router.post(
  '/',
  requirePermission('customer_communication:create'),
  validateRequest(createCustomerCommunicationSchema),
  customerCommunicationController.create
);

// PUT /api/customer-communications/:id - Update communication (requires customer_communication:update permission)
router.put(
  '/:id',
  requirePermission('customer_communication:update'),
  validateRequest(updateCustomerCommunicationSchema),
  customerCommunicationController.update
);

// DELETE /api/customer-communications/:id - Delete communication (requires customer_communication:delete permission)
router.delete('/:id', requirePermission('customer_communication:delete'), customerCommunicationController.delete);

export default router;
