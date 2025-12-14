// backend/app/services/departmentWorkflowService.js
import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export const DepartmentWorkflowService = {
  async createHandoff(businessId, handoffData, userId) {
    const client = await getClient();
    
    try {
      // Use the existing database function
      const result = await client.query(
        `SELECT * FROM process_department_handoff(
          $1, $2, $3, $4, $5, $6
        )`,
        [
          handoffData.job_id,
          handoffData.from_department_id,
          handoffData.to_department_id,
          userId,
          handoffData.handoff_notes || null,
          handoffData.required_actions || null
        ]
      );

      const success = result.rows[0].success;
      const message = result.rows[0].message;

      if (!success) {
        throw new Error(message);
      }

      // Get the created handoff
      const handoffResult = await client.query(
        `SELECT w.*,
          fd.name as from_department_name,
          td.name as to_department_name,
          hb.full_name as handoff_by_name
        FROM department_workflow_states w
        LEFT JOIN departments fd ON w.from_department_id = fd.id
        LEFT JOIN departments td ON w.to_department_id = td.id
        LEFT JOIN users hb ON w.handoff_by = hb.id
        WHERE w.business_id = $1 
          AND w.job_id = $2
          AND w.from_department_id = $3
          AND w.to_department_id = $4
        ORDER BY w.created_at DESC LIMIT 1`,
        [
          businessId,
          handoffData.job_id,
          handoffData.from_department_id,
          handoffData.to_department_id
        ]
      );

      const handoff = handoffResult.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'department-workflow.handoff-created',
        resourceType: 'department-workflow',
        resourceId: handoff.id,
        details: {
          job_id: handoffData.job_id,
          from_department_id: handoffData.from_department_id,
          to_department_id: handoffData.to_department_id
        }
      });

      return handoff;

    } finally {
      client.release();
    }
  },

  async acceptHandoff(businessId, handoffId, assignedTo, userId) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      // Verify handoff exists and is pending
      const handoffCheck = await client.query(
        `SELECT * FROM department_workflow_states 
        WHERE id = $1 AND business_id = $2 AND handoff_status = 'pending'`,
        [handoffId, businessId]
      );

      if (handoffCheck.rows.length === 0) {
        throw new Error('Handoff not found, not pending, or access denied');
      }

      const handoff = handoffCheck.rows[0];

      // Update handoff status to accepted
      await client.query(
        `UPDATE department_workflow_states 
        SET handoff_status = 'accepted', accepted_at = NOW(), handoff_to = $1
        WHERE id = $2`,
        [assignedTo || null, handoffId]
      );

      // Create new assignment for receiving department
      const assignmentResult = await client.query(
        `SELECT * FROM assign_job_to_department(
          $1, $2, $3, 'primary'
        )`,
        [handoff.job_id, handoff.to_department_id, userId]
      );

      const assignmentSuccess = assignmentResult.rows[0].success;
      const assignmentMessage = assignmentResult.rows[0].message;

      if (!assignmentSuccess) {
        throw new Error(`Failed to create assignment: ${assignmentMessage}`);
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'department-workflow.handoff-accepted',
        resourceType: 'department-workflow',
        resourceId: handoffId,
        details: {
          assigned_to: assignedTo,
          job_id: handoff.job_id,
          to_department_id: handoff.to_department_id
        }
      });

      await client.query('COMMIT');

      // Get updated handoff with details
      const updatedHandoff = await this.getHandoffById(businessId, handoffId);
      return updatedHandoff;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async rejectHandoff(businessId, handoffId, rejectionReason, userId) {
    const client = await getClient();
    
    try {
      // Verify handoff exists and is pending
      const handoffCheck = await client.query(
        `SELECT * FROM department_workflow_states 
        WHERE id = $1 AND business_id = $2 AND handoff_status = 'pending'`,
        [handoffId, businessId]
      );

      if (handoffCheck.rows.length === 0) {
        throw new Error('Handoff not found, not pending, or access denied');
      }

      // Update handoff status to rejected
      const result = await client.query(
        `UPDATE department_workflow_states 
        SET handoff_status = 'rejected', handoff_notes = COALESCE($1, handoff_notes)
        WHERE id = $2 AND business_id = $3
        RETURNING *`,
        [rejectionReason ? `REJECTED: ${rejectionReason}` : null, handoffId, businessId]
      );

      const handoff = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'department-workflow.handoff-rejected',
        resourceType: 'department-workflow',
        resourceId: handoffId,
        details: {
          rejection_reason: rejectionReason
        }
      });

      return handoff;

    } finally {
      client.release();
    }
  },

  async getHandoffById(businessId, handoffId) {
    const client = await getClient();
    
    try {
      const result = await client.query(
        `SELECT w.*,
          fd.name as from_department_name,
          td.name as to_department_name,
          hb.full_name as handoff_by_name,
          ht.full_name as handoff_to_name,
          j.job_number,
          j.title as job_title
        FROM department_workflow_states w
        LEFT JOIN departments fd ON w.from_department_id = fd.id
        LEFT JOIN departments td ON w.to_department_id = td.id
        LEFT JOIN users hb ON w.handoff_by = hb.id
        LEFT JOIN users ht ON w.handoff_to = ht.id
        LEFT JOIN jobs j ON w.job_id = j.id
        WHERE w.business_id = $1 AND w.id = $2`,
        [businessId, handoffId]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  },

  async getJobWorkflow(businessId, jobId) {
    const client = await getClient();
    
    try {
      const result = await client.query(
        `SELECT w.*,
          fd.name as from_department_name,
          td.name as to_department_name,
          hb.full_name as handoff_by_name,
          ht.full_name as handoff_to_name,
          j.job_number,
          j.title as job_title
        FROM department_workflow_states w
        LEFT JOIN departments fd ON w.from_department_id = fd.id
        LEFT JOIN departments td ON w.to_department_id = td.id
        LEFT JOIN users hb ON w.handoff_by = hb.id
        LEFT JOIN users ht ON w.handoff_to = ht.id
        LEFT JOIN jobs j ON w.job_id = j.id
        WHERE w.business_id = $1 AND w.job_id = $2
        ORDER BY w.handoff_at DESC`,
        [businessId, jobId]
      );

      return result.rows;
    } finally {
      client.release();
    }
  },

  async getDepartmentHandoffs(businessId, departmentId, status = null) {
    const client = await getClient();
    
    try {
      let query = `
        SELECT w.*,
          fd.name as from_department_name,
          td.name as to_department_name,
          hb.full_name as handoff_by_name,
          ht.full_name as handoff_to_name,
          j.job_number,
          j.title as job_title
        FROM department_workflow_states w
        LEFT JOIN departments fd ON w.from_department_id = fd.id
        LEFT JOIN departments td ON w.to_department_id = td.id
        LEFT JOIN users hb ON w.handoff_by = hb.id
        LEFT JOIN users ht ON w.handoff_to = ht.id
        LEFT JOIN jobs j ON w.job_id = j.id
        WHERE w.business_id = $1 
          AND (w.from_department_id = $2 OR w.to_department_id = $2)
      `;

      const params = [businessId, departmentId];

      if (status) {
        query += ` AND w.handoff_status = $3`;
        params.push(status);
      }

      query += ` ORDER BY w.handoff_at DESC`;

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  },

  async getPendingHandoffs(businessId) {
    const client = await getClient();
    
    try {
      const result = await client.query(
        `SELECT w.*,
          fd.name as from_department_name,
          td.name as to_department_name,
          hb.full_name as handoff_by_name,
          ht.full_name as handoff_to_name,
          j.job_number,
          j.title as job_title
        FROM department_workflow_states w
        LEFT JOIN departments fd ON w.from_department_id = fd.id
        LEFT JOIN departments td ON w.to_department_id = td.id
        LEFT JOIN users hb ON w.handoff_by = hb.id
        LEFT JOIN users ht ON w.handoff_to = ht.id
        LEFT JOIN jobs j ON w.job_id = j.id
        WHERE w.business_id = $1 AND w.handoff_status = 'pending'
        ORDER BY w.handoff_at DESC`,
        [businessId]
      );

      return result.rows;
    } finally {
      client.release();
    }
  }
};
