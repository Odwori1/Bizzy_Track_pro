import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';

export class NotificationService {

  // Send push notification
  static async sendPushNotification(businessId, notificationData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO push_notifications (
          business_id, title, message, notification_type,
          target_audience, data, scheduled_for, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const values = [
        businessId,
        notificationData.title,
        notificationData.message,
        notificationData.notification_type,
        JSON.stringify(notificationData.target_audience || {}),
        JSON.stringify(notificationData.data || {}),
        notificationData.scheduled_for || null,
        userId
      ];

      const result = await client.query(query, values);
      const notification = result.rows[0];

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'push_notifications.created',
        resourceType: 'push_notifications',
        resourceId: notification.id,
        newValues: {
          title: notificationData.title,
          notification_type: notificationData.notification_type
        }
      });

      await client.query('COMMIT');
      return notification;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get push notifications
  static async getPushNotifications(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT pn.*, u.full_name as created_by_name
        FROM push_notifications pn
        INNER JOIN users u ON pn.created_by = u.id
        WHERE pn.business_id = $1
      `;
      const values = [businessId];

      if (filters.notification_type) {
        query += ` AND pn.notification_type = $2`;
        values.push(filters.notification_type);
      }

      if (filters.delivery_status) {
        query += ` AND pn.delivery_status = $${values.length + 1}`;
        values.push(filters.delivery_status);
      }

      query += ' ORDER BY pn.created_at DESC';

      const result = await client.query(query, values);
      return result.rows;

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // 🔧 FIXED: Get devices for notification targeting
  static async getTargetDevices(businessId, targetAudience) {
    const client = await getClient();
    try {
      // FIX: Check if targetAudience is undefined and provide defaults
      if (!targetAudience) {
        console.log('⚠️  Target audience is undefined, using empty defaults');
        targetAudience = {
          staff_ids: [],
          roles: [],
          departments: []
        };
      }

      console.log('🔍 Fetching target devices with criteria:', {
        businessId,
        staff_ids: targetAudience.staff_ids,
        roles: targetAudience.roles,
        departments: targetAudience.departments
      });

      let query = `
        SELECT md.device_id, md.push_token, md.device_type,
               sp.id as staff_profile_id, u.full_name as staff_name
        FROM mobile_devices md
        INNER JOIN staff_profiles sp ON md.staff_profile_id = sp.id
        INNER JOIN users u ON sp.user_id = u.id
        WHERE md.business_id = $1 AND md.is_active = true
        AND md.push_token IS NOT NULL
      `;
      const values = [businessId];
      let paramCount = 1;

      // Apply target audience filters with proper null checks
      if (targetAudience.staff_ids && targetAudience.staff_ids.length > 0) {
        paramCount++;
        query += ` AND sp.id = ANY($${paramCount})`;
        values.push(targetAudience.staff_ids);
      }

      if (targetAudience.roles && targetAudience.roles.length > 0) {
        paramCount++;
        query += ` AND u.role = ANY($${paramCount})`;
        values.push(targetAudience.roles);
      }

      if (targetAudience.departments && targetAudience.departments.length > 0) {
        paramCount++;
        query += ` AND sp.department_id = ANY($${paramCount})`;
        values.push(targetAudience.departments);
      }

      query += ' ORDER BY md.last_sync_at DESC';

      const result = await client.query(query, values);
      
      console.log(`✅ Found ${result.rows.length} target devices`);
      return result.rows;

    } catch (error) {
      console.error('❌ Error fetching target devices:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Mark notification as sent
  static async markNotificationSent(notificationId, sentData) {
    const client = await getClient();
    try {
      const query = `
        UPDATE push_notifications
        SET sent_at = $1, delivery_status = $2, failure_reason = $3
        WHERE id = $4
        RETURNING *
      `;

      const values = [
        sentData.sent_at || new Date(),
        sentData.delivery_status || 'sent',
        sentData.failure_reason || null,
        notificationId
      ];

      const result = await client.query(query, values);
      return result.rows[0];

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
}
