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
import { getClient } from '../utils/database.js';

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

// GET /api/invoices/consolidated/:id - Get consolidated invoice details with department breakdown
router.get('/consolidated/:id', requirePermission('invoice:read'), async (req, res) => {
  const client = await getClient();
  
  try {
    const { id } = req.params;
    const businessId = req.user?.business_id || req.user?.businessId;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    // Get invoice with job and service details
    const invoiceQuery = await client.query(`
      SELECT 
        i.*,
        j.job_number,
        j.title as job_title,
        j.final_price as service_price,
        s.name as service_name,
        s.base_price as service_base_price,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name,
        c.email as customer_email,
        c.phone as customer_phone
      FROM invoices i
      LEFT JOIN jobs j ON i.job_id = j.id
      LEFT JOIN services s ON j.service_id = s.id
      LEFT JOIN customers c ON j.customer_id = c.id
      WHERE i.id = $1 AND i.business_id = $2
    `, [id, businessId]);

    if (invoiceQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    const invoice = invoiceQuery.rows[0];

    // Get line items
    const lineItemsQuery = await client.query(`
      SELECT 
        description,
        quantity,
        unit_price,
        tax_rate,
        created_at
      FROM invoice_line_items
      WHERE invoice_id = $1
      ORDER BY created_at
    `, [id]);

    // Get payments
    const paymentsQuery = await client.query(`
      SELECT 
        amount,
        payment_method,
        reference,
        notes,
        created_at,
        created_by
      FROM payments
      WHERE invoice_id = $1
      ORDER BY created_at DESC
    `, [id]);

    // For consolidated bills, get department breakdown
    let departmentBreakdown = [];
    if (invoice.job_id && invoice.invoice_number?.startsWith('CONS')) {
      const breakdownQuery = await client.query(`
        SELECT
          dbe.*,
          d.name as department_name,
          d.code as department_code,
          dbe.description,
          dbe.quantity,
          dbe.unit_price,
          dbe.total_amount,
          dbe.billing_type,
          dbe.cost_amount,
          dbe.is_billable
        FROM department_billing_entries dbe
        JOIN departments d ON dbe.department_id = d.id
        WHERE dbe.business_id = $1 AND dbe.job_id = $2
        ORDER BY d.name, dbe.billing_date
      `, [businessId, invoice.job_id]);

      departmentBreakdown = breakdownQuery.rows;

      // Calculate totals
      const departmentTotal = departmentBreakdown.reduce((sum, entry) =>
        sum + parseFloat(entry.total_amount || 0), 0
      );
      const servicePrice = parseFloat(invoice.service_price) || parseFloat(invoice.service_base_price) || 0;
      const profit = servicePrice - departmentTotal;

      invoice.department_breakdown = departmentBreakdown;
      invoice.department_total = departmentTotal;
      invoice.service_price = servicePrice;
      invoice.profit = profit;
    }

    res.json({
      success: true,
      data: {
        ...invoice,
        line_items: lineItemsQuery.rows,
        payments: paymentsQuery.rows,
        department_breakdown: departmentBreakdown
      }
    });
  } catch (error) {
    console.error('Error fetching consolidated invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoice details'
    });
  } finally {
    client.release();
  }
});

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
