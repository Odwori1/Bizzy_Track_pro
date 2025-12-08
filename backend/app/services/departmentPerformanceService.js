import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';

export class DepartmentPerformanceService {
  /**
   * Get department performance overview
   */
  static async getDepartmentPerformance(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT 
          d.*,
          COUNT(DISTINCT jda.id) as total_assignments,
          COUNT(DISTINCT CASE WHEN jda.status = 'completed' THEN jda.id END) as completed_assignments,
          COUNT(DISTINCT CASE WHEN jda.status = 'in_progress' THEN jda.id END) as in_progress_assignments,
          COALESCE(AVG(
            EXTRACT(EPOCH FROM (jda.actual_end - jda.actual_start)) / 3600
          ), 0) as avg_completion_hours,
          COALESCE(SUM(dbe.total_amount), 0) as total_revenue,
          COALESCE(SUM(dbe.cost_amount), 0) as total_cost
        FROM departments d
        LEFT JOIN job_department_assignments jda ON d.id = jda.department_id
        LEFT JOIN department_billing_entries dbe ON d.id = dbe.department_id
        WHERE d.business_id = $1 AND d.is_active = true
      `;
      
      const params = [businessId];
      let paramCount = 1;

      if (filters.department_type) {
        paramCount++;
        queryStr += ` AND d.department_type = $${paramCount}`;
        params.push(filters.department_type);
      }

      if (filters.date_from) {
        paramCount++;
        queryStr += ` AND (
          jda.created_at >= $${paramCount} OR 
          dbe.billing_date >= $${paramCount}
        )`;
        params.push(filters.date_from);
      }

      if (filters.date_to) {
        paramCount++;
        queryStr += ` AND (
          jda.created_at <= $${paramCount} OR 
          dbe.billing_date <= $${paramCount}
        )`;
        params.push(filters.date_to);
      }

      queryStr += ' GROUP BY d.id ORDER BY d.sort_order, d.name';

      const result = await client.query(queryStr, params);

      // Calculate performance metrics
      const performanceData = result.rows.map(dept => {
        const efficiency = dept.total_revenue > 0 
          ? ((dept.total_revenue - dept.total_cost) / dept.total_revenue) * 100 
          : 0;
        
        const completionRate = dept.total_assignments > 0 
          ? (dept.completed_assignments / dept.total_assignments) * 100 
          : 0;

        return {
          ...dept,
          efficiency: parseFloat(efficiency.toFixed(2)),
          completion_rate: parseFloat(completionRate.toFixed(2)),
          profit: dept.total_revenue - dept.total_cost
        };
      });

      return performanceData;
    } catch (error) {
      log.error('❌ Department performance query failed:', {
        error: error.message,
        businessId,
        filters
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get detailed performance for a specific department
   */
  static async getDepartmentPerformanceById(businessId, departmentId, filters = {}) {
    const client = await getClient();

    try {
      // Get department details
      const deptQuery = `
        SELECT d.*, 
               COUNT(DISTINCT dr.id) as role_count,
               COUNT(DISTINCT u.id) as staff_count
        FROM departments d
        LEFT JOIN department_roles dr ON d.id = dr.department_id
        LEFT JOIN users u ON u.department_id = d.id
        WHERE d.business_id = $1 AND d.id = $2
        GROUP BY d.id
      `;

      const deptResult = await client.query(deptQuery, [businessId, departmentId]);

      if (deptResult.rows.length === 0) {
        throw new Error('Department not found');
      }

      const department = deptResult.rows[0];

      // Get recent assignments
      const assignmentsQuery = `
        SELECT 
          jda.*,
          j.job_number,
          j.title as job_title,
          j.status as job_status,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name,
          u_assigned.full_name as assigned_to_name
        FROM job_department_assignments jda
        JOIN jobs j ON jda.job_id = j.id
        LEFT JOIN customers c ON j.customer_id = c.id
        LEFT JOIN users u_assigned ON jda.assigned_to = u_assigned.id
        WHERE jda.business_id = $1 AND jda.department_id = $2
        ORDER BY jda.created_at DESC
        LIMIT 10
      `;

      const assignmentsResult = await client.query(assignmentsQuery, [businessId, departmentId]);
      department.recent_assignments = assignmentsResult.rows;

      // Get billing metrics for the last 30 days
      const billingQuery = `
        SELECT 
          DATE_TRUNC('day', billing_date) as date,
          COUNT(*) as transaction_count,
          SUM(total_amount) as total_revenue,
          SUM(cost_amount) as total_cost
        FROM department_billing_entries
        WHERE business_id = $1 AND department_id = $2
          AND billing_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', billing_date)
        ORDER BY date DESC
      `;

      const billingResult = await client.query(billingQuery, [businessId, departmentId]);
      department.billing_trends = billingResult.rows;

      // Calculate performance metrics
      const metricsQuery = `
        SELECT 
          COALESCE(COUNT(*), 0) as total_jobs,
          COALESCE(COUNT(CASE WHEN status = 'completed' THEN 1 END), 0) as completed_jobs,
          COALESCE(AVG(
            CASE 
              WHEN actual_start IS NOT NULL AND actual_end IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (actual_end - actual_start)) / 3600
              ELSE NULL
            END
          ), 0) as avg_completion_hours,
          COALESCE(AVG(
            CASE 
              WHEN actual_end <= sla_deadline THEN 1.0
              ELSE 0.0
            END
          ) * 100, 0) as on_time_rate
        FROM job_department_assignments
        WHERE business_id = $1 AND department_id = $2
          AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      `;

      const metricsResult = await client.query(metricsQuery, [businessId, departmentId]);
      department.performance_metrics = metricsResult.rows[0];

      return department;
    } catch (error) {
      log.error('❌ Department performance detail query failed:', {
        error: error.message,
        businessId,
        departmentId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get department metrics dashboard
   */
  static async getDepartmentMetrics(businessId, period = '30days') {
    const client = await getClient();

    try {
      let dateFilter = '';
      switch (period) {
        case '7days':
          dateFilter = "INTERVAL '7 days'";
          break;
        case '30days':
          dateFilter = "INTERVAL '30 days'";
          break;
        case '90days':
          dateFilter = "INTERVAL '90 days'";
          break;
        default:
          dateFilter = "INTERVAL '30 days'";
      }

      // Simple, non-ambiguous query
      const metricsQuery = `
        SELECT 
          d.id as department_id,
          d.name as department_name,
          d.department_type,
          d.color_hex,
          COUNT(DISTINCT jda.id) as total_assignments,
          COUNT(DISTINCT CASE WHEN jda.status = 'completed' THEN jda.id END) as completed_assignments,
          COUNT(DISTINCT CASE WHEN jda.status = 'in_progress' THEN jda.id END) as active_assignments,
          COALESCE(AVG(
            EXTRACT(EPOCH FROM (jda.actual_end - jda.actual_start)) / 3600
          ), 0) as avg_completion_hours,
          COALESCE(SUM(dbe.total_amount), 0) as total_revenue,
          COALESCE(SUM(dbe.cost_amount), 0) as total_cost,
          COALESCE(COUNT(DISTINCT dbe.id), 0) as billing_entries
        FROM departments d
        LEFT JOIN job_department_assignments jda ON d.id = jda.department_id
          AND jda.created_at >= CURRENT_DATE - ${dateFilter}
        LEFT JOIN department_billing_entries dbe ON d.id = dbe.department_id
          AND dbe.billing_date >= CURRENT_DATE - ${dateFilter}
        WHERE d.business_id = $1 AND d.is_active = true
        GROUP BY d.id, d.name, d.department_type, d.color_hex
        ORDER BY total_revenue DESC
      `;

      const result = await client.query(metricsQuery, [businessId]);

      // Calculate metrics for each department
      const departments = result.rows.map(dept => {
        const efficiency = dept.total_revenue > 0 
          ? ((dept.total_revenue - dept.total_cost) / dept.total_revenue) * 100 
          : 0;
        
        const completionRate = dept.total_assignments > 0 
          ? (dept.completed_assignments / dept.total_assignments) * 100 
          : 0;

        return {
          ...dept,
          efficiency_rate: parseFloat(efficiency.toFixed(2)),
          completion_rate: parseFloat(completionRate.toFixed(2)),
          net_profit: dept.total_revenue - dept.total_cost
        };
      });

      // Calculate overall metrics
      const overallMetrics = {
        total_departments: departments.length,
        total_assignments: departments.reduce((sum, dept) => sum + parseInt(dept.total_assignments), 0),
        active_assignments: departments.reduce((sum, dept) => sum + parseInt(dept.active_assignments), 0),
        total_revenue: departments.reduce((sum, dept) => sum + parseFloat(dept.total_revenue), 0),
        total_cost: departments.reduce((sum, dept) => sum + parseFloat(dept.total_cost), 0),
        total_profit: departments.reduce((sum, dept) => sum + parseFloat(dept.net_profit), 0),
        avg_efficiency: departments.length > 0 
          ? departments.reduce((sum, dept) => sum + parseFloat(dept.efficiency_rate), 0) / departments.length 
          : 0
      };

      return {
        departments: departments,
        overall_metrics: overallMetrics
      };
    } catch (error) {
      log.error('❌ Department metrics query failed:', {
        error: error.message,
        businessId,
        period
      });
      throw error;
    } finally {
      client.release();
    }
  }
}
