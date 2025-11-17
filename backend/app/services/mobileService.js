import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';

export class MobileService {

  // Register mobile device
  static async registerMobileDevice(businessId, deviceData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO mobile_devices (
          business_id, staff_profile_id, device_id, device_type,
          app_version, push_token, os_version, screen_resolution
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (device_id) 
        DO UPDATE SET
          staff_profile_id = EXCLUDED.staff_profile_id,
          app_version = EXCLUDED.app_version,
          push_token = EXCLUDED.push_token,
          os_version = EXCLUDED.os_version,
          screen_resolution = EXCLUDED.screen_resolution,
          last_sync_at = NOW(),
          updated_at = NOW()
        RETURNING *
      `;

      const values = [
        businessId,
        deviceData.staff_profile_id,
        deviceData.device_id,
        deviceData.device_type,
        deviceData.app_version,
        deviceData.push_token || null,
        deviceData.os_version || null,
        deviceData.screen_resolution || null
      ];

      const result = await client.query(query, values);
      const device = result.rows[0];

      // Initialize mobile app settings if not exists
      const settingsQuery = `
        INSERT INTO mobile_app_settings (business_id, staff_profile_id)
        VALUES ($1, $2)
        ON CONFLICT (business_id, staff_profile_id) DO NOTHING
      `;
      await client.query(settingsQuery, [businessId, deviceData.staff_profile_id]);

      // Initialize notification preferences if not exists
      const preferencesQuery = `
        INSERT INTO notification_preferences (business_id, staff_profile_id)
        VALUES ($1, $2)
        ON CONFLICT (business_id, staff_profile_id) DO NOTHING
      `;
      await client.query(preferencesQuery, [businessId, deviceData.staff_profile_id]);

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'mobile_devices.registered',
        resourceType: 'mobile_devices',
        resourceId: device.id,
        newValues: {
          device_id: deviceData.device_id,
          device_type: deviceData.device_type
        }
      });

      await client.query('COMMIT');
      return device;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get mobile app settings
  static async getMobileAppSettings(businessId, staffProfileId) {
    const client = await getClient();
    try {
      const query = `
        SELECT mas.*, np.*
        FROM mobile_app_settings mas
        INNER JOIN notification_preferences np ON mas.staff_profile_id = np.staff_profile_id
        WHERE mas.business_id = $1 AND mas.staff_profile_id = $2
      `;

      const result = await client.query(query, [businessId, staffProfileId]);
      
      if (result.rows.length === 0) {
        // Return default settings if none exist
        return {
          theme: 'light',
          language: 'en',
          offline_mode_enabled: true,
          auto_sync_enabled: true,
          sync_frequency_minutes: 15,
          gps_tracking_enabled: true,
          camera_upload_quality: 'medium',
          job_assignments: true,
          job_reminders: true,
          sync_notifications: true,
          system_alerts: true,
          marketing: false
        };
      }

      return result.rows[0];

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Update mobile app settings
  static async updateMobileAppSettings(businessId, staffProfileId, settingsData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Update mobile app settings
      const settingsQuery = `
        UPDATE mobile_app_settings 
        SET theme = $1, language = $2, offline_mode_enabled = $3,
            auto_sync_enabled = $4, sync_frequency_minutes = $5,
            gps_tracking_enabled = $6, camera_upload_quality = $7,
            updated_at = NOW()
        WHERE business_id = $8 AND staff_profile_id = $9
        RETURNING *
      `;

      const settingsValues = [
        settingsData.theme,
        settingsData.language,
        settingsData.offline_mode_enabled,
        settingsData.auto_sync_enabled,
        settingsData.sync_frequency_minutes,
        settingsData.gps_tracking_enabled,
        settingsData.camera_upload_quality,
        businessId,
        staffProfileId
      ];

      await client.query(settingsQuery, settingsValues);

      // Update notification preferences
      const preferencesQuery = `
        UPDATE notification_preferences 
        SET job_assignments = $1, job_reminders = $2, sync_notifications = $3,
            system_alerts = $4, marketing = $5, quiet_hours_start = $6,
            quiet_hours_end = $7, updated_at = NOW()
        WHERE business_id = $8 AND staff_profile_id = $9
        RETURNING *
      `;

      const preferencesValues = [
        settingsData.job_assignments,
        settingsData.job_reminders,
        settingsData.sync_notifications,
        settingsData.system_alerts,
        settingsData.marketing,
        settingsData.quiet_hours_start,
        settingsData.quiet_hours_end,
        businessId,
        staffProfileId
      ];

      const result = await client.query(preferencesQuery, preferencesValues);

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'mobile_app_settings.updated',
        resourceType: 'mobile_app_settings',
        resourceId: staffProfileId,
        newValues: settingsData
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

  // Start offline sync batch
  static async startOfflineSyncBatch(businessId, batchData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Get next batch number for this device
      const batchNumberQuery = `
        SELECT COALESCE(MAX(batch_number), 0) + 1 as next_batch_number
        FROM offline_sync_batches 
        WHERE business_id = $1 AND device_id = $2
      `;

      const batchNumberResult = await client.query(batchNumberQuery, [businessId, batchData.device_id]);
      const nextBatchNumber = batchNumberResult.rows[0].next_batch_number;

      const query = `
        INSERT INTO offline_sync_batches (
          business_id, staff_profile_id, device_id, batch_number, total_records
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const values = [
        businessId,
        batchData.staff_profile_id,
        batchData.device_id,
        nextBatchNumber,
        batchData.total_records || 0
      ];

      const result = await client.query(query, values);
      const batch = result.rows[0];

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'offline_sync_batches.started',
        resourceType: 'offline_sync_batches',
        resourceId: batch.id,
        newValues: {
          device_id: batchData.device_id,
          batch_number: nextBatchNumber,
          total_records: batchData.total_records
        }
      });

      await client.query('COMMIT');
      return batch;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Complete offline sync batch
  static async completeOfflineSyncBatch(businessId, batchId, syncData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const query = `
        UPDATE offline_sync_batches 
        SET synced_records = $1, sync_completed_at = NOW(),
            sync_status = $2, error_message = $3
        WHERE id = $4 AND business_id = $5
        RETURNING *
      `;

      const values = [
        syncData.synced_records,
        syncData.sync_status || 'completed',
        syncData.error_message || null,
        batchId,
        businessId
      ];

      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Sync batch not found');
      }

      const batch = result.rows[0];

      // Update device last sync time
      await client.query(
        'UPDATE mobile_devices SET last_sync_at = NOW() WHERE device_id = $1 AND business_id = $2',
        [batch.device_id, businessId]
      );

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'offline_sync_batches.completed',
        resourceType: 'offline_sync_batches',
        resourceId: batchId,
        newValues: {
          synced_records: syncData.synced_records,
          sync_status: syncData.sync_status
        }
      });

      await client.query('COMMIT');
      return batch;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get offline data for mobile app
  static async getOfflineData(businessId, staffProfileId) {
    const client = await getClient();
    try {
      // Get essential data for offline use
      const jobsQuery = `
        SELECT j.*, s.name as service_name, c.first_name, c.last_name
        FROM jobs j
        LEFT JOIN services s ON j.service_id = s.id
        LEFT JOIN customers c ON j.customer_id = c.id
        WHERE j.business_id = $1 
        AND j.status IN ('pending', 'assigned', 'in-progress')
        ORDER BY j.created_at DESC
      `;

      const jobsResult = await client.query(jobsQuery, [businessId]);
      const jobs = jobsResult.rows;

      // Get field job assignments for this staff
      const assignmentsQuery = `
        SELECT fja.*, j.job_number, j.description as job_description
        FROM field_job_assignments fja
        INNER JOIN jobs j ON fja.job_id = j.id
        WHERE fja.business_id = $1 AND fja.staff_profile_id = $2
        AND fja.status IN ('assigned', 'in_progress')
        ORDER BY fja.assigned_at DESC
      `;

      const assignmentsResult = await client.query(assignmentsQuery, [businessId, staffProfileId]);
      const assignments = assignmentsResult.rows;

      // Get camera templates
      const templatesQuery = `
        SELECT * FROM camera_templates 
        WHERE business_id = $1 AND is_active = true
        ORDER BY created_at DESC
      `;

      const templatesResult = await client.query(templatesQuery, [businessId]);
      const templates = templatesResult.rows;

      return {
        jobs,
        assignments,
        templates,
        last_updated: new Date().toISOString()
      };

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Log mobile performance
  static async logMobilePerformance(businessId, performanceData, userId) {
    const client = await getClient();
    try {
      const query = `
        INSERT INTO mobile_performance_logs (
          business_id, staff_profile_id, device_id, app_version,
          event_type, event_data, performance_metrics, network_type,
          battery_level
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const values = [
        businessId,
        performanceData.staff_profile_id,
        performanceData.device_id,
        performanceData.app_version,
        performanceData.event_type,
        JSON.stringify(performanceData.event_data || {}),
        JSON.stringify(performanceData.performance_metrics || {}),
        performanceData.network_type || null,
        performanceData.battery_level || null
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
