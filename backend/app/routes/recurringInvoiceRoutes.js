import express from 'express';
import { recurringInvoiceController } from '../controllers/recurringInvoiceController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// GET /api/recurring-invoices - Get all recurring invoices (requires recurring_invoice:view permission)
router.get('/', requirePermission('recurring_invoice:view'), recurringInvoiceController.getAll);

// GET /api/recurring-invoices/:id - Get recurring invoice by ID (requires recurring_invoice:view permission)
router.get('/:id', requirePermission('recurring_invoice:view'), recurringInvoiceController.getById);

// POST /api/recurring-invoices - Create recurring invoice (requires recurring_invoice:create permission)
router.post('/', requirePermission('recurring_invoice:create'), recurringInvoiceController.create);

// PUT /api/recurring-invoices/:id - Update recurring invoice (requires recurring_invoice:update permission)
router.put('/:id', requirePermission('recurring_invoice:update'), recurringInvoiceController.update);

// DELETE /api/recurring-invoices/:id - Delete recurring invoice (requires recurring_invoice:delete permission)
router.delete('/:id', requirePermission('recurring_invoice:delete'), recurringInvoiceController.delete);

// POST /api/recurring-invoices/:id/pause - Pause recurring invoice (requires recurring_invoice:pause permission)
router.post('/:id/pause', requirePermission('recurring_invoice:pause'), recurringInvoiceController.pause);

// POST /api/recurring-invoices/:id/resume - Resume recurring invoice (requires recurring_invoice:resume permission)
router.post('/:id/resume', requirePermission('recurring_invoice:resume'), recurringInvoiceController.resume);

export default router;
