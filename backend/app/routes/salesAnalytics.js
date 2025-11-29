import express from 'express';
import db from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

router.use(authenticate, setRLSContext);

// Helper function to build date range filter
const buildDateRangeFilter = (req, params) => {
  const { start_date, end_date, period = '30d' } = req.query;
  
  let dateRange = '';
  
  if (start_date && end_date) {
    // User provided custom date range
    dateRange = `AND DATE(transaction_date) BETWEEN $${params.length + 1} AND $${params.length + 2}`;
    params.push(start_date, end_date);
  } else {
    // Use predefined periods
    const periods = {
      '7d': `AND DATE(transaction_date) >= CURRENT_DATE - INTERVAL '7 days'`,
      '30d': `AND DATE(transaction_date) >= CURRENT_DATE - INTERVAL '30 days'`,
      '90d': `AND DATE(transaction_date) >= CURRENT_DATE - INTERVAL '90 days'`,
      '1y': `AND DATE(transaction_date) >= CURRENT_DATE - INTERVAL '365 days'`,
      'all': '' // No date filter
    };
    dateRange = periods[period] || periods['30d'];
  }
  
  return dateRange;
};

// Get sales performance over time - FIXED VERSION
router.get('/performance', requirePermission('reports:read'), async (req, res) => {
  try {
    const { businessId } = req.user;
    const params = [businessId];
    
    const dateRange = buildDateRangeFilter(req, params);

    const query = `
      SELECT
        DATE(transaction_date) as date,
        COUNT(*) as transaction_count,
        COALESCE(SUM(final_amount), 0) as total_sales,
        COALESCE(AVG(final_amount), 0) as average_sale,
        COUNT(DISTINCT customer_id) as unique_customers
      FROM pos_transactions
      WHERE business_id = $1
        AND status IN ('completed', 'active')
        ${dateRange}
      GROUP BY DATE(transaction_date)
      ORDER BY date DESC
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

// Get top products/services - FIXED VERSION
router.get('/top-items', requirePermission('reports:read'), async (req, res) => {
  try {
    const { businessId } = req.user;
    const { limit = 10, start_date, end_date } = req.query;

    const params = [businessId, parseInt(limit)];
    let dateRange = '';

    if (start_date && end_date) {
      dateRange = `AND DATE(t.transaction_date) BETWEEN $3 AND $4`;
      params.push(start_date, end_date);
    } else {
      // Default to last 30 days
      dateRange = `AND DATE(t.transaction_date) >= CURRENT_DATE - INTERVAL '30 days'`;
    }

    const query = `
      SELECT
        COALESCE(ti.item_name, p.name, s.name, 'Unknown Item') as item_name,
        COALESCE(ti.item_type,
          CASE
            WHEN ti.product_id IS NOT NULL THEN 'product'
            WHEN ti.service_id IS NOT NULL THEN 'service'
            ELSE 'unknown'
          END) as item_type,
        SUM(ti.quantity) as total_quantity,
        COALESCE(SUM(ti.total_price), 0) as total_revenue,
        COUNT(DISTINCT t.id) as transaction_count
      FROM pos_transaction_items ti
      JOIN pos_transactions t ON ti.pos_transaction_id = t.id
      LEFT JOIN products p ON ti.product_id = p.id
      LEFT JOIN services s ON ti.service_id = s.id
      WHERE t.business_id = $1
        AND t.status IN ('completed', 'active')
        ${dateRange}
      GROUP BY ti.item_name, ti.item_type, p.name, s.name, ti.product_id, ti.service_id
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

// Get payment method analytics - FIXED VERSION
router.get('/payment-methods', requirePermission('reports:read'), async (req, res) => {
  try {
    const { businessId } = req.user;
    const { start_date, end_date } = req.query;

    const params = [businessId];
    let dateRange = '';

    if (start_date && end_date) {
      dateRange = `AND DATE(transaction_date) BETWEEN $2 AND $3`;
      params.push(start_date, end_date);
    } else {
      dateRange = `AND DATE(transaction_date) >= CURRENT_DATE - INTERVAL '30 days'`;
    }

    const query = `
      SELECT
        payment_method,
        COUNT(*) as transaction_count,
        COALESCE(SUM(final_amount), 0) as total_amount,
        ROUND(
          (COUNT(*) * 100.0 / NULLIF(
            (SELECT COUNT(*) FROM pos_transactions WHERE business_id = $1 AND status IN ('completed', 'active') ${dateRange}),
            0
          )),
          2
        ) as percentage
      FROM pos_transactions
      WHERE business_id = $1
        AND status IN ('completed', 'active')
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

// Get comprehensive sales summary - FIXED VERSION
router.get('/summary', requirePermission('reports:read'), async (req, res) => {
  try {
    const { businessId } = req.user;
    const { start_date, end_date } = req.query;

    const params = [businessId];
    let dateRange = '';

    if (start_date && end_date) {
      dateRange = `AND DATE(transaction_date) BETWEEN $2 AND $3`;
      params.push(start_date, end_date);
    } else {
      dateRange = `AND DATE(transaction_date) >= CURRENT_DATE - INTERVAL '30 days'`;
    }

    const query = `
      SELECT
        COUNT(*) as total_transactions,
        COALESCE(SUM(final_amount), 0) as total_revenue,
        COALESCE(AVG(final_amount), 0) as average_order_value,
        COUNT(DISTINCT customer_id) as unique_customers,
        MIN(transaction_date) as period_start,
        MAX(transaction_date) as period_end
      FROM pos_transactions
      WHERE business_id = $1
        AND status IN ('completed', 'active')
        ${dateRange}
    `;

    const result = await db.query(query, params);

    // Calculate revenue trend
    const trendQuery = `
      SELECT
        COALESCE(SUM(final_amount), 0) as previous_revenue
      FROM pos_transactions
      WHERE business_id = $1
        AND status IN ('completed', 'active')
        AND DATE(transaction_date) BETWEEN
          (CURRENT_DATE - INTERVAL '60 days') AND
          (CURRENT_DATE - INTERVAL '30 days')
    `;

    const trendResult = await db.query(trendQuery, [businessId]);
    const previousRevenue = parseFloat(trendResult.rows[0]?.previous_revenue || 0);
    const currentRevenue = parseFloat(result.rows[0]?.total_revenue || 0);

    let revenueTrend = 0;
    if (previousRevenue > 0) {
      revenueTrend = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
    }

    const summary = {
      ...result.rows[0],
      revenue_trend: Math.round(revenueTrend * 100) / 100
    };

    res.json({
      success: true,
      data: summary,
      message: 'Sales summary fetched successfully'
    });
  } catch (error) {
    console.error('Sales summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales summary',
      error: error.message
    });
  }
});

export default router;
