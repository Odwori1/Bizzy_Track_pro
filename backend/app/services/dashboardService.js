import { query } from '../utils/database.js';
import { log } from '../utils/logger.js';

export const dashboardService = {
  async getBusinessOverview(businessId, userId, userRole) {
    try {
      log.debug('Fetching business overview', { businessId, userId, userRole });

      // Get basic business statistics with permission-aware filtering
      const statsQuery = `
        SELECT
          -- Customer statistics
          (SELECT COUNT(*) FROM customers WHERE business_id = $1) as total_customers,
          (SELECT COUNT(*) FROM customers WHERE business_id = $1 AND is_active = true) as active_customers,

          -- Job statistics
          (SELECT COUNT(*) FROM jobs WHERE business_id = $1) as total_jobs,
          (SELECT COUNT(*) FROM jobs WHERE business_id = $1 AND status = 'completed') as completed_jobs,
          (SELECT COUNT(*) FROM jobs WHERE business_id = $1 AND status = 'in-progress') as in_progress_jobs,
          (SELECT COUNT(*) FROM jobs WHERE business_id = $1 AND status = 'scheduled') as scheduled_jobs,

          -- Invoice statistics
          (SELECT COUNT(*) FROM invoices WHERE business_id = $1) as total_invoices,
          (SELECT COUNT(*) FROM invoices WHERE business_id = $1 AND status = 'paid') as paid_invoices,
          (SELECT COUNT(*) FROM invoices WHERE business_id = $1 AND status = 'sent') as pending_invoices,

          -- Revenue statistics (only include paid invoices for revenue)
          (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE business_id = $1 AND status = 'paid') as total_revenue,
          (SELECT COALESCE(SUM(balance_due), 0) FROM invoices WHERE business_id = $1 AND status = 'sent') as pending_revenue,

          -- Recent activity
          (SELECT COUNT(*) FROM jobs WHERE business_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days') as recent_jobs,
          (SELECT COUNT(*) FROM invoices WHERE business_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days') as recent_invoices
      `;

      const statsResult = await query(statsQuery, [businessId]);
      const stats = statsResult.rows[0];

      // Get recent jobs for activity feed
      const recentJobsQuery = `
        SELECT
          j.id,
          j.job_number,
          j.title,
          j.status,
          j.scheduled_date,
          j.created_at,
          c.first_name || ' ' || c.last_name as customer_name
        FROM jobs j
        LEFT JOIN customers c ON j.customer_id = c.id
        WHERE j.business_id = $1
        ORDER BY j.created_at DESC
        LIMIT 5
      `;

      const recentJobsResult = await query(recentJobsQuery, [businessId]);
      const recentJobs = recentJobsResult.rows;

      // Get recent invoices for activity feed
      const recentInvoicesQuery = `
        SELECT
          i.id,
          i.invoice_number,
          i.total_amount,
          i.status,
          i.due_date,
          i.created_at,
          c.first_name || ' ' || c.last_name as customer_name
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        WHERE i.business_id = $1
        ORDER BY i.created_at DESC
        LIMIT 5
      `;

      const recentInvoicesResult = await query(recentInvoicesQuery, [businessId]);
      const recentInvoices = recentInvoicesResult.rows;

      // Calculate completion rate
      const completionRate = stats.total_jobs > 0
        ? Math.round((stats.completed_jobs / stats.total_jobs) * 100)
        : 0;

      // Calculate collection rate
      const collectionRate = stats.total_revenue > 0
        ? Math.round((stats.total_revenue / (stats.total_revenue + stats.pending_revenue)) * 100)
        : 0;

      const overview = {
        summary: {
          total_customers: parseInt(stats.total_customers),
          active_customers: parseInt(stats.active_customers),
          total_jobs: parseInt(stats.total_jobs),
          completed_jobs: parseInt(stats.completed_jobs),
          total_invoices: parseInt(stats.total_invoices),
          paid_invoices: parseInt(stats.paid_invoices),
          total_revenue: parseFloat(stats.total_revenue),
          pending_revenue: parseFloat(stats.pending_revenue)
        },
        metrics: {
          completion_rate: completionRate,
          collection_rate: collectionRate,
          recent_activity: {
            jobs_last_7_days: parseInt(stats.recent_jobs),
            invoices_last_7_days: parseInt(stats.recent_invoices)
          }
        },
        job_status_breakdown: {
          completed: parseInt(stats.completed_jobs),
          in_progress: parseInt(stats.in_progress_jobs),
          scheduled: parseInt(stats.scheduled_jobs),
          other: parseInt(stats.total_jobs) - parseInt(stats.completed_jobs) - parseInt(stats.in_progress_jobs) - parseInt(stats.scheduled_jobs)
        },
        invoice_status_breakdown: {
          paid: parseInt(stats.paid_invoices),
          pending: parseInt(stats.pending_invoices),
          draft: parseInt(stats.total_invoices) - parseInt(stats.paid_invoices) - parseInt(stats.pending_invoices)
        },
        recent_activity: {
          jobs: recentJobs,
          invoices: recentInvoices
        }
      };

      log.info('Business overview fetched successfully', {
        businessId,
        totalCustomers: overview.summary.total_customers,
        totalRevenue: overview.summary.total_revenue
      });

      return overview;

    } catch (error) {
      log.error('Failed to fetch business overview', error);
      throw error;
    }
  },

  async getFinancialSummary(businessId, period = 'month') {
    try {
      log.debug('Fetching financial summary', { businessId, period });

      let dateFilter = '';
      switch (period) {
        case 'week':
          dateFilter = `AND invoice_date >= CURRENT_DATE - INTERVAL '7 days'`;
          break;
        case 'month':
          dateFilter = `AND invoice_date >= CURRENT_DATE - INTERVAL '30 days'`;
          break;
        case 'quarter':
          dateFilter = `AND invoice_date >= CURRENT_DATE - INTERVAL '90 days'`;
          break;
        case 'year':
          dateFilter = `AND invoice_date >= CURRENT_DATE - INTERVAL '365 days'`;
          break;
        default:
          dateFilter = `AND invoice_date >= CURRENT_DATE - INTERVAL '30 days'`;
      }

      // FIXED: Split the query to avoid LIMIT inside json_agg
      const financialQuery = `
        SELECT
          -- Current period revenue
          COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) as current_revenue,
          COALESCE(SUM(CASE WHEN status = 'sent' THEN total_amount ELSE 0 END), 0) as current_pending,

          -- Previous period revenue for comparison
          COALESCE(SUM(CASE WHEN status = 'paid' AND invoice_date >= CURRENT_DATE - INTERVAL '60 days' AND invoice_date < CURRENT_DATE - INTERVAL '30 days' THEN total_amount ELSE 0 END), 0) as previous_revenue,

          -- Revenue by payment method
          COALESCE(SUM(CASE WHEN status = 'paid' AND payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_revenue,
          COALESCE(SUM(CASE WHEN status = 'paid' AND payment_method = 'bank_transfer' THEN total_amount ELSE 0 END), 0) as bank_revenue,
          COALESCE(SUM(CASE WHEN status = 'paid' AND payment_method = 'credit_card' THEN total_amount ELSE 0 END), 0) as card_revenue,
          COALESCE(SUM(CASE WHEN status = 'paid' AND payment_method = 'mobile_money' THEN total_amount ELSE 0 END), 0) as mobile_revenue

        FROM invoices
        WHERE business_id = $1 ${dateFilter}
      `;

      const result = await query(financialQuery, [businessId]);
      const financialData = result.rows[0];

      // FIXED: Get top customers in a separate query
      const topCustomersQuery = `
        SELECT 
          c.first_name || ' ' || c.last_name as customer_name,
          SUM(i.total_amount) as total_spent,
          COUNT(i.id) as invoice_count
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        WHERE i.business_id = $1 AND i.status = 'paid' ${dateFilter}
        GROUP BY c.id, c.first_name, c.last_name
        ORDER BY total_spent DESC
        LIMIT 5
      `;

      const topCustomersResult = await query(topCustomersQuery, [businessId]);
      const topCustomers = topCustomersResult.rows;

      // Calculate growth percentage
      const growthPercentage = financialData.previous_revenue > 0
        ? ((financialData.current_revenue - financialData.previous_revenue) / financialData.previous_revenue) * 100
        : 0;

      const summary = {
        period: period,
        revenue: {
          current: parseFloat(financialData.current_revenue),
          pending: parseFloat(financialData.current_pending),
          previous: parseFloat(financialData.previous_revenue),
          growth_percentage: Math.round(growthPercentage * 100) / 100
        },
        payment_methods: {
          cash: parseFloat(financialData.cash_revenue),
          bank_transfer: parseFloat(financialData.bank_revenue),
          credit_card: parseFloat(financialData.card_revenue),
          mobile_money: parseFloat(financialData.mobile_revenue)
        },
        top_customers: topCustomers
      };

      log.debug('Financial summary fetched successfully', {
        businessId,
        period,
        currentRevenue: summary.revenue.current
      });

      return summary;

    } catch (error) {
      log.error('Failed to fetch financial summary', error);
      throw error;
    }
  },

  async getActivityTimeline(businessId, limit = 20) {
    try {
      log.debug('Fetching activity timeline', { businessId, limit });

      const activityQuery = `
        (
          SELECT
            'invoice' as type,
            'invoice.created' as action,
            invoice_number as identifier,
            customer_id as resource_id,
            created_at as timestamp,
            NULL as user_id,
            (SELECT first_name || ' ' || last_name FROM customers WHERE id = customer_id) as details
          FROM invoices
          WHERE business_id = $1

          UNION ALL

          SELECT
            'job' as type,
            'job.created' as action,
            job_number as identifier,
            customer_id as resource_id,
            created_at as timestamp,
            created_by as user_id,
            title as details
          FROM jobs
          WHERE business_id = $1

          UNION ALL

          SELECT
            'customer' as type,
            'customer.created' as action,
            NULL as identifier,
            id as resource_id,
            created_at as timestamp,
            created_by as user_id,
            first_name || ' ' || last_name as details
          FROM customers
          WHERE business_id = $1
        )
        ORDER BY timestamp DESC
        LIMIT $2
      `;

      const result = await query(activityQuery, [businessId, limit]);

      log.debug('Activity timeline fetched successfully', {
        businessId,
        activityCount: result.rows.length
      });

      return result.rows;

    } catch (error) {
      log.error('Failed to fetch activity timeline', error);
      throw error;
    }
  }
};
