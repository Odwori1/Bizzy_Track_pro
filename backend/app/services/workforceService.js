import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class WorkforceService {
  /**
   * Create a new staff profile
   */
  static async createStaffProfile(businessId, staffData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if employee ID already exists for this business
      const existingCheck = await client.query(
        'SELECT id FROM staff_profiles WHERE business_id = $1 AND employee_id = $2',
        [businessId, staffData.employee_id]
      );

      if (existingCheck.rows.length > 0) {
        throw new Error('Employee ID already exists for this business');
      }

      // Check if user already has a staff profile
      const userCheck = await client.query(
        'SELECT id FROM staff_profiles WHERE business_id = $1 AND user_id = $2',
        [businessId, staffData.user_id]
      );

      if (userCheck.rows.length > 0) {
        throw new Error('User already has a staff profile in this business');
      }

      // Insert new staff profile
      const result = await client.query(
        `INSERT INTO staff_profiles (
          business_id, user_id, employee_id, job_title, department_id,
          employment_type, hire_date, termination_date, base_wage_rate,
          wage_type, overtime_rate, emergency_contact_name,
          emergency_contact_phone, emergency_contact_relationship,
          skills, certifications, max_hours_per_week, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *`,
        [
          businessId,
          staffData.user_id,
          staffData.employee_id,
          staffData.job_title,
          staffData.department_id || null,
          staffData.employment_type,
          staffData.hire_date,
          staffData.termination_date || null,
          staffData.base_wage_rate,
          staffData.wage_type,
          staffData.overtime_rate || 0,
          staffData.emergency_contact_name || '',
          staffData.emergency_contact_phone || '',
          staffData.emergency_contact_relationship || '',
          staffData.skills || [],
          staffData.certifications || [],
          staffData.max_hours_per_week || 40,
          staffData.is_active !== false
        ]
      );

      const staffProfile = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'staff_profile.created',
        resourceType: 'staff_profile',
        resourceId: staffProfile.id,
        newValues: {
          employee_id: staffProfile.employee_id,
          job_title: staffProfile.job_title,
          employment_type: staffProfile.employment_type
        }
      });

      await client.query('COMMIT');
      return staffProfile;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all staff profiles with optional filters
   */
  static async getStaffProfiles(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT
          sp.*,
          d.name as department_name,
          d.code as department_code,
          u.email as user_email,
          u.full_name as user_full_name,
          COUNT(DISTINCT sr.id) as active_shifts_count
        FROM staff_profiles sp
        LEFT JOIN departments d ON sp.department_id = d.id
        LEFT JOIN users u ON sp.user_id = u.id
        LEFT JOIN shift_rosters sr ON sp.id = sr.staff_profile_id AND sr.shift_status IN ('scheduled', 'in_progress')
        WHERE sp.business_id = $1
      `;

      const params = [businessId];
      let paramCount = 1;

      if (filters.department_id) {
        paramCount++;
        queryStr += ` AND sp.department_id = $${paramCount}`;
        params.push(filters.department_id);
      }

      if (filters.employment_type) {
        paramCount++;
        queryStr += ` AND sp.employment_type = $${paramCount}`;
        params.push(filters.employment_type);
      }

      if (filters.is_active !== undefined) {
        paramCount++;
        queryStr += ` AND sp.is_active = $${paramCount}`;
        params.push(filters.is_active);
      }

      queryStr += ' GROUP BY sp.id, d.name, d.code, u.email, u.full_name ORDER BY sp.employee_id';

      log.info('🗄️ Database Query - getStaffProfiles:', { query: queryStr, params });

      const result = await client.query(queryStr, params);

      log.info('✅ Staff profiles query successful', {
        rowCount: result.rows.length,
        businessId
      });

      return result.rows;
    } catch (error) {
      log.error('❌ Staff profiles query failed:', {
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
   * Get staff profile by ID
   */
  static async getStaffProfileById(businessId, staffProfileId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT
          sp.*,
          d.name as department_name,
          d.code as department_code,
          u.email as user_email,
          u.full_name as user_full_name
        FROM staff_profiles sp
        LEFT JOIN departments d ON sp.department_id = d.id
        LEFT JOIN users u ON sp.user_id = u.id
        WHERE sp.business_id = $1 AND sp.id = $2
      `;

      const result = await client.query(queryStr, [businessId, staffProfileId]);

      if (result.rows.length === 0) {
        throw new Error('Staff profile not found or access denied');
      }

      // Get availability
      const availabilityResult = await client.query(
        `SELECT * FROM staff_availability
         WHERE staff_profile_id = $1
         ORDER BY day_of_week, start_time`,
        [staffProfileId]
      );

      const staffProfile = result.rows[0];
      staffProfile.availability = availabilityResult.rows;

      return staffProfile;
    } catch (error) {
      log.error('❌ Staff profile query failed:', {
        error: error.message,
        businessId,
        staffProfileId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update staff profile
   */
  static async updateStaffProfile(businessId, staffProfileId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify staff profile belongs to business
      const currentProfile = await client.query(
        'SELECT * FROM staff_profiles WHERE id = $1 AND business_id = $2',
        [staffProfileId, businessId]
      );

      if (currentProfile.rows.length === 0) {
        throw new Error('Staff profile not found or access denied');
      }

      // Check for employee ID conflicts
      if (updateData.employee_id && updateData.employee_id !== currentProfile.rows[0].employee_id) {
        const idCheck = await client.query(
          'SELECT id FROM staff_profiles WHERE business_id = $1 AND employee_id = $2 AND id != $3',
          [businessId, updateData.employee_id, staffProfileId]
        );

        if (idCheck.rows.length > 0) {
          throw new Error('Employee ID already exists for this business');
        }
      }

      // Build dynamic update
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
      updateValues.push(staffProfileId);
      paramCount++;
      updateValues.push(businessId);

      const updateQuery = `
        UPDATE staff_profiles
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount - 1} AND business_id = $${paramCount}
        RETURNING *
      `;

      log.info('🗄️ Database Query - updateStaffProfile:', { query: updateQuery, params: updateValues });

      const result = await client.query(updateQuery, updateValues);
      const updatedProfile = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'staff_profile.updated',
        resourceType: 'staff_profile',
        resourceId: staffProfileId,
        oldValues: currentProfile.rows[0],
        newValues: updatedProfile
      });

      await client.query('COMMIT');
      return updatedProfile;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create shift template
   */
  static async createShiftTemplate(businessId, templateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const existingCheck = await client.query(
        'SELECT id FROM shift_templates WHERE business_id = $1 AND name = $2',
        [businessId, templateData.name]
      );

      if (existingCheck.rows.length > 0) {
        throw new Error('Shift template name already exists for this business');
      }

      const result = await client.query(
        `INSERT INTO shift_templates (
          business_id, name, description, start_time, end_time,
          break_minutes, department_id, required_staff_count,
          required_skills, is_premium_shift, premium_rate_multiplier, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          businessId,
          templateData.name,
          templateData.description || '',
          templateData.start_time,
          templateData.end_time,
          templateData.break_minutes || 30,
          templateData.department_id || null,
          templateData.required_staff_count || 1,
          templateData.required_skills || [],
          templateData.is_premium_shift || false,
          templateData.premium_rate_multiplier || 1.0,
          templateData.is_active !== false
        ]
      );

      const shiftTemplate = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'shift_template.created',
        resourceType: 'shift_template',
        resourceId: shiftTemplate.id,
        newValues: {
          name: shiftTemplate.name,
          start_time: shiftTemplate.start_time,
          end_time: shiftTemplate.end_time
        }
      });

      await client.query('COMMIT');
      return shiftTemplate;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create shift roster assignment
   */
  static async createShiftRoster(businessId, rosterData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const existingCheck = await client.query(
        'SELECT id FROM shift_rosters WHERE business_id = $1 AND shift_date = $2 AND staff_profile_id = $3',
        [businessId, rosterData.shift_date, rosterData.staff_profile_id]
      );

      if (existingCheck.rows.length > 0) {
        throw new Error('Staff already has a shift assigned on this date');
      }

      const staffCheck = await client.query(
        'SELECT id FROM staff_profiles WHERE id = $1 AND business_id = $2 AND is_active = true',
        [rosterData.staff_profile_id, businessId]
      );

      if (staffCheck.rows.length === 0) {
        throw new Error('Staff profile not found or not active');
      }

      const result = await client.query(
        `INSERT INTO shift_rosters (
          business_id, shift_template_id, shift_date, staff_profile_id,
          assigned_by, shift_status, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          businessId,
          rosterData.shift_template_id || null,
          rosterData.shift_date,
          rosterData.staff_profile_id,
          userId,
          'scheduled',
          rosterData.notes || ''
        ]
      );

      const shiftRoster = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'shift_roster.created',
        resourceType: 'shift_roster',
        resourceId: shiftRoster.id,
        newValues: {
          shift_date: shiftRoster.shift_date,
          staff_profile_id: shiftRoster.staff_profile_id
        }
      });

      await client.query('COMMIT');
      return shiftRoster;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process clock event - SERVICE-BASED APPROACH (No PostgreSQL function)
   */
  static async processClockEvent(businessId, clockData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify staff profile belongs to business
      const staffCheck = await client.query(
        'SELECT id FROM staff_profiles WHERE id = $1 AND business_id = $2 AND is_active = true',
        [clockData.staff_profile_id, businessId]
      );

      if (staffCheck.rows.length === 0) {
        throw new Error('Staff profile not found or not active');
      }

      // Get the last clock event to validate sequence
      const lastEventResult = await client.query(
        'SELECT event_type FROM clock_events WHERE staff_profile_id = $1 AND business_id = $2 ORDER BY event_time DESC LIMIT 1',
        [clockData.staff_profile_id, businessId]
      );

      const lastEvent = lastEventResult.rows[0];

      // Validate event sequence
      if (lastEvent) {
        if (lastEvent.event_type === clockData.event_type) {
          throw new Error(`Invalid event sequence: ${clockData.event_type} after ${lastEvent.event_type}`);
        }
      } else if (clockData.event_type !== 'clock_in') {
        throw new Error('Must clock in first');
      }

      // Insert clock event
      const result = await client.query(
        `INSERT INTO clock_events (
          business_id, staff_profile_id, shift_roster_id,
          event_type, gps_latitude, gps_longitude, event_time, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
        RETURNING id`,
        [
          businessId,
          clockData.staff_profile_id,
          clockData.shift_roster_id || null,
          clockData.event_type,
          clockData.gps_latitude || null,
          clockData.gps_longitude || null,
          clockData.notes || ''
        ]
      );

      const clockEventId = result.rows[0].id;

      // Update shift status if clocking in/out with a shift roster
      if (clockData.shift_roster_id) {
        if (clockData.event_type === 'clock_in') {
          await client.query(
            'UPDATE shift_rosters SET shift_status = $1, actual_start_time = CURRENT_TIME WHERE id = $2 AND business_id = $3',
            ['in_progress', clockData.shift_roster_id, businessId]
          );
        } else if (clockData.event_type === 'clock_out') {
          await client.query(
            'UPDATE shift_rosters SET shift_status = $1, actual_end_time = CURRENT_TIME WHERE id = $2 AND business_id = $3',
            ['completed', clockData.shift_roster_id, businessId]
          );
        }
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: `clock_event.${clockData.event_type}`,
        resourceType: 'clock_event',
        resourceId: clockEventId,
        newValues: {
          staff_profile_id: clockData.staff_profile_id,
          event_type: clockData.event_type,
          shift_roster_id: clockData.shift_roster_id
        }
      });

      await client.query('COMMIT');
      
      return {
        success: true,
        message: 'Clock event recorded successfully',
        clock_event_id: clockEventId
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get shifts for date range
   */
  static async getShifts(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT
          sr.*,
          sp.employee_id,
          sp.job_title,
          u.full_name as user_full_name,
          st.name as shift_template_name,
          d.name as department_name
        FROM shift_rosters sr
        INNER JOIN staff_profiles sp ON sr.staff_profile_id = sp.id
        INNER JOIN users u ON sp.user_id = u.id
        LEFT JOIN shift_templates st ON sr.shift_template_id = st.id
        LEFT JOIN departments d ON sp.department_id = d.id
        WHERE sr.business_id = $1 AND sr.shift_date BETWEEN $2 AND $3
      `;

      const params = [businessId, filters.start_date, filters.end_date];
      let paramCount = 3;

      if (filters.department_id) {
        paramCount++;
        queryStr += ` AND sp.department_id = $${paramCount}`;
        params.push(filters.department_id);
      }

      if (filters.staff_profile_id) {
        paramCount++;
        queryStr += ` AND sr.staff_profile_id = $${paramCount}`;
        params.push(filters.staff_profile_id);
      }

      if (filters.shift_status) {
        paramCount++;
        queryStr += ` AND sr.shift_status = $${paramCount}`;
        params.push(filters.shift_status);
      }

      queryStr += ' ORDER BY sr.shift_date, sr.actual_start_time';

      const result = await client.query(queryStr, params);
      return result.rows;
    } catch (error) {
      log.error('❌ Shifts query failed:', {
        error: error.message,
        businessId,
        filters
      });
      throw error;
    } finally {
      client.release();
    }
  }
}
