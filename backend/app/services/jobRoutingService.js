import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';

export class JobRoutingService {
  
  // Create SLA configuration
  static async createSLAConfiguration(businessId, slaData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      const query = `
        INSERT INTO sla_configurations (
          business_id, name, description, service_type_id, priority_level,
          response_time_minutes, resolution_time_minutes, escalation_rules
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      
      const values = [
        businessId,
        slaData.name,
        slaData.description || null,
        slaData.service_type_id || null,
        slaData.priority_level || 'medium',
        slaData.response_time_minutes,
        slaData.resolution_time_minutes,
        slaData.escalation_rules || {}
      ];
      
      const result = await client.query(query, values);
      const slaConfig = result.rows[0];
      
      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'sla_configurations.created',
        resourceType: 'sla_configurations',
        resourceId: slaConfig.id,
        newValues: {
          name: slaData.name,
          priority_level: slaData.priority_level
        }
      });
      
      await client.query('COMMIT');
      return slaConfig;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Get SLA configurations
  static async getSLAConfigurations(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT sc.*, s.name as service_name
        FROM sla_configurations sc
        LEFT JOIN services s ON sc.service_type_id = s.id
        WHERE sc.business_id = $1
      `;
      const values = [businessId];
      let paramCount = 1;
      
      if (filters.service_type_id) {
        paramCount++;
        query += ` AND sc.service_type_id = $${paramCount}`;
        values.push(filters.service_type_id);
      }
      
      if (filters.priority_level) {
        paramCount++;
        query += ` AND sc.priority_level = $${paramCount}`;
        values.push(filters.priority_level);
      }
      
      if (filters.is_active !== undefined) {
        paramCount++;
        query += ` AND sc.is_active = $${paramCount}`;
        values.push(filters.is_active);
      }
      
      query += ' ORDER BY sc.created_at DESC';
      
      const result = await client.query(query, values);
      return result.rows;
      
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Create job routing rule
  static async createJobRoutingRule(businessId, ruleData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      const query = `
        INSERT INTO job_routing_rules (
          business_id, name, description, conditions, target_department_id,
          required_skills, priority_boost, max_jobs_per_day
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      
      const values = [
        businessId,
        ruleData.name,
        ruleData.description || null,
        ruleData.conditions,
        ruleData.target_department_id || null,
        ruleData.required_skills || null,
        ruleData.priority_boost || 0,
        ruleData.max_jobs_per_day || null
      ];
      
      const result = await client.query(query, values);
      const routingRule = result.rows[0];
      
      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'job_routing_rules.created',
        resourceType: 'job_routing_rules',
        resourceId: routingRule.id,
        newValues: {
          name: ruleData.name,
          target_department_id: ruleData.target_department_id
        }
      });
      
      await client.query('COMMIT');
      return routingRule;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Auto-assign job based on routing rules
  static async autoAssignJob(businessId, jobId, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      // Get job details
      const jobQuery = `
        SELECT j.*, s.priority, s.service_type_id 
        FROM jobs j 
        LEFT JOIN services s ON j.service_id = s.id 
        WHERE j.id = $1 AND j.business_id = $2
      `;
      const jobResult = await client.query(jobQuery, [jobId, businessId]);
      
      if (jobResult.rows.length === 0) {
        throw new Error('Job not found');
      }
      
      const job = jobResult.rows[0];
      
      // Get active routing rules for this business
      const rulesQuery = `
        SELECT * FROM job_routing_rules 
        WHERE business_id = $1 AND is_active = true
        ORDER BY priority_boost DESC
      `;
      const rulesResult = await client.query(rulesQuery, [businessId]);
      const rules = rulesResult.rows;
      
      let assignedStaffId = null;
      let assignedDepartmentId = null;
      
      // Evaluate rules in priority order
      for (const rule of rules) {
        const conditions = rule.conditions;
        
        // Check if job matches rule conditions
        if (this.evaluateRuleConditions(job, conditions)) {
          // Find available staff based on rule criteria
          const staffQuery = `
            SELECT sp.id, sp.skills
            FROM staff_profiles sp
            WHERE sp.business_id = $1 
            AND sp.is_active = true
            AND sp.department_id = $2
            ${rule.required_skills ? 'AND sp.skills @> $3' : ''}
            AND NOT EXISTS (
              SELECT 1 FROM field_job_assignments fja
              WHERE fja.staff_profile_id = sp.id 
              AND fja.status IN ('assigned', 'in_progress')
              AND fja.business_id = $1
            )
            LIMIT 1
          `;
          
          const staffValues = [businessId, rule.target_department_id];
          if (rule.required_skills) {
            staffValues.push(rule.required_skills);
          }
          
          const staffResult = await client.query(staffQuery, staffValues);
          
          if (staffResult.rows.length > 0) {
            assignedStaffId = staffResult.rows[0].id;
            assignedDepartmentId = rule.target_department_id;
            break;
          }
        }
      }
      
      if (!assignedStaffId) {
        // No auto-assignment possible
        await client.query('ROLLBACK');
        return { assigned: false, message: 'No suitable staff found for auto-assignment' };
      }
      
      // Create field job assignment
      const assignmentQuery = `
        INSERT INTO field_job_assignments (
          business_id, job_id, staff_profile_id, assigned_by,
          estimated_duration_minutes, status
        ) VALUES ($1, $2, $3, $4, $5, 'assigned')
        RETURNING *
      `;
      
      const assignmentResult = await client.query(assignmentQuery, [
        businessId, jobId, assignedStaffId, userId, 60 // Default 60 minutes estimate
      ]);
      
      const assignment = assignmentResult.rows[0];
      
      // Update job status
      await client.query(
        'UPDATE jobs SET status = $1, assigned_to = $2 WHERE id = $3',
        ['assigned', assignedStaffId, jobId]
      );
      
      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'field_job_assignments.created',
        resourceType: 'field_job_assignments',
        resourceId: assignment.id,
        newValues: {
          job_id: jobId,
          staff_profile_id: assignedStaffId,
          department_id: assignedDepartmentId
        }
      });
      
      await client.query('COMMIT');
      return { 
        assigned: true, 
        assignment, 
        staff_profile_id: assignedStaffId,
        department_id: assignedDepartmentId
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Helper method to evaluate rule conditions
  static evaluateRuleConditions(job, conditions) {
    // Simple condition evaluation - can be extended based on business rules
    // For now, assumes conditions is a JSON object with field comparisons
    try {
      for (const [field, expectedValue] of Object.entries(conditions)) {
        const actualValue = job[field];
        if (actualValue !== expectedValue) {
          return false;
        }
      }
      return true;
    } catch (error) {
      return false;
    }
  }
  
  // Get routing rules
  static async getJobRoutingRules(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT jrr.*, d.name as department_name
        FROM job_routing_rules jrr
        LEFT JOIN departments d ON jrr.target_department_id = d.id
        WHERE jrr.business_id = $1
      `;
      const values = [businessId];
      let paramCount = 1;
      
      if (filters.is_active !== undefined) {
        paramCount++;
        query += ` AND jrr.is_active = $${paramCount}`;
        values.push(filters.is_active);
      }
      
      query += ' ORDER BY jrr.priority_boost DESC, jrr.created_at DESC';
      
      const result = await client.query(query, values);
      return result.rows;
      
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
}
