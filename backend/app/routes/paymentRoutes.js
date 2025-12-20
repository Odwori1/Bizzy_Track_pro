import express from 'express';
import { getClient } from '../utils/database.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';

const router = express.Router();

router.use(authenticate, setRLSContext);

// POST /api/payments/record-payment - Record payment for an invoice
router.post('/record-payment', async (req, res) => {
  const client = await getClient();
  
  try {
    const { invoice_id, amount, payment_method, reference, notes } = req.body;
    const businessId = req.user.business_id;
    const userId = req.user.id;

    // Validate invoice exists and belongs to business
    const invoiceCheck = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND business_id = $2`,
      [invoice_id, businessId]
    );

    if (invoiceCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    const invoice = invoiceCheck.rows[0];

    // Record payment
    await client.query('BEGIN');

    // Insert payment record
    const paymentResult = await client.query(
      `INSERT INTO payments (
        business_id, invoice_id, amount, payment_method,
        reference, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [businessId, invoice_id, amount, payment_method, reference, notes, userId]
    );

    // Update invoice payment status
    const newAmountPaid = parseFloat(invoice.amount_paid || 0) + parseFloat(amount);
    const newBalanceDue = parseFloat(invoice.total_amount) - newAmountPaid;
    const newStatus = newBalanceDue <= 0 ? 'paid' : 'partial';

    await client.query(
      `UPDATE invoices 
       SET amount_paid = $1, balance_due = $2, status = $3
       WHERE id = $4`,
      [newAmountPaid, newBalanceDue, newStatus, invoice_id]
    );

    // Update job status if fully paid
    if (newStatus === 'paid' && invoice.job_id) {
      await client.query(
        `UPDATE jobs SET status = 'completed' WHERE id = $1`,
        [invoice.job_id]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        payment: paymentResult.rows[0],
        invoice: {
          ...invoice,
          amount_paid: newAmountPaid,
          balance_due: newBalanceDue,
          status: newStatus
        }
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error recording payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record payment'
    });
  } finally {
    client.release();
  }
});

// GET /api/payments/invoice/:id - Get payments for an invoice
router.get('/invoice/:id', async (req, res) => {
  const client = await getClient();
  
  try {
    const { id } = req.params;
    const businessId = req.user.business_id;

    const payments = await client.query(
      `SELECT p.*, u.first_name, u.last_name 
       FROM payments p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.business_id = $1 AND p.invoice_id = $2
       ORDER BY p.created_at DESC`,
      [businessId, id]
    );

    res.json({
      success: true,
      data: payments.rows
    });

  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payments'
    });
  } finally {
    client.release();
  }
});

export default router;
