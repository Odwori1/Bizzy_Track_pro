import { dashboardService } from '../services/dashboardService.js';
import { businessService } from '../services/businessService.js';
import { log } from '../utils/logger.js';

export const dashboardController = {
  async getOverview(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const userRole = req.user.role;

      log.info('Fetching dashboard overview', { businessId, userId, userRole });

      const overview = await dashboardService.getBusinessOverview(businessId, userId, userRole);
      
      // Get business info for currency formatting
      const business = await businessService.getBusinessProfile(businessId);
      
      // Format currency amounts
      const formatCurrency = (amount) => {
        return `${business.currency_symbol} ${parseFloat(amount).toFixed(2)}`;
      };

      const formattedOverview = {
        ...overview,
        summary: {
          ...overview.summary,
          total_revenue: formatCurrency(overview.summary.total_revenue),
          pending_revenue: formatCurrency(overview.summary.pending_revenue)
        },
        metrics: {
          ...overview.metrics,
          display_revenue: formatCurrency(overview.summary.total_revenue)
        }
      };

      res.json({
        success: true,
        data: formattedOverview,
        business: {
          currency: business.currency,
          currency_symbol: business.currency_symbol,
          timezone: business.timezone
        }
      });

    } catch (error) {
      log.error('Dashboard overview controller error', error);
      next(error);
    }
  },

  async getFinancialSummary(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { period = 'month' } = req.query;

      log.info('Fetching financial summary', { businessId, period });

      // Validate period parameter
      const validPeriods = ['week', 'month', 'quarter', 'year'];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid period. Must be one of: week, month, quarter, year'
        });
      }

      const financialSummary = await dashboardService.getFinancialSummary(businessId, period);
      
      // Get business info for currency formatting
      const business = await businessService.getBusinessProfile(businessId);
      
      // Format currency amounts
      const formatCurrency = (amount) => {
        return `${business.currency_symbol} ${parseFloat(amount).toFixed(2)}`;
      };

      const formattedSummary = {
        ...financialSummary,
        revenue: {
          ...financialSummary.revenue,
          current: formatCurrency(financialSummary.revenue.current),
          pending: formatCurrency(financialSummary.revenue.pending),
          previous: formatCurrency(financialSummary.revenue.previous)
        },
        payment_methods: {
          cash: formatCurrency(financialSummary.payment_methods.cash),
          bank_transfer: formatCurrency(financialSummary.payment_methods.bank_transfer),
          credit_card: formatCurrency(financialSummary.payment_methods.credit_card),
          mobile_money: formatCurrency(financialSummary.payment_methods.mobile_money)
        },
        top_customers: financialSummary.top_customers.map(customer => ({
          ...customer,
          total_spent: formatCurrency(customer.total_spent)
        }))
      };

      res.json({
        success: true,
        data: formattedSummary,
        period: period
      });

    } catch (error) {
      log.error('Financial summary controller error', error);
      next(error);
    }
  },

  async getActivityTimeline(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { limit = 20 } = req.query;

      log.info('Fetching activity timeline', { businessId, limit });

      // Validate limit parameter
      const parsedLimit = parseInt(limit);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return res.status(400).json({
          success: false,
          error: 'Invalid limit. Must be a number between 1 and 100'
        });
      }

      const activities = await dashboardService.getActivityTimeline(businessId, parsedLimit);

      res.json({
        success: true,
        data: activities,
        count: activities.length
      });

    } catch (error) {
      log.error('Activity timeline controller error', error);
      next(error);
    }
  },

  async getQuickStats(req, res, next) {
    try {
      const businessId = req.user.businessId;

      log.info('Fetching quick stats', { businessId });

      // Get basic stats for quick overview
      const statsQuery = `
        SELECT 
          (SELECT COUNT(*) FROM customers WHERE business_id = $1 AND is_active = true) as active_customers,
          (SELECT COUNT(*) FROM jobs WHERE business_id = $1 AND status = 'in-progress') as active_jobs,
          (SELECT COUNT(*) FROM invoices WHERE business_id = $1 AND status = 'sent') as pending_invoices,
          (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE business_id = $1 AND status = 'paid' AND invoice_date >= CURRENT_DATE - INTERVAL '30 days') as monthly_revenue
      `;

      const { query } = await import('../utils/database.js');
      const result = await query(statsQuery, [businessId]);
      const stats = result.rows[0];

      // Get business info for currency formatting
      const business = await businessService.getBusinessProfile(businessId);

      const quickStats = {
        active_customers: parseInt(stats.active_customers),
        active_jobs: parseInt(stats.active_jobs),
        pending_invoices: parseInt(stats.pending_invoices),
        monthly_revenue: `${business.currency_symbol} ${parseFloat(stats.monthly_revenue).toFixed(2)}`
      };

      res.json({
        success: true,
        data: quickStats
      });

    } catch (error) {
      log.error('Quick stats controller error', error);
      next(error);
    }
  }
};
