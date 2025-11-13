import express from 'express';
import { invoiceController } from '../controllers/invoiceController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  recordPaymentSchema
} from '../schemas/invoiceSchemas.js';

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

// GET /api/invoices - Get all invoices (requires invoice:read permission)
router.get('/', requirePermission('invoice:read'), invoiceController.getAll);

// GET /api/invoices/:id - Get invoice by ID (requires invoice:read permission)
router.get('/:id', requirePermission('invoice:read'), invoiceController.getById);

// POST /api/invoices - Create new invoice (requires invoice:create permission)
router.post(
  '/',
  requirePermission('invoice:create'),
  validateRequest(createInvoiceSchema),
  invoiceController.create
);

// PATCH /api/invoices/:id/status - Update invoice status (requires invoice:update permission)
router.patch(
  '/:id/status',
  requirePermission('invoice:update'),
  invoiceController.updateStatus
);

// POST /api/invoices/:id/payment - Record invoice payment (requires invoice:update permission - FIXED)
router.post(
  '/:id/payment',
  requirePermission('invoice:update'), // Changed from invoice:payment:record to invoice:update
  validateRequest(recordPaymentSchema),
  invoiceController.recordPayment
);

export default router;
