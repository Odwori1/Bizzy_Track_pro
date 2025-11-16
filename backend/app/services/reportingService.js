import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';

export class ReportingService {

  // Create scheduled report
  static async createScheduledReport(businessId, reportData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Calculate next run date based on frequency
      const nextRunAt = this.calculateNextRunDate(reportData.frequency);

      const query = `
        INSERT INTO scheduled_reports (
          business_id, name, description, report_type, frequency,
          config, recipients, export_format, next_run_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const values = [
        businessId,
        reportData.name,
        reportData.description || null,
        reportData.report_type,
        reportData.frequency,
        JSON.stringify(reportData.config || {}),
        JSON.stringify(reportData.recipients || []),
        reportData.export_format || 'pdf',
        nextRunAt,
        userId
      ];

      const result = await client.query(query, values);
      const report = result.rows[0];

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'scheduled_reports.created',
        resourceType: 'scheduled_reports',
        resourceId: report.id,
        newValues: {
          name: reportData.name,
          report_type: reportData.report_type,
          frequency: reportData.frequency
        }
      });

      await client.query('COMMIT');
      return report;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get scheduled reports
  static async getScheduledReports(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT sr.*, u.full_name as created_by_name
        FROM scheduled_reports sr
        INNER JOIN users u ON sr.created_by = u.id
        WHERE sr.business_id = $1
      `;
      const values = [businessId];

      if (filters.report_type) {
        query += ` AND sr.report_type = $2`;
        values.push(filters.report_type);
      }

      if (filters.is_active !== undefined) {
        query += ` AND sr.is_active = $${values.length + 1}`;
        values.push(filters.is_active);
      }

      query += ' ORDER BY sr.next_run_at ASC, sr.created_at DESC';

      const result = await client.query(query, values);
      return result.rows;

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Generate financial report
  static async generateFinancialReport(businessId, period = '30 days') {
    const client = await getClient();
    try {
      // Revenue by service
      const revenueByServiceQuery = `
        SELECT 
          s.name as service_name,
          COUNT(j.id) as job_count,
          COALESCE(SUM(j.final_price), 0) as total_revenue,
          COALESCE(AVG(j.final_price), 0) as avg_revenue
        FROM services s
        LEFT JOIN jobs j ON s.id = j.service_id 
          AND j.business_id = $1 
          AND j.created_at >= NOW() - ($2 || ' days')::INTERVAL
          AND j.status = 'completed'
        WHERE s.business_id = $1
        GROUP BY s.id, s.name
        ORDER BY total_revenue DESC
      `;

      const revenueResult = await client.query(revenueByServiceQuery, [businessId, period]);
      const revenueByService = revenueResult.rows;

      // Revenue trends
      const revenueTrendsQuery = `
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          COUNT(*) as job_count,
          COALESCE(SUM(final_price), 0) as daily_revenue
        FROM jobs 
        WHERE business_id = $1 
          AND created_at >= NOW() - ($2 || ' days')::INTERVAL
          AND status = 'completed'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date ASC
      `;

      const trendsResult = await client.query(revenueTrendsQuery, [businessId, period]);
      const revenueTrends = trendsResult.rows;

      // Expense analysis
      const expenseAnalysisQuery = `
        SELECT 
          ec.name as category_name,
          COUNT(e.id) as expense_count,
          COALESCE(SUM(e.amount), 0) as total_amount,
          COALESCE(AVG(e.amount), 0) as avg_amount
        FROM expense_categories ec
        LEFT JOIN expenses e ON ec.id = e.category_id 
          AND e.business_id = $1 
          AND e.expense_date >= NOW() - ($2 || ' days')::INTERVAL
        WHERE ec.business_id = $1
        GROUP BY ec.id, ec.name
        ORDER BY total_amount DESC
      `;

      const expenseResult = await client.query(expenseAnalysisQuery, [businessId, period]);
      const expenseAnalysis = expenseResult.rows;

      // Profitability summary
      const totalRevenue = revenueByService.reduce((sum, service) => sum + parseFloat(service.total_revenue), 0);
      const totalExpenses = expenseAnalysis.reduce((sum, expense) => sum + parseFloat(expense.total_amount), 0);
      const netProfit = totalRevenue - totalExpenses;

      return {
        summary: {
          total_revenue: totalRevenue,
          total_expenses: totalExpenses,
          net_profit: netProfit,
          profit_margin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
          period: period
        },
        revenue_by_service: revenueByService,
        revenue_trends: revenueTrends,
        expense_analysis: expenseAnalysis
      };

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Generate customer report
  static async generateCustomerReport(businessId, period = '30 days') {
    const client = await getClient();
    try {
      // Customer acquisition
      const acquisitionQuery = `
        SELECT 
          DATE_TRUNC('week', created_at) as week_start,
          COUNT(*) as new_customers
        FROM customers 
        WHERE business_id = $1 
          AND created_at >= NOW() - ($2 || ' days')::INTERVAL
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week_start ASC
      `;

      const acquisitionResult = await client.query(acquisitionQuery, [businessId, period]);
      const customerAcquisition = acquisitionResult.rows;

      // Customer value analysis
      const valueQuery = `
        SELECT 
          c.id,
          c.first_name,
          c.last_name,
          c.email,
          COUNT(j.id) as total_orders,
          COALESCE(SUM(j.final_price), 0) as total_spent,
          MAX(j.created_at) as last_order_date
        FROM customers c
        LEFT JOIN jobs j ON c.id = j.customer_id 
          AND j.status = 'completed'
        WHERE c.business_id = $1
          AND c.created_at >= NOW() - ($2 || ' days')::INTERVAL
        GROUP BY c.id, c.first_name, c.last_name, c.email
        ORDER BY total_spent DESC
        LIMIT 50
      `;

      const valueResult = await client.query(valueQuery, [businessId, period]);
      const customerValue = valueResult.rows;

      // Customer segmentation summary
      const segmentationQuery = `
        SELECT 
          cc.name as category_name,
          COUNT(c.id) as customer_count,
          COALESCE(AVG(c.total_spent), 0) as avg_spending
        FROM customer_categories cc
        LEFT JOIN customers c ON cc.id = c.category_id 
          AND c.business_id = $1
        WHERE cc.business_id = $1
        GROUP BY cc.id, cc.name
        ORDER BY customer_count DESC
      `;

      const segmentationResult = await client.query(segmentationQuery, [businessId]);
      const customerSegmentation = segmentationResult.rows;

      return {
        acquisition: customerAcquisition,
        top_customers: customerValue,
        segmentation: customerSegmentation,
        summary: {
          total_customers: customerValue.length,
          new_customers: customerAcquisition.reduce((sum, week) => sum + parseInt(week.new_customers), 0),
          avg_customer_value: customerValue.length > 0 ? 
            customerValue.reduce((sum, customer) => sum + parseFloat(customer.total_spent), 0) / customerValue.length : 0
        }
      };

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Helper method to calculate next run date
  static calculateNextRunDate(frequency) {
    const now = new Date();
    switch (frequency) {
      case 'daily':
        return new Date(now.setDate(now.getDate() + 1));
      case 'weekly':
        return new Date(now.setDate(now.getDate() + 7));
      case 'monthly':
        return new Date(now.setMonth(now.getMonth() + 1));
      case 'quarterly':
        return new Date(now.setMonth(now.getMonth() + 3));
      default:
        return new Date(now.setDate(now.getDate() + 1));
    }
  }
}
