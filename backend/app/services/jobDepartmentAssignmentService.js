import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class JobDepartmentAssignmentService {
  /**
   * Create a new job department assignment
   */
  static async createAssignment(businessId, assignmentData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify job belongs to business
      const jobCheck = await client.query(
        'SELECT id FROM jobs WHERE id = $1 AND business_id = $2',
        [assignmentData.job_id, businessId]
      );

      if (jobCheck.rows.length === 0) {
        throw new Error('Job not found or access denied');
      }

      // Verify department belongs to business
      const deptCheck = await client.query(
        'SELECT id FROM departments WHERE id = $1 AND business_id = $2',
        [assignmentData.department_id, businessId]
      );

      if (deptCheck.rows.length === 0) {
        throw new Error('Department not found or access denied');
      }

      // Check for duplicate assignment
      const duplicateCheck = await client.query(
        `SELECT id FROM job_department_assignments 
         WHERE business_id = $1 AND job_id = $2 AND department_id = $3 
         AND assignment_type = $4`,
        [
          businessId,
          assignmentData.job_id,
          assignmentData.department_id,
          assignmentData.assignment_type || 'primary'
        ]
      );

      if (duplicateCheck.rows.length > 0) {
        throw new Error('Department already assigned to this job');
      }

      // Insert assignment
      const result = await client.query(
        `INSERT INTO job_department_assignments (
          business_id, job_id, department_id, assigned_by,
          assignment_type, status, priority, estimated_hours,
          scheduled_start, scheduled_end, notes, sla_deadline
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          businessId,
          assignmentData.job_id,
          assignmentData.department_id,
          userId,
          assignmentData.assignment_type || 'primary',
          assignmentData.status || 'assigned',
          assignmentData.priority || 'medium',
          assignmentData.estimated_hours || null,
          assignmentData.scheduled_start || null,
          assignmentData.scheduled_end || null,
          assignmentData.notes || '',
          assignmentData.sla_deadline || null
        ]
      );

      const assignment = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'department-assignment.created',
        resourceType: 'department-assignment',
        resourceId: assignment.id,
        newValues: {
          job_id: assignment.job_id,
          department_id: assignment.department_id,
          status: assignment.status,
          priority: assignment.priority
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
   * Get assignments with filters
   */
  static async getAssignments(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT 
          jda.*,
          j.job_number,
          j.title as job_title,
          j.status as job_status,
          d.name as department_name,
          d.code as department_code,
          d.color_hex as department_color,
          u_assigned_by.full_name as assigned_by_name,
          u_assigned_to.full_name as assigned_to_name
        FROM job_department_assignments jda
        JOIN jobs j ON jda.job_id = j.id
        JOIN departments d ON jda.department_id = d.id
        LEFT JOIN users u_assigned_by ON jda.assigned_by = u_assigned_by.id
        LEFT JOIN users u_assigned_to ON jda.assigned_to = u_assigned_to.id
        WHERE jda.business_id = $1
      `;
      
      const params = [businessId];
      let paramCount = 1;

      // Apply filters
      if (filters.status) {
        paramCount++;
        queryStr += ` AND jda.status = $${paramCount}`;
        params.push(filters.status);
      }

      if (filters.department_id) {
        paramCount++;
        queryStr += ` AND jda.department_id = $${paramCount}`;
        params.push(filters.department_id);
      }

      if (filters.job_id) {
        paramCount++;
        queryStr += ` AND jda.job_id = $${paramCount}`;
        params.push(filters.job_id);
      }

      if (filters.priority) {
        paramCount++;
        queryStr += ` AND jda.priority = $${paramCount}`;
        params.push(filters.priority);
      }

      if (filters.date_from) {
        paramCount++;
        queryStr += ` AND jda.created_at >= $${paramCount}`;
        params.push(filters.date_from);
      }

      if (filters.date_to) {
        paramCount++;
        queryStr += ` AND jda.created_at <= $${paramCount}`;
        params.push(filters.date_to);
      }

      queryStr += ' ORDER BY jda.created_at DESC';

      if (filters.limit) {
        paramCount++;
        queryStr += ` LIMIT $${paramCount}`;
        params.push(parseInt(filters.limit));
      }

      if (filters.offset) {
        paramCount++;
        queryStr += ` OFFSET $${paramCount}`;
        params.push(parseInt(filters.offset));
      }

      log.info('🗄️ Database Query - getAssignments:', { query: queryStr, params });

      const result = await client.query(queryStr, params);

      log.info('✅ Assignments query successful', {
        rowCount: result.rows.length,
        businessId
      });

      return result.rows;
    } catch (error) {
      log.error('❌ Assignments query failed:', {
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
   * Get assignments by job
   */
  static async getAssignmentsByJob(businessId, jobId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT 
          jda.*,
          d.name as department_name,
          d.code as department_code,
          d.color_hex as department_color,
          d.department_type,
          u_assigned_by.full_name as assigned_by_name,
          u_assigned_to.full_name as assigned_to_name
        FROM job_department_assignments jda
        JOIN departments d ON jda.department_id = d.id
        LEFT JOIN users u_assigned_by ON jda.assigned_by = u_assigned_by.id
        LEFT JOIN users u_assigned_to ON jda.assigned_to = u_assigned_to.id
        WHERE jda.business_id = $1 AND jda.job_id = $2
        ORDER BY jda.created_at ASC
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
   * Get assignments by department
   */
  static async getAssignmentsByDepartment(businessId, departmentId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT 
          jda.*,
          j.job_number,
          j.title as job_title,
          j.status as job_status,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name,
          u_assigned_by.full_name as assigned_by_name,
          u_assigned_to.full_name as assigned_to_name
        FROM job_department_assignments jda
        JOIN jobs j ON jda.job_id = j.id
        LEFT JOIN customers c ON j.customer_id = c.id
        LEFT JOIN users u_assigned_by ON jda.assigned_by = u_assigned_by.id
        LEFT JOIN users u_assigned_to ON jda.assigned_to = u_assigned_to.id
        WHERE jda.business_id = $1 AND jda.department_id = $2
      `;
      
      const params = [businessId, departmentId];
      let paramCount = 2;

      if (filters.status) {
        paramCount++;
        queryStr += ` AND jda.status = $${paramCount}`;
        params.push(filters.status);
      }

      if (filters.date_from) {
        paramCount++;
        queryStr += ` AND jda.created_at >= $${paramCount}`;
        params.push(filters.date_from);
      }

      if (filters.date_to) {
        paramCount++;
        queryStr += ` AND jda.created_at <= $${paramCount}`;
        params.push(filters.date_to);
      }

      queryStr += ' ORDER BY jda.priority DESC, jda.created_at DESC';

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
   * Get assignment by ID
   */
  static async getAssignmentById(businessId, assignmentId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT 
          jda.*,
          j.job_number,
          j.title as job_title,
          j.status as job_status,
          d.name as department_name,
          d.code as department_code,
          d.color_hex as department_color,
          u_assigned_by.full_name as assigned_by_name,
          u_assigned_to.full_name as assigned_to_name
        FROM job_department_assignments jda
        JOIN jobs j ON jda.job_id = j.id
        JOIN departments d ON jda.department_id = d.id
        LEFT JOIN users u_assigned_by ON jda.assigned_by = u_assigned_by.id
        LEFT JOIN users u_assigned_to ON jda.assigned_to = u_assigned_to.id
        WHERE jda.business_id = $1 AND jda.id = $2
      `;

      const result = await client.query(queryStr, [businessId, assignmentId]);

      if (result.rows.length === 0) {
        throw new Error('Assignment not found or access denied');
      }

      return result.rows[0];
    } catch (error) {
      log.error('❌ Assignment query failed:', {
        error: error.message,
        businessId,
        assignmentId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update assignment
   */
  static async updateAssignment(businessId, assignmentId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get current assignment
      const currentAssignment = await client.query(
        'SELECT * FROM job_department_assignments WHERE id = $1 AND business_id = $2',
        [assignmentId, businessId]
      );

      if (currentAssignment.rows.length === 0) {
        throw new Error('Assignment not found or access denied');
      }

      // Build update query
      const updateFields = [];
      const updateValues = [];
      let paramCount = 0;

      const allowedFields = [
        'assigned_to', 'status', 'priority', 'estimated_hours', 'actual_hours',
        'scheduled_start', 'scheduled_end', 'actual_start', 'actual_end',
        'notes', 'sla_deadline'
      ];

      Object.keys(updateData).forEach(key => {
        if (allowedFields.includes(key) && updateData[key] !== undefined) {
          paramCount++;
          updateFields.push(`${key} = $${paramCount}`);
          updateValues.push(updateData[key]);
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
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

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'department-assignment.updated',
        resourceType: 'department-assignment',
        resourceId: assignmentId,
        oldValues: currentAssignment.rows[0],
        newValues: updatedAssignment
      });

      await client.query('COMMIT');
      return updatedAssignment;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete assignment
   */
  static async deleteAssignment(businessId, assignmentId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get current assignment
      const currentAssignment = await client.query(
        'SELECT * FROM job_department_assignments WHERE id = $1 AND business_id = $2',
        [assignmentId, businessId]
      );

      if (currentAssignment.rows.length === 0) {
        throw new Error('Assignment not found or access denied');
      }

      // Delete assignment
      await client.query(
        'DELETE FROM job_department_assignments WHERE id = $1 AND business_id = $2',
        [assignmentId, businessId]
      );

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'department-assignment.deleted',
        resourceType: 'department-assignment',
        resourceId: assignmentId,
        oldValues: currentAssignment.rows[0]
      });

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
