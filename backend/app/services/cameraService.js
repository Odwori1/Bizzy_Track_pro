import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';

export class CameraService {

  // Create camera template
  static async createCameraTemplate(businessId, templateData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO camera_templates (
          business_id, name, description, template_type,
          required_photos, quality_requirements, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const values = [
        businessId,
        templateData.name,
        templateData.description || null,
        templateData.template_type,
        JSON.stringify(templateData.required_photos || []),
        JSON.stringify(templateData.quality_requirements || {}),
        userId
      ];

      const result = await client.query(query, values);
      const template = result.rows[0];

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'camera_templates.created',
        resourceType: 'camera_templates',
        resourceId: template.id,
        newValues: {
          name: templateData.name,
          template_type: templateData.template_type
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

  // Upload media attachment
  static async uploadMediaAttachment(businessId, mediaData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO mobile_media_attachments (
          business_id, staff_profile_id, field_job_assignment_id, asset_id,
          file_name, file_path, file_size, mime_type, media_type,
          thumbnail_path, gps_latitude, gps_longitude, device_id, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;

      const values = [
        businessId,
        mediaData.staff_profile_id,
        mediaData.field_job_assignment_id || null,
        mediaData.asset_id || null,
        mediaData.file_name,
        mediaData.file_path,
        mediaData.file_size,
        mediaData.mime_type,
        mediaData.media_type,
        mediaData.thumbnail_path || null,
        mediaData.gps_latitude || null,
        mediaData.gps_longitude || null,
        mediaData.device_id || null,
        mediaData.description || null
      ];

      const result = await client.query(query, values);
      const attachment = result.rows[0];

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'mobile_media_attachments.created',
        resourceType: 'mobile_media_attachments',
        resourceId: attachment.id,
        newValues: {
          file_name: mediaData.file_name,
          media_type: mediaData.media_type
        }
      });

      await client.query('COMMIT');
      return attachment;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get camera templates
  static async getCameraTemplates(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT ct.*, u.full_name as created_by_name
        FROM camera_templates ct
        INNER JOIN users u ON ct.created_by = u.id
        WHERE ct.business_id = $1
      `;
      const values = [businessId];

      if (filters.template_type) {
        query += ` AND ct.template_type = $2`;
        values.push(filters.template_type);
      }

      if (filters.is_active !== undefined) {
        query += ` AND ct.is_active = $${values.length + 1}`;
        values.push(filters.is_active);
      }

      query += ' ORDER BY ct.created_at DESC';

      const result = await client.query(query, values);
      return result.rows;

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get media attachments
  static async getMediaAttachments(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT mma.*, sp.employee_id, u.full_name as staff_name
        FROM mobile_media_attachments mma
        INNER JOIN staff_profiles sp ON mma.staff_profile_id = sp.id
        INNER JOIN users u ON sp.user_id = u.id
        WHERE mma.business_id = $1
      `;
      const values = [businessId];

      if (filters.staff_profile_id) {
        query += ` AND mma.staff_profile_id = $2`;
        values.push(filters.staff_profile_id);
      }

      if (filters.field_job_assignment_id) {
        query += ` AND mma.field_job_assignment_id = $${values.length + 1}`;
        values.push(filters.field_job_assignment_id);
      }

      if (filters.media_type) {
        query += ` AND mma.media_type = $${values.length + 1}`;
        values.push(filters.media_type);
      }

      query += ' ORDER BY mma.created_at DESC';

      const result = await client.query(query, values);
      return result.rows;

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
}
