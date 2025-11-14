import { query } from '../utils/database.js';
import { log } from '../utils/logger.js';

export const auditService = {
  /**
   * Search audit logs with filtering and pagination
   */
  async searchAuditLogs(businessId, options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        action = null,
        resource_type = null,
        user_id = null,
        start_date = null,
        end_date = null,
        search = null
      } = options;

      const offset = (page - 1) * limit;

      // Build WHERE conditions
      const conditions = ['al.business_id = $1'];
      const params = [businessId];
      let paramCount = 1;

      if (action) {
        paramCount++;
        conditions.push(`al.action = $${paramCount}`);
        params.push(action);
      }

      if (resource_type) {
        paramCount++;
        conditions.push(`al.resource_type = $${paramCount}`);
        params.push(resource_type);
      }

      if (user_id) {
        paramCount++;
        conditions.push(`al.user_id = $${paramCount}`);
        params.push(user_id);
      }

      if (start_date) {
        paramCount++;
        conditions.push(`al.created_at >= $${paramCount}`);
        params.push(start_date);
      }

      if (end_date) {
        paramCount++;
        conditions.push(`al.created_at <= $${paramCount}`);
        params.push(end_date);
      }

      if (search) {
        paramCount++;
        conditions.push(`(
          al.action ILIKE $${paramCount} OR 
          al.resource_type ILIKE $${paramCount} OR
          u.email ILIKE $${paramCount} OR
          u.full_name ILIKE $${paramCount}
        )`);
        params.push(`%${search}%`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Count query for pagination
      const countQuery = `
        SELECT COUNT(*) as total
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ${whereClause}
      `;

      const countResult = await query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Main data query
      const dataQuery = `
        SELECT 
          al.*,
          u.email as user_email,
          u.full_name as user_name,
          u.role as user_role
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;

      const dataParams = [...params, limit, offset];
      const result = await query(dataQuery, dataParams);

      const totalPages = Math.ceil(total / limit);

      return {
        logs: result.rows,
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      };

    } catch (error) {
      log.error('Audit log search service error', error);
      throw error;
    }
  },

  /**
   * Get audit summary statistics
   */
  async getAuditSummary(businessId, period = '7d') {
    try {
      let interval;
      switch (period) {
        case '1d':
          interval = '1 DAY';
          break;
        case '7d':
          interval = '7 DAYS';
          break;
        case '30d':
          interval = '30 DAYS';
          break;
        case '90d':
          interval = '90 DAYS';
          break;
        default:
          interval = '7 DAYS';
      }

      const summaryQuery = `
        SELECT 
          COUNT(*) as total_actions,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT resource_type) as resource_types,
          COUNT(DISTINCT action) as action_types,
          MAX(created_at) as latest_action,
          MIN(created_at) as earliest_action
        FROM audit_logs 
        WHERE business_id = $1 
        AND created_at >= NOW() - INTERVAL '${interval}'
      `;

      const actionsByTypeQuery = `
        SELECT 
          action,
          COUNT(*) as count
        FROM audit_logs 
        WHERE business_id = $1 
        AND created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY action
        ORDER BY count DESC
        LIMIT 10
      `;

      const actionsByResourceQuery = `
        SELECT 
          resource_type,
          COUNT(*) as count
        FROM audit_logs 
        WHERE business_id = $1 
        AND created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY resource_type
        ORDER BY count DESC
        LIMIT 10
      `;

      const topUsersQuery = `
        SELECT 
          u.id,
          u.email,
          u.full_name,
          u.role,
          COUNT(*) as action_count
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.business_id = $1 
        AND al.created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY u.id, u.email, u.full_name, u.role
        ORDER BY action_count DESC
        LIMIT 10
      `;

      const [summaryResult, actionsByTypeResult, actionsByResourceResult, topUsersResult] = await Promise.all([
        query(summaryQuery, [businessId]),
        query(actionsByTypeQuery, [businessId]),
        query(actionsByResourceQuery, [businessId]),
        query(topUsersQuery, [businessId])
      ]);

      return {
        summary: summaryResult.rows[0],
        actions_by_type: actionsByTypeResult.rows,
        actions_by_resource: actionsByResourceResult.rows,
        top_users: topUsersResult.rows,
        period
      };

    } catch (error) {
      log.error('Audit summary service error', error);
      throw error;
    }
  },

  /**
   * Get specific audit log by ID
   */
  async getAuditLogById(id, businessId) {
    try {
      const queryText = `
        SELECT 
          al.*,
          u.email as user_email,
          u.full_name as user_name,
          u.role as user_role
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.id = $1 AND al.business_id = $2
      `;

      const result = await query(queryText, [id, businessId]);
      return result.rows[0] || null;

    } catch (error) {
      log.error('Get audit log by ID service error', error);
      throw error;
    }
  },

  /**
   * Get recent audit activity
   */
  async getRecentActivity(businessId, limit = 10) {
    try {
      const queryText = `
        SELECT 
          al.id,
          al.action,
          al.resource_type,
          al.resource_id,
          al.created_at,
          u.email as user_email,
          u.full_name as user_name
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.business_id = $1
        ORDER BY al.created_at DESC
        LIMIT $2
      `;

      const result = await query(queryText, [businessId, limit]);
      return result.rows;

    } catch (error) {
      log.error('Recent activity service error', error);
      throw error;
    }
  }
};
