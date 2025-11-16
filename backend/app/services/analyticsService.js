import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';

export class AnalyticsService {

  // Create analytics dashboard
  static async createAnalyticsDashboard(businessId, dashboardData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO analytics_dashboards (
          business_id, name, description, layout_config, is_default, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [
        businessId,
        dashboardData.name,
        dashboardData.description || null,
        JSON.stringify(dashboardData.layout_config || {}),
        dashboardData.is_default || false,
        userId
      ];

      const result = await client.query(query, values);
      const dashboard = result.rows[0];

      // If this is set as default, unset any previous defaults
      if (dashboardData.is_default) {
        await client.query(
          'UPDATE analytics_dashboards SET is_default = false WHERE business_id = $1 AND id != $2',
          [businessId, dashboard.id]
        );
      }

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'analytics_dashboards.created',
        resourceType: 'analytics_dashboards',
        resourceId: dashboard.id,
        newValues: {
          name: dashboardData.name,
          is_default: dashboardData.is_default
        }
      });

      await client.query('COMMIT');
      return dashboard;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get analytics dashboards
  static async getAnalyticsDashboards(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT ad.*, u.full_name as created_by_name
        FROM analytics_dashboards ad
        INNER JOIN users u ON ad.created_by = u.id
        WHERE ad.business_id = $1
      `;
      const values = [businessId];

      if (filters.is_default !== undefined) {
        query += ` AND ad.is_default = $2`;
        values.push(filters.is_default);
      }

      query += ' ORDER BY ad.is_default DESC, ad.created_at DESC';

      const result = await client.query(query, values);
      return result.rows;

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Create customer segment
  static async createCustomerSegment(businessId, segmentData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO customer_segments (
          business_id, name, description, segment_criteria, segment_type, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [
        businessId,
        segmentData.name,
        segmentData.description || null,
        JSON.stringify(segmentData.segment_criteria || {}),
        segmentData.segment_type,
        userId
      ];

      const result = await client.query(query, values);
      const segment = result.rows[0];

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'customer_segments.created',
        resourceType: 'customer_segments',
        resourceId: segment.id,
        newValues: {
          name: segmentData.name,
          segment_type: segmentData.segment_type
        }
      });

      await client.query('COMMIT');
      return segment;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get customer segments
  static async getCustomerSegments(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT cs.*, u.full_name as created_by_name
        FROM customer_segments cs
        INNER JOIN users u ON cs.created_by = u.id
        WHERE cs.business_id = $1
      `;
      const values = [businessId];

      if (filters.segment_type) {
        query += ` AND cs.segment_type = $2`;
        values.push(filters.segment_type);
      }

      if (filters.is_active !== undefined) {
        query += ` AND cs.is_active = $${values.length + 1}`;
        values.push(filters.is_active);
      }

      query += ' ORDER BY cs.created_at DESC';

      const result = await client.query(query, values);
      return result.rows;

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get business overview metrics
  static async getBusinessOverview(businessId, period = '30 days') {
    const client = await getClient();
    try {
      // Revenue metrics
      const revenueQuery = `
        SELECT 
          COALESCE(SUM(final_price), 0) as total_revenue,
          COUNT(*) as total_jobs,
          COALESCE(AVG(final_price), 0) as avg_job_value
        FROM jobs 
        WHERE business_id = $1 
        AND created_at >= NOW() - ($2 || ' days')::INTERVAL
        AND status = 'completed'
      `;

      const revenueResult = await client.query(revenueQuery, [businessId, period]);
      const revenueData = revenueResult.rows[0];

      // Customer metrics
      const customerQuery = `
        SELECT 
          COUNT(*) as total_customers,
          COUNT(CASE WHEN created_at >= NOW() - ($2 || ' days')::INTERVAL THEN 1 END) as new_customers,
          COUNT(CASE WHEN last_visit >= NOW() - ($2 || ' days')::INTERVAL THEN 1 END) as active_customers
        FROM customers 
        WHERE business_id = $1 
        AND is_active = true
      `;

      const customerResult = await client.query(customerQuery, [businessId, period]);
      const customerData = customerResult.rows[0];

      // Staff performance metrics
      const staffQuery = `
        SELECT 
          COUNT(*) as total_staff,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_staff,
          COALESCE(AVG(spm.efficiency_score), 0) as avg_efficiency_score
        FROM staff_profiles sp
        LEFT JOIN staff_performance_metrics spm ON sp.id = spm.staff_profile_id
        WHERE sp.business_id = $1
      `;

      const staffResult = await client.query(staffQuery, [businessId]);
      const staffData = staffResult.rows[0];

      return {
        revenue: {
          total: parseFloat(revenueData.total_revenue),
          jobs_count: parseInt(revenueData.total_jobs),
          avg_job_value: parseFloat(revenueData.avg_job_value)
        },
        customers: {
          total: parseInt(customerData.total_customers),
          new: parseInt(customerData.new_customers),
          active: parseInt(customerData.active_customers)
        },
        staff: {
          total: parseInt(staffData.total_staff),
          active: parseInt(staffData.active_staff),
          avg_efficiency: parseFloat(staffData.avg_efficiency_score)
        }
      };

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Export data
  static async createExportJob(businessId, exportData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO export_jobs (
          business_id, requested_by, export_type, filters, format
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const values = [
        businessId,
        userId,
        exportData.export_type,
        JSON.stringify(exportData.filters || {}),
        exportData.format || 'csv'
      ];

      const result = await client.query(query, values);
      const exportJob = result.rows[0];

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'export_jobs.created',
        resourceType: 'export_jobs',
        resourceId: exportJob.id,
        newValues: {
          export_type: exportData.export_type,
          format: exportData.format
        }
      });

      await client.query('COMMIT');
      return exportJob;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get export jobs
  static async getExportJobs(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT ej.*, u.full_name as requested_by_name
        FROM export_jobs ej
        INNER JOIN users u ON ej.requested_by = u.id
        WHERE ej.business_id = $1
      `;
      const values = [businessId];

      if (filters.status) {
        query += ` AND ej.status = $2`;
        values.push(filters.status);
      }

      if (filters.export_type) {
        query += ` AND ej.export_type = $${values.length + 1}`;
        values.push(filters.export_type);
      }

      query += ' ORDER BY ej.created_at DESC';

      const result = await client.query(query, values);
      return result.rows;

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
}
