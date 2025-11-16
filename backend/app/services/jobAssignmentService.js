import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class JobAssignmentService {
  /**
   * Assign job to department (Hospital-style routing)
   */
  static async assignJobToDepartment(businessId, assignmentData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify job exists and belongs to business
      const jobCheck = await client.query(
        'SELECT id, status FROM jobs WHERE id = $1 AND business_id = $2',
        [assignmentData.job_id, businessId]
      );

      if (jobCheck.rows.length === 0) {
        throw new Error('Job not found or access denied');
      }

      // Verify department exists and belongs to business
      const departmentCheck = await client.query(
        'SELECT id, name FROM departments WHERE id = $1 AND business_id = $2 AND is_active = true',
        [assignmentData.department_id, businessId]
      );

      if (departmentCheck.rows.length === 0) {
        throw new Error('Department not found or access denied');
      }

      // Use the PostgreSQL function to assign job
      const assignmentResult = await client.query(
        'SELECT * FROM assign_job_to_department($1, $2, $3, $4)',
        [
          assignmentData.job_id,
          assignmentData.department_id,
          userId,
          assignmentData.assignment_type || 'primary'
        ]
      );

      if (!assignmentResult.rows[0].success) {
        throw new Error(assignmentResult.rows[0].message);
      }

      // Get the complete assignment details
      const assignmentQuery = `
        SELECT jda.*,
               j.title as job_title,
               j.status as job_status,
               d.name as department_name,
               d.department_type,
               u.full_name as assigned_by_name,
               u2.full_name as assigned_to_name
        FROM job_department_assignments jda
        JOIN jobs j ON jda.job_id = j.id
        JOIN departments d ON jda.department_id = d.id
        JOIN users u ON jda.assigned_by = u.id
        LEFT JOIN users u2 ON jda.assigned_to = u2.id
        WHERE jda.job_id = $1 AND jda.department_id = $2
        AND jda.business_id = $3
      `;

      const result = await client.query(assignmentQuery, [
        assignmentData.job_id,
        assignmentData.department_id,
        businessId
      ]);

      const assignment = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'job.assigned_to_department',
        resourceType: 'job_assignment',
        resourceId: assignment.id,
        newValues: {
          job_id: assignment.job_id,
          department_id: assignment.department_id,
          department_name: assignment.department_name,
          assignment_type: assignment.assignment_type
        }
      });

      await client.query('COMMIT');
      return assignment;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process department handoff (Hospital-style transfer)
   */
  static async processDepartmentHandoff(businessId, handoffData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Use the PostgreSQL function to process handoff
      const handoffResult = await client.query(
        'SELECT * FROM process_department_handoff($1, $2, $3, $4, $5, $6)',
        [
          handoffData.job_id,
          handoffData.from_department_id,
          handoffData.to_department_id,
          userId,
          handoffData.handoff_notes || '',
          handoffData.required_actions || null
        ]
      );

      if (!handoffResult.rows[0].success) {
        throw new Error(handoffResult.rows[0].message);
      }

      // Get the workflow state details
      const workflowQuery = `
        SELECT dws.*,
               from_dept.name as from_department_name,
               to_dept.name as to_department_name,
               handoff_by_user.full_name as handoff_by_name,
               handoff_to_user.full_name as handoff_to_name,
               j.title as job_title
        FROM department_workflow_states dws
        JOIN departments from_dept ON dws.from_department_id = from_dept.id
        JOIN departments to_dept ON dws.to_department_id = to_dept.id
        JOIN users handoff_by_user ON dws.handoff_by = handoff_by_user.id
        LEFT JOIN users handoff_to_user ON dws.handoff_to = handoff_to_user.id
        JOIN jobs j ON dws.job_id = j.id
        WHERE dws.job_id = $1 AND dws.from_department_id = $2
        AND dws.to_department_id = $3 AND dws.business_id = $4
        ORDER BY dws.created_at DESC LIMIT 1
      `;

      const result = await client.query(workflowQuery, [
        handoffData.job_id,
        handoffData.from_department_id,
        handoffData.to_department_id,
        businessId
      ]);

      const workflowState = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'department.handoff_processed',
        resourceType: 'workflow_state',
        resourceId: workflowState.id,
        newValues: {
          job_id: workflowState.job_id,
          from_department: workflowState.from_department_name,
          to_department: workflowState.to_department_name,
          handoff_status: workflowState.handoff_status
        }
      });

      await client.query('COMMIT');
      return workflowState;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get department assignments for a job
   */
  static async getJobAssignments(businessId, jobId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT jda.*,
               d.name as department_name,
               d.department_type,
               d.color_hex,
               u.full_name as assigned_by_name,
               u2.full_name as assigned_to_name,
               j.title as job_title,
               c.first_name as customer_first_name,
               c.last_name as customer_last_name
        FROM job_department_assignments jda
        JOIN departments d ON jda.department_id = d.id
        JOIN jobs j ON jda.job_id = j.id
        JOIN users u ON jda.assigned_by = u.id
        LEFT JOIN users u2 ON jda.assigned_to = u2.id
        LEFT JOIN customers c ON j.customer_id = c.id
        WHERE jda.business_id = $1 AND jda.job_id = $2
        ORDER BY jda.created_at DESC
      `;

      const result = await client.query(queryStr, [businessId, jobId]);
      return result.rows;
    } catch (error) {
      log.error('❌ Job assignments query failed:', {
        error: error.message,
        businessId,
        jobId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get active assignments for a department
   */
  static async getDepartmentAssignments(businessId, departmentId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT jda.*,
               j.title as job_title,
               j.status as job_status,
               j.priority as job_priority,
               c.first_name as customer_first_name,
               c.last_name as customer_last_name,
               c.phone as customer_phone,
               u.full_name as assigned_to_name
        FROM job_department_assignments jda
        JOIN jobs j ON jda.job_id = j.id
        LEFT JOIN customers c ON j.customer_id = c.id
        LEFT JOIN users u ON jda.assigned_to = u.id
        WHERE jda.business_id = $1 AND jda.department_id = $2
      `;
      const params = [businessId, departmentId];
      let paramCount = 2;

      if (filters.status) {
        paramCount++;
        queryStr += ` AND jda.status = $${paramCount}`;
        params.push(filters.status);
      }

      if (filters.priority) {
        paramCount++;
        queryStr += ` AND jda.priority = $${paramCount}`;
        params.push(filters.priority);
      }

      queryStr += ' ORDER BY jda.priority DESC, jda.created_at ASC';

      if (filters.limit) {
        paramCount++;
        queryStr += ` LIMIT $${paramCount}`;
        params.push(filters.limit);
      }

      const result = await client.query(queryStr, params);
      return result.rows;
    } catch (error) {
      log.error('❌ Department assignments query failed:', {
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
   * Update job assignment status
   */
  static async updateJobAssignment(businessId, assignmentId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify assignment belongs to business and get current values
      const currentAssignment = await client.query(
        'SELECT * FROM job_department_assignments WHERE id = $1 AND business_id = $2',
        [assignmentId, businessId]
      );

      if (currentAssignment.rows.length === 0) {
        throw new Error('Job assignment not found or access denied');
      }

      // Build dynamic update query
      const updateFields = [];
      const updateValues = [];
      let paramCount = 0;

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          paramCount++;
          updateFields.push(`${key} = $${paramCount}`);
          updateValues.push(updateData[key]);
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      paramCount++;
      updateFields.push(`updated_at = $${paramCount}`);
      updateValues.push(new Date());

      paramCount++;
      updateValues.push(assignmentId);
      paramCount++;
      updateValues.push(businessId);

      const updateQuery = `
        UPDATE job_department_assignments
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount - 1} AND business_id = $${paramCount}
        RETURNING *
      `;

      const result = await client.query(updateQuery, updateValues);
      const updatedAssignment = result.rows[0];

      // Get complete assignment details with joins
      const completeAssignmentQuery = `
        SELECT jda.*, 
               j.title as job_title,
               j.status as job_status,
               d.name as department_name,
               d.department_type,
               d.color_hex,
               u.full_name as assigned_by_name,
               u2.full_name as assigned_to_name
        FROM job_department_assignments jda
        JOIN jobs j ON jda.job_id = j.id
        JOIN departments d ON jda.department_id = d.id
        JOIN users u ON jda.assigned_by = u.id
        LEFT JOIN users u2 ON jda.assigned_to = u2.id
        WHERE jda.id = $1 AND jda.business_id = $2
      `;

      const completeResult = await client.query(completeAssignmentQuery, [assignmentId, businessId]);
      const completeAssignment = completeResult.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'job_assignment.updated',
        resourceType: 'job_assignment',
        resourceId: assignmentId,
        oldValues: currentAssignment.rows[0],
        newValues: updatedAssignment
      });

      await client.query('COMMIT');
      return completeAssignment;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
