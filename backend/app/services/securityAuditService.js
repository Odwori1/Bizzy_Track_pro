import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import crypto from 'crypto';

export class SecurityAuditService {

  static async runPermissionAudit(businessId, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Get permission usage through roles (corrected query)
      const permissionUsage = await client.query(`
        SELECT
          p.name as permission_name,
          r.name as role_name,
          COUNT(DISTINCT u.id) as user_count
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        JOIN roles r ON rp.role_id = r.id
        LEFT JOIN users u ON u.role = r.name AND u.business_id = r.business_id
        WHERE r.business_id = $1
        GROUP BY p.name, r.name
        ORDER BY user_count DESC
      `, [businessId]);

      // Get user role distribution (corrected query)
      const userRoles = await client.query(`
        SELECT
          role as role_name,
          COUNT(id) as user_count
        FROM users
        WHERE business_id = $1
        GROUP BY role
        ORDER BY user_count DESC
      `, [businessId]);

      const results = {
        total_permissions: permissionUsage.rows.length,
        permission_breakdown: permissionUsage.rows,
        role_distribution: userRoles.rows,
        audit_timestamp: new Date().toISOString()
      };

      const scan = await client.query(`
        INSERT INTO security_scans
        (business_id, scan_type, scan_name, description, status, results, scanned_by, started_at, completed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *
      `, [
        businessId, 'permission_audit', 'Permission Usage Audit',
        'Analysis of permission assignments and role distribution', 'completed',
        JSON.stringify(results), userId
      ]);

      await client.query('COMMIT');
      return scan.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Permission audit error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async createComplianceFramework(businessId, frameworkData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const result = await client.query(`
        INSERT INTO compliance_frameworks
        (business_id, framework_name, version, description, requirements, applies_to_branches, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        businessId,
        frameworkData.framework_name,
        frameworkData.version,
        frameworkData.description || '',
        JSON.stringify(frameworkData.requirements || {}),
        frameworkData.applies_to_branches || [],
        userId
      ]);

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'compliance_framework.created',
        resourceType: 'compliance_frameworks',
        resourceId: result.rows[0].id,
        newValues: { framework_name: frameworkData.framework_name }
      });

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getSecurityScans(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `SELECT * FROM security_scans WHERE business_id = $1`;
      const values = [businessId];

      if (filters.scan_type) {
        query += ` AND scan_type = $${values.length + 1}`;
        values.push(filters.scan_type);
      }

      query += ' ORDER BY created_at DESC';

      const result = await client.query(query, values);
      return result.rows;
    } finally {
      client.release();
    }
  }

  static async getComplianceFrameworks(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT * FROM compliance_frameworks WHERE business_id = $1 ORDER BY created_at DESC`,
        [businessId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  // NEW METHODS FOR WEEK 16 COMPLETION
  static async collectSecurityMetrics(businessId) {
    const client = await getClient();
    try {
      // Get user permission statistics (corrected query)
      const userStats = await client.query(`
        SELECT
          COUNT(DISTINCT u.id) as total_users,
          COUNT(DISTINCT r.id) as total_roles,
          COUNT(DISTINCT rp.permission_id) as total_permissions
        FROM users u
        LEFT JOIN roles r ON r.business_id = $1
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        WHERE u.business_id = $1
      `, [businessId]);

      // Get security scan statistics
      const scanStats = await client.query(`
        SELECT
          scan_type,
          status,
          COUNT(*) as count
        FROM security_scans
        WHERE business_id = $1
        GROUP BY scan_type, status
      `, [businessId]);

      // Get compliance framework statistics
      const complianceStats = await client.query(`
        SELECT
          COUNT(*) as total_frameworks,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_frameworks
        FROM compliance_frameworks
        WHERE business_id = $1
      `, [businessId]);

      return {
        user_metrics: userStats.rows[0],
        scan_metrics: scanStats.rows,
        compliance_metrics: complianceStats.rows[0],
        collected_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Security metrics collection error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async verifyAuditTrail(businessId) {
    const client = await getClient();
    try {
      // Check for gaps in audit trail
      const auditGaps = await client.query(`
        WITH daily_counts AS (
          SELECT
            DATE(created_at) as audit_date,
            COUNT(*) as audit_count
          FROM audit_logs
          WHERE business_id = $1
          AND created_at >= NOW() - INTERVAL '30 days'
          GROUP BY DATE(created_at)
        )
        SELECT
          audit_date,
          audit_count,
          LAG(audit_count) OVER (ORDER BY audit_date) as prev_day_count,
          CASE
            WHEN LAG(audit_count) OVER (ORDER BY audit_date) IS NULL THEN 'First day'
            WHEN audit_count = 0 THEN 'GAP - No audits'
            WHEN audit_count < (LAG(audit_count) OVER (ORDER BY audit_date) * 0.5) THEN 'SUSPICIOUS - Significant drop'
            ELSE 'NORMAL'
          END as status
        FROM daily_counts
        ORDER BY audit_date DESC
      `, [businessId]);

      // Check for suspicious activities
      const suspiciousActivities = await client.query(`
        SELECT
          action,
          COUNT(*) as activity_count,
          ARRAY_AGG(DISTINCT user_id) as users_involved
        FROM audit_logs
        WHERE business_id = $1
        AND created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY action
        HAVING COUNT(*) > 10
      `, [businessId]);

      return {
        audit_gaps: auditGaps.rows,
        suspicious_activities: suspiciousActivities.rows,
        verification_timestamp: new Date().toISOString(),
        total_days_checked: auditGaps.rows.length
      };
    } catch (error) {
      console.error('Audit trail verification error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async logComplianceAudit(businessId, userId, action, details) {
    const client = await getClient();
    try {
      // Attempt to insert into compliance_audit_logs
      const result = await client.query(`
        INSERT INTO compliance_audit_logs 
        (business_id, action, details, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING *
      `, [businessId, action, JSON.stringify(details)]);

      return result.rows[0];
    } catch (error) {
      console.error('Compliance audit log error:', error.message);
      
      // Fallback: log to audit_logs if compliance_audit_logs table doesn't exist or has issues
      const fallbackResult = await client.query(`
        INSERT INTO audit_logs 
        (business_id, user_id, action, resource_type, new_values, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *
      `, [businessId, userId, `compliance:${action}`, 'compliance_audit', JSON.stringify(details)]);

      return {
        id: fallbackResult.rows[0].id,
        business_id: businessId,
        action: action,
        details: details,
        created_at: fallbackResult.rows[0].created_at
      };
    } finally {
      client.release();
    }
  }

  static async getSecurityAnalytics(businessId, period = '7 days') {
    const client = await getClient();
    try {
      // Get permission usage trends (corrected query)
      const permissionTrends = await client.query(`
        SELECT
          DATE(al.created_at) as date,
          COUNT(*) as permission_changes
        FROM audit_logs al
        WHERE al.business_id = $1
        AND al.action LIKE '%permission%'
        AND al.created_at >= NOW() - INTERVAL '${period}'
        GROUP BY DATE(al.created_at)
        ORDER BY date DESC
      `, [businessId]);

      // Get security scan trends
      const scanTrends = await client.query(`
        SELECT
          DATE(created_at) as date,
          scan_type,
          COUNT(*) as scan_count
        FROM security_scans
        WHERE business_id = $1
        AND created_at >= NOW() - INTERVAL '${period}'
        GROUP BY DATE(created_at), scan_type
        ORDER BY date DESC, scan_type
      `, [businessId]);

      // Get top permissions by usage (corrected query)
      const topPermissions = await client.query(`
        SELECT
          p.name as permission,
          COUNT(DISTINCT u.id) as user_count
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        JOIN roles r ON rp.role_id = r.id
        LEFT JOIN users u ON u.role = r.name AND u.business_id = r.business_id
        WHERE r.business_id = $1
        GROUP BY p.name
        ORDER BY user_count DESC
        LIMIT 10
      `, [businessId]);

      return {
        permission_trends: permissionTrends.rows,
        scan_trends: scanTrends.rows,
        top_permissions: topPermissions.rows,
        analytics_period: period,
        generated_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Security analytics error:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
