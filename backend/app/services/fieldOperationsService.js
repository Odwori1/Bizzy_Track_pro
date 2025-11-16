import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';

export class FieldOperationsService {

  // Create field checklist template - FIXED JSON ISSUE
  static async createChecklistTemplate(businessId, templateData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO field_checklist_templates (
          business_id, name, description, service_type_id, items
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const values = [
        businessId,
        templateData.name,
        templateData.description || null,
        templateData.service_type_id || null,
        JSON.stringify(templateData.items || []) // FIXED: Added JSON.stringify
      ];

      const result = await client.query(query, values);
      const template = result.rows[0];

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'field_checklist_templates.created',
        resourceType: 'field_checklist_templates',
        resourceId: template.id,
        newValues: {
          name: templateData.name,
          service_type_id: templateData.service_type_id
        }
      });

      await client.query('COMMIT');
      return template;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get checklist templates
  static async getChecklistTemplates(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT fct.*, s.name as service_name
        FROM field_checklist_templates fct
        LEFT JOIN services s ON fct.service_type_id = s.id
        WHERE fct.business_id = $1
      `;
      const values = [businessId];
      let paramCount = 1;

      if (filters.service_type_id) {
        paramCount++;
        query += ` AND fct.service_type_id = $${paramCount}`;
        values.push(filters.service_type_id);
      }

      if (filters.is_active !== undefined) {
        paramCount++;
        query += ` AND fct.is_active = $${paramCount}`;
        values.push(filters.is_active);
      }

      query += ' ORDER BY fct.created_at DESC';

      const result = await client.query(query, values);
      return result.rows;

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Manual job assignment
  static async assignJobToStaff(businessId, assignmentData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO field_job_assignments (
          business_id, job_id, staff_profile_id, assigned_by,
          estimated_duration_minutes, status
        ) VALUES ($1, $2, $3, $4, $5, 'assigned')
        RETURNING *
      `;

      const values = [
        businessId,
        assignmentData.job_id,
        assignmentData.staff_profile_id,
        userId,
        assignmentData.estimated_duration_minutes || 60
      ];

      const result = await client.query(query, values);
      const assignment = result.rows[0];

      // Update job status
      await client.query(
        'UPDATE jobs SET status = $1, assigned_to = $2 WHERE id = $3',
        ['assigned', assignmentData.staff_profile_id, assignmentData.job_id]
      );

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'field_job_assignments.created',
        resourceType: 'field_job_assignments',
        resourceId: assignment.id,
        newValues: {
          job_id: assignmentData.job_id,
          staff_profile_id: assignmentData.staff_profile_id
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

  // Record location tracking
  static async recordLocation(businessId, locationData, userId) {
    const client = await getClient();
    try {
      const query = `
        INSERT INTO location_tracking (
          business_id, staff_profile_id, field_job_assignment_id,
          latitude, longitude, accuracy, device_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const values = [
        businessId,
        locationData.staff_profile_id,
        locationData.field_job_assignment_id || null,
        locationData.latitude,
        locationData.longitude,
        locationData.accuracy || null,
        locationData.device_id || null
      ];

      const result = await client.query(query, values);
      return result.rows[0];

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get field job assignments - FIXED SQL COLUMN ISSUE
  static async getFieldJobAssignments(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT
          fja.*,
          j.job_number,
          j.description as job_description,
          sp.user_id as staff_user_id,
          u.full_name as staff_full_name, -- FIXED: Changed from first_name/last_name to full_name
          d.name as department_name
        FROM field_job_assignments fja
        INNER JOIN jobs j ON fja.job_id = j.id
        INNER JOIN staff_profiles sp ON fja.staff_profile_id = sp.id
        INNER JOIN users u ON sp.user_id = u.id
        LEFT JOIN departments d ON sp.department_id = d.id
        WHERE fja.business_id = $1
      `;
      const values = [businessId];
      let paramCount = 1;

      if (filters.staff_profile_id) {
        paramCount++;
        query += ` AND fja.staff_profile_id = $${paramCount}`;
        values.push(filters.staff_profile_id);
      }

      if (filters.status) {
        paramCount++;
        query += ` AND fja.status = $${paramCount}`;
        values.push(filters.status);
      }

      if (filters.start_date) {
        paramCount++;
        query += ` AND fja.assigned_at >= $${paramCount}`;
        values.push(filters.start_date);
      }

      if (filters.end_date) {
        paramCount++;
        query += ` AND fja.assigned_at <= $${paramCount}`;
        values.push(filters.end_date);
      }

      query += ' ORDER BY fja.assigned_at DESC';

      const result = await client.query(query, values);
      return result.rows;

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Update field job assignment status
  static async updateAssignmentStatus(businessId, assignmentId, statusData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Get current assignment for audit
      const currentAssignment = await client.query(
        'SELECT * FROM field_job_assignments WHERE id = $1 AND business_id = $2',
        [assignmentId, businessId]
      );

      if (currentAssignment.rows.length === 0) {
        throw new Error('Field job assignment not found');
      }

      const oldAssignment = currentAssignment.rows[0];

      const query = `
        UPDATE field_job_assignments
        SET status = $1, completion_notes = $2, customer_feedback = $3, customer_rating = $4
        WHERE id = $5 AND business_id = $6
        RETURNING *
      `;

      const values = [
        statusData.status,
        statusData.completion_notes || null,
        statusData.customer_feedback || null,
        statusData.customer_rating || null,
        assignmentId,
        businessId
      ];

      const result = await client.query(query, values);
      const assignment = result.rows[0];

      // Update job status if assignment is completed
      if (statusData.status === 'completed') {
        await client.query(
          'UPDATE jobs SET status = $1, completed_at = NOW() WHERE id = $2',
          ['completed', assignment.job_id]
        );
      }

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'field_job_assignments.updated',
        resourceType: 'field_job_assignments',
        resourceId: assignmentId,
        oldValues: { status: oldAssignment.status },
        newValues: { status: statusData.status }
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

  // Record digital signature
  static async recordDigitalSignature(businessId, signatureData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO digital_signatures (
          business_id, field_job_assignment_id, customer_name,
          signature_data, ip_address, device_info
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [
        businessId,
        signatureData.field_job_assignment_id,
        signatureData.customer_name,
        signatureData.signature_data,
        signatureData.ip_address || null,
        signatureData.device_info || null
      ];

      const result = await client.query(query, values);
      const signature = result.rows[0];

      // Update assignment to mark as signed
      await client.query(
        'UPDATE field_job_assignments SET status = $1 WHERE id = $2',
        ['completed', signatureData.field_job_assignment_id]
      );

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'digital_signatures.created',
        resourceType: 'digital_signatures',
        resourceId: signature.id,
        newValues: {
          field_job_assignment_id: signatureData.field_job_assignment_id,
          customer_name: signatureData.customer_name
        }
      });

      await client.query('COMMIT');
      return signature;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
