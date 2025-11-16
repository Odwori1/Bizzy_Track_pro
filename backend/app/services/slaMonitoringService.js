import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';

export class SLAMonitoringService {
  
  // Check for SLA violations
  static async checkSLAViolations(businessId) {
    const client = await getClient();
    try {
      // Check for response time violations
      const responseTimeQuery = `
        INSERT INTO sla_violation_logs (
          business_id, job_id, sla_configuration_id, violation_type,
          expected_time, actual_time, violation_minutes
        )
        SELECT 
          j.business_id,
          j.id as job_id,
          sc.id as sla_configuration_id,
          'response_time' as violation_type,
          (j.created_at + (sc.response_time_minutes || ' minutes')::INTERVAL) as expected_time,
          NOW() as actual_time,
          EXTRACT(EPOCH FROM (NOW() - (j.created_at + (sc.response_time_minutes || ' minutes')::INTERVAL)))/60 as violation_minutes
        FROM jobs j
        INNER JOIN sla_configurations sc ON (
          (sc.service_type_id IS NULL OR sc.service_type_id = j.service_id) 
          AND sc.is_active = true
        )
        WHERE j.business_id = $1
        AND j.status NOT IN ('completed', 'cancelled')
        AND j.created_at + (sc.response_time_minutes || ' minutes')::INTERVAL < NOW()
        AND NOT EXISTS (
          SELECT 1 FROM sla_violation_logs svl
          WHERE svl.job_id = j.id 
          AND svl.violation_type = 'response_time'
          AND svl.sla_configuration_id = sc.id
        )
        RETURNING *
      `;
      
      const responseResult = await client.query(responseTimeQuery, [businessId]);
      const responseViolations = responseResult.rows;
      
      // Check for resolution time violations
      const resolutionTimeQuery = `
        INSERT INTO sla_violation_logs (
          business_id, job_id, sla_configuration_id, violation_type,
          expected_time, actual_time, violation_minutes
        )
        SELECT 
          j.business_id,
          j.id as job_id,
          sc.id as sla_configuration_id,
          'resolution_time' as violation_type,
          (j.created_at + (sc.resolution_time_minutes || ' minutes')::INTERVAL) as expected_time,
          NOW() as actual_time,
          EXTRACT(EPOCH FROM (NOW() - (j.created_at + (sc.resolution_time_minutes || ' minutes')::INTERVAL)))/60 as violation_minutes
        FROM jobs j
        INNER JOIN sla_configurations sc ON (
          (sc.service_type_id IS NULL OR sc.service_type_id = j.service_id) 
          AND sc.is_active = true
        )
        WHERE j.business_id = $1
        AND j.status NOT IN ('completed', 'cancelled')
        AND j.created_at + (sc.resolution_time_minutes || ' minutes')::INTERVAL < NOW()
        AND NOT EXISTS (
          SELECT 1 FROM sla_violation_logs svl
          WHERE svl.job_id = j.id 
          AND svl.violation_type = 'resolution_time'
          AND svl.sla_configuration_id = sc.id
        )
        RETURNING *
      `;
      
      const resolutionResult = await client.query(resolutionTimeQuery, [businessId]);
      const resolutionViolations = resolutionResult.rows;
      
      const allViolations = [...responseViolations, ...resolutionViolations];
      
      // Log violations for monitoring
      if (allViolations.length > 0) {
        console.log(`Detected ${allViolations.length} SLA violations for business ${businessId}`);
      }
      
      return allViolations;
      
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Get SLA violation statistics
  static async getSLAViolationStats(businessId, period = '30 days') {
    const client = await getClient();
    try {
      const query = `
        SELECT 
          violation_type,
          COUNT(*) as violation_count,
          AVG(violation_minutes) as avg_violation_minutes,
          MAX(violation_minutes) as max_violation_minutes,
          sc.name as sla_config_name
        FROM sla_violation_logs svl
        INNER JOIN sla_configurations sc ON svl.sla_configuration_id = sc.id
        WHERE svl.business_id = $1
        AND svl.created_at >= NOW() - ($2 || ' days')::INTERVAL
        GROUP BY violation_type, sc.name
        ORDER BY violation_count DESC
      `;
      
      const result = await client.query(query, [businessId, period]);
      return result.rows;
      
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Escalate SLA violation
  static async escalateViolation(businessId, violationId, escalationData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      const query = `
        UPDATE sla_violation_logs 
        SET escalated_to = $1, escalation_level = $2, resolution_notes = $3
        WHERE id = $4 AND business_id = $5
        RETURNING *
      `;
      
      const values = [
        escalationData.escalated_to,
        escalationData.escalation_level || 1,
        escalationData.resolution_notes || null,
        violationId,
        businessId
      ];
      
      const result = await client.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('SLA violation not found');
      }
      
      const violation = result.rows[0];
      
      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'sla_violation_logs.escalated',
        resourceType: 'sla_violation_logs',
        resourceId: violationId,
        newValues: {
          escalated_to: escalationData.escalated_to,
          escalation_level: escalationData.escalation_level
        }
      });
      
      await client.query('COMMIT');
      return violation;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Get active SLA violations
  static async getActiveViolations(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT 
          svl.*,
          j.job_number,
          j.description as job_description,
          sc.name as sla_config_name,
          u.first_name as escalated_to_first_name,
          u.last_name as escalated_to_last_name
        FROM sla_violation_logs svl
        INNER JOIN jobs j ON svl.job_id = j.id
        INNER JOIN sla_configurations sc ON svl.sla_configuration_id = sc.id
        LEFT JOIN users u ON svl.escalated_to = u.id
        WHERE svl.business_id = $1
      `;
      const values = [businessId];
      let paramCount = 1;
      
      if (filters.violation_type) {
        paramCount++;
        query += ` AND svl.violation_type = $${paramCount}`;
        values.push(filters.violation_type);
      }
      
      if (filters.escalated === false) {
        query += ` AND svl.escalated_to IS NULL`;
      }
      
      if (filters.start_date) {
        paramCount++;
        query += ` AND svl.created_at >= $${paramCount}`;
        values.push(filters.start_date);
      }
      
      query += ' ORDER BY svl.created_at DESC';
      
      const result = await client.query(query, values);
      return result.rows;
      
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
}
