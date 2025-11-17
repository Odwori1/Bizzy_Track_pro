import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import crypto from 'crypto';

export class SecurityAuditService {
  
  static async runPermissionAudit(businessId, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      // Analyze permission usage
      const permissionUsage = await client.query(`
        SELECT permission_name, COUNT(DISTINCT user_id) as user_count
        FROM user_permissions 
        WHERE business_id = $1
        GROUP BY permission_name
      `, [businessId]);
      
      const results = {
        total_permissions: permissionUsage.rows.length,
        permission_breakdown: permissionUsage.rows,
        audit_timestamp: new Date().toISOString()
      };
      
      const scan = await client.query(`
        INSERT INTO security_scans 
        (business_id, scan_type, scan_name, description, status, results, scanned_by, started_at, completed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *
      `, [
        businessId, 'permission_audit', 'Permission Usage Audit', 
        'Analysis of permission assignments', 'completed',
        JSON.stringify(results), userId
      ]);
      
      await client.query('COMMIT');
      return scan.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
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
}
