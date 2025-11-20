import express from 'express';
import { invoicePdfController } from '../controllers/invoicePdfController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// GET /api/invoices/:id/pdf - Generate PDF preview (requires invoice:view permission)
router.get('/:id/pdf', requirePermission('invoice:view'), invoicePdfController.generatePdf);

export default router;
