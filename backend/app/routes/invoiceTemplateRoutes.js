import express from 'express';
import { invoiceTemplateController } from '../controllers/invoiceTemplateController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// GET /api/invoice-templates - Get all templates (requires invoice_template:view permission)
router.get('/', requirePermission('invoice_template:view'), invoiceTemplateController.getAll);

// GET /api/invoice-templates/:id - Get template by ID (requires invoice_template:view permission)
router.get('/:id', requirePermission('invoice_template:view'), invoiceTemplateController.getById);

// POST /api/invoice-templates - Create template (requires invoice_template:create permission)
router.post('/', requirePermission('invoice_template:create'), invoiceTemplateController.create);

// PUT /api/invoice-templates/:id - Update template (requires invoice_template:update permission)
router.put('/:id', requirePermission('invoice_template:update'), invoiceTemplateController.update);

// DELETE /api/invoice-templates/:id - Delete template (requires invoice_template:delete permission)
router.delete('/:id', requirePermission('invoice_template:delete'), invoiceTemplateController.delete);

export default router;
