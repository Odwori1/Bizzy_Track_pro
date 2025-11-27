import express from 'express';
import db from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

router.use(authenticate, setRLSContext);

// Get sales performance over time
router.get('/performance', requirePermission('reports:read'), async (req, res) => {
  try {
    const { businessId } = req.user;
    const { period = 'week', start_date, end_date } = req.query;

    let dateRange = '';
    const params = [businessId];

    if (start_date && end_date) {
      dateRange = `AND t.transaction_date BETWEEN $2 AND $3`;
      params.push(start_date, end_date);
    } else {
      // Default to last 30 days
      dateRange = `AND t.transaction_date >= CURRENT_DATE - INTERVAL '30 days'`;
    }

    const query = `
      SELECT 
        DATE(t.transaction_date) as date,
        COUNT(*) as transaction_count,
        SUM(t.final_amount) as total_sales,
        AVG(t.final_amount) as average_sale,
        COUNT(DISTINCT t.customer_id) as unique_customers
      FROM pos_transactions t
      WHERE t.business_id = $1 
        AND t.status = 'completed'
        ${dateRange}
      GROUP BY DATE(t.transaction_date)
      ORDER BY date DESC
      LIMIT 30
    `;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      message: 'Sales performance data fetched successfully'
    });
  } catch (error) {
    console.error('Sales performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales performance',
      error: error.message
    });
  }
});

// Get top products/services
router.get('/top-items', requirePermission('reports:read'), async (req, res) => {
  try {
    const { businessId } = req.user;
    const { limit = 10, start_date, end_date } = req.query;

    const params = [businessId, limit];
    let dateRange = '';

    if (start_date && end_date) {
      dateRange = `AND t.transaction_date BETWEEN $3 AND $4`;
      params.push(start_date, end_date);
    }

    const query = `
      SELECT 
        ti.item_name,
        ti.item_type,
        SUM(ti.quantity) as total_quantity,
        SUM(ti.total_price) as total_revenue,
        COUNT(DISTINCT t.id) as transaction_count
      FROM pos_transaction_items ti
      JOIN pos_transactions t ON ti.pos_transaction_id = t.id
      WHERE t.business_id = $1 
        AND t.status = 'completed'
        ${dateRange}
      GROUP BY ti.item_name, ti.item_type
      ORDER BY total_revenue DESC
      LIMIT $2
    `;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      message: 'Top items data fetched successfully'
    });
  } catch (error) {
    console.error('Top items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top items',
      error: error.message
    });
  }
});

// Get payment method analytics
router.get('/payment-methods', requirePermission('reports:read'), async (req, res) => {
  try {
    const { businessId } = req.user;
    const { start_date, end_date } = req.query;

    const params = [businessId];
    let dateRange = '';

    if (start_date && end_date) {
      dateRange = `AND transaction_date BETWEEN $2 AND $3`;
      params.push(start_date, end_date);
    }

    const query = `
      SELECT 
        payment_method,
        COUNT(*) as transaction_count,
        SUM(final_amount) as total_amount,
        ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM pos_transactions WHERE business_id = $1 ${dateRange} AND status = 'completed')), 2) as percentage
      FROM pos_transactions 
      WHERE business_id = $1 
        AND status = 'completed'
        ${dateRange}
      GROUP BY payment_method
      ORDER BY total_amount DESC
    `;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      message: 'Payment method analytics fetched successfully'
    });
  } catch (error) {
    console.error('Payment method analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment method analytics',
      error: error.message
    });
  }
});

export default router;
