#!/bin/bash

echo "=== FIXING BACKEND CLOCK EVENTS BUG ==="

# Create backup
cp backend/app/services/unifiedEmployeeService.js backend/app/services/unifiedEmployeeService.js.backup

# Find and fix the getClockEvents method
# The issue is likely that when employee_id is undefined or empty string,
# the service should handle it gracefully

cat > backend/app/services/unifiedEmployeeService.js << 'FIXED_SERVICE'
// Save as: backend/app/services/unifiedEmployeeService.js
import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';

export class UnifiedEmployeeService {
  /**
   * Get all employees with unified data
   */
  static async getEmployees(businessId, filters = {}) {
    const client = await getClient();

    try {
      let query = `
        SELECT
          ue.user_id as id,
          ue.email,
          ue.full_name,
          ue.role,
          ue.phone,
          ue.user_active as is_active,
          ue.last_login_at,
          ue.employee_id,
          ue.job_title,
          ue.department_name,
          ue.department_code,
          ue.overall_status as status,
          ue.last_clock_event,
          ue.last_clock_time,
          ue.has_workforce_profile,
          ue.can_clock_in
        FROM unified_employees ue
        WHERE ue.business_id = $1
      `;

      const params = [businessId];
      let paramCount = 1;

      // Apply filters
      if (filters.department_id) {
        paramCount++;
        query += ` AND ue.effective_department_id = $${paramCount}`;
        params.push(filters.department_id);
      }

      if (filters.role) {
        paramCount++;
        query += ` AND ue.role = $${paramCount}`;
        params.push(filters.role);
      }

      if (filters.status) {
        paramCount++;
        if (filters.status === 'active') {
          query += ` AND ue.overall_status = 'Active'`;
        } else if (filters.status === 'inactive') {
          query += ` AND ue.overall_status != 'Active'`;
        }
      }

      if (filters.search) {
        paramCount++;
        query += ` AND (
          ue.full_name ILIKE $${paramCount} OR
          ue.email ILIKE $${paramCount} OR
          ue.employee_id ILIKE $${paramCount}
        )`;
        params.push(`%${filters.search}%`);
      }

      query += ' ORDER BY ue.full_name';

      const result = await client.query(query, params);
      return result.rows;

    } catch (error) {
      log.error('Error in UnifiedEmployeeService.getEmployees:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get unified employee by ID - FIXED with proper UUID/string handling
   */
  static async getEmployeeById(businessId, employeeId) {
    const client = await getClient();

    try {
      // Determine if employeeId is a UUID or employee_id string
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId);

      let query;
      let queryParams;

      if (isUUID) {
        // employeeId is a UUID (user_id)
        query = `
          SELECT
            ue.user_id as id,
            ue.email,
            ue.full_name,
            ue.role,
            ue.phone,
            ue.user_active as is_active,
            ue.last_login_at,
            ue.employee_id,
            ue.job_title,
            ue.employment_type,
            ue.hire_date,
            ue.base_wage_rate,
            ue.wage_type,
            ue.overtime_rate,
            ue.max_hours_per_week,
            ue.department_name,
            ue.department_code,
            ue.overall_status as status,
            ue.last_clock_event,
            ue.last_clock_time,
            ue.has_workforce_profile,
            ue.can_clock_in,
            ue.staff_profile_id,
            -- Handle NULL staff_profile_id case
            CASE
              WHEN ue.staff_profile_id IS NULL THEN '[]'::json
              ELSE (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', ce.id,
                      'event_type', ce.event_type,
                      'event_time', ce.event_time,
                      'hours_ago', ROUND(EXTRACT(EPOCH FROM (NOW() - ce.event_time)) / 3600, 1)
                    )
                  ),
                  '[]'::json
                )
                FROM (
                  SELECT id, event_type, event_time
                  FROM clock_events
                  WHERE staff_profile_id = ue.staff_profile_id
                  ORDER BY event_time DESC
                  LIMIT 10
                ) ce
              )
            END as recent_clock_events,
            CASE
              WHEN ue.staff_profile_id IS NULL THEN '[]'::json
              ELSE (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', sr.id,
                      'shift_date', sr.shift_date,
                      'shift_status', sr.shift_status,
                      'actual_hours_worked', sr.actual_hours_worked
                    )
                  ),
                  '[]'::json
                )
                FROM (
                  SELECT id, shift_date, shift_status, actual_hours_worked
                  FROM shift_rosters
                  WHERE staff_profile_id = ue.staff_profile_id
                  ORDER BY shift_date DESC
                  LIMIT 5
                ) sr
              )
            END as recent_shifts
          FROM unified_employees ue
          WHERE ue.business_id = $1
            AND ue.user_id = $2::uuid
          LIMIT 1
        `;
        queryParams = [businessId, employeeId];
      } else {
        // employeeId is an employee_id string (like "EMP5011")
        query = `
          SELECT
            ue.user_id as id,
            ue.email,
            ue.full_name,
            ue.role,
            ue.phone,
            ue.user_active as is_active,
            ue.last_login_at,
            ue.employee_id,
            ue.job_title,
            ue.employment_type,
            ue.hire_date,
            ue.base_wage_rate,
            ue.wage_type,
            ue.overtime_rate,
            ue.max_hours_per_week,
            ue.department_name,
            ue.department_code,
            ue.overall_status as status,
            ue.last_clock_event,
            ue.last_clock_time,
            ue.has_workforce_profile,
            ue.can_clock_in,
            ue.staff_profile_id,
            -- Handle NULL staff_profile_id case
            CASE
              WHEN ue.staff_profile_id IS NULL THEN '[]'::json
              ELSE (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', ce.id,
                      'event_type', ce.event_type,
                      'event_time', ce.event_time,
                      'hours_ago', ROUND(EXTRACT(EPOCH FROM (NOW() - ce.event_time)) / 3600, 1)
                    )
                  ),
                  '[]'::json
                )
                FROM (
                  SELECT id, event_type, event_time
                  FROM clock_events
                  WHERE staff_profile_id = ue.staff_profile_id
                  ORDER BY event_time DESC
                  LIMIT 10
                ) ce
              )
            END as recent_clock_events,
            CASE
              WHEN ue.staff_profile_id IS NULL THEN '[]'::json
              ELSE (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', sr.id,
                      'shift_date', sr.shift_date,
                      'shift_status', sr.shift_status,
                      'actual_hours_worked', sr.actual_hours_worked
                    )
                  ),
                  '[]'::json
                )
                FROM (
                  SELECT id, shift_date, shift_status, actual_hours_worked
                  FROM shift_rosters
                  WHERE staff_profile_id = ue.staff_profile_id
                  ORDER BY shift_date DESC
                  LIMIT 5
                ) sr
              )
            END as recent_shifts
          FROM unified_employees ue
          WHERE ue.business_id = $1
            AND ue.employee_id = $2
          LIMIT 1
        `;
        queryParams = [businessId, employeeId];
      }

      const result = await client.query(query, queryParams);

      if (result.rows.length === 0) {
        return null;
      }

      const employee = result.rows[0];

      // Ensure hours_ago is never NaN
      if (employee.recent_clock_events && employee.recent_clock_events.length > 0) {
        employee.recent_clock_events = employee.recent_clock_events.map(event => ({
          ...event,
          hours_ago: event.hours_ago || 0
        }));
      }

      return employee;

    } catch (error) {
      log.error('Error in UnifiedEmployeeService.getEmployeeById:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create new employee with automatic workforce profile
   */
  static async createEmployee(businessId, employeeData, createdByUserId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Create user record
      const userQuery = `
        INSERT INTO users (
          business_id, email, full_name, role, department_id,
          phone, is_active, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const userResult = await client.query(userQuery, [
        businessId,
        employeeData.email,
        employeeData.full_name,
        employeeData.role || 'staff',
        employeeData.department_id || null,
        employeeData.phone || null,
        employeeData.is_active !== undefined ? employeeData.is_active : true,
        createdByUserId
      ]);

      // The trigger will automatically create workforce profile
      await client.query('COMMIT');

      // Get the unified employee data
      const newUser = userResult.rows[0];
      const unifiedEmployee = await this.getEmployeeById(businessId, newUser.id);

      return unifiedEmployee;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error in UnifiedEmployeeService.createEmployee:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get workforce-specific data for employee - FIXED with correct column names and GROUP BY fix
   */
  static async getWorkforceData(businessId, employeeId) {
    const client = await getClient();

    try {
      // Determine if employeeId is a UUID or employee_id string
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId);

      let query;
      let queryParams;

      if (isUUID) {
        query = `
          SELECT
            sp.id,
            sp.employee_id,
            sp.job_title,
            sp.employment_type,
            sp.hire_date,
            sp.base_wage_rate,
            sp.wage_type,
            sp.overtime_rate,
            sp.max_hours_per_week,
            sp.department_id,
            sp.is_active as profile_active,
            sp.created_at,
            sp.updated_at,
            u.email,
            u.full_name,
            u.role as user_role,
            d.name as department_name,
            d.code as department_code,
            -- Handle case where staff profile might not exist
            CASE
              WHEN sp.id IS NULL THEN '[]'::json
              ELSE (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', ce.id,
                      'event_type', ce.event_type,
                      'event_time', ce.event_time,
                      'gps_latitude', ce.gps_latitude,
                      'gps_longitude', ce.gps_longitude,
                      'hours_ago', ROUND(EXTRACT(EPOCH FROM (NOW() - ce.event_time)) / 3600, 1)
                    )
                  ),
                  '[]'::json
                )
                FROM (
                  SELECT id, event_type, event_time, gps_latitude, gps_longitude
                  FROM clock_events
                  WHERE staff_profile_id = sp.id
                  ORDER BY event_time DESC
                  LIMIT 20
                ) ce
              )
            END as clock_events,
            CASE
              WHEN sp.id IS NULL THEN '[]'::json
              ELSE (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', sr.id,
                      'shift_date', sr.shift_date,
                      'shift_template_id', sr.shift_template_id,
                      'shift_status', sr.shift_status,
                      'actual_hours_worked', sr.actual_hours_worked,
                      'actual_start_time', sr.actual_start_time,
                      'actual_end_time', sr.actual_end_time
                    )
                  ),
                  '[]'::json
                )
                FROM (
                  SELECT id, shift_date, shift_template_id, shift_status,
                         actual_hours_worked, actual_start_time, actual_end_time
                  FROM shift_rosters
                  WHERE staff_profile_id = sp.id
                  ORDER BY shift_date DESC
                  LIMIT 10
                ) sr
              )
            END as shift_rosters,
            CASE
              WHEN sp.id IS NULL THEN '[]'::json
              ELSE (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', te.id,
                      'timesheet_period_id', te.timesheet_period_id,
                      'period_name', tp.period_name,
                      'start_date', tp.start_date,
                      'end_date', tp.end_date,
                      'pay_date', tp.pay_date,
                      'regular_hours', te.regular_hours,
                      'overtime_hours', te.overtime_hours,
                      'break_hours', te.break_hours,
                      'regular_rate', te.regular_rate,
                      'overtime_rate', te.overtime_rate,
                      'total_regular_pay', te.total_regular_pay,
                      'total_overtime_pay', te.total_overtime_pay,
                      'total_pay', te.total_pay,
                      'status', te.status,
                      'approved_at', te.approved_at
                    )
                    ORDER BY tp.start_date DESC
                  ),
                  '[]'::json
                )
                FROM timesheet_entries te
                LEFT JOIN timesheet_periods tp ON te.timesheet_period_id = tp.id
                WHERE te.staff_profile_id = sp.id
                LIMIT 10
              )
            END as timesheet_entries
          FROM staff_profiles sp
          INNER JOIN users u ON sp.user_id = u.id
          LEFT JOIN departments d ON sp.department_id = d.id
          WHERE sp.business_id = $1
            AND sp.user_id = $2::uuid
          LIMIT 1
        `;
        queryParams = [businessId, employeeId];
      } else {
        query = `
          SELECT
            sp.id,
            sp.employee_id,
            sp.job_title,
            sp.employment_type,
            sp.hire_date,
            sp.base_wage_rate,
            sp.wage_type,
            sp.overtime_rate,
            sp.max_hours_per_week,
            sp.department_id,
            sp.is_active as profile_active,
            sp.created_at,
            sp.updated_at,
            u.email,
            u.full_name,
            u.role as user_role,
            d.name as department_name,
            d.code as department_code,
            -- Handle case where staff profile might not exist
            CASE
              WHEN sp.id IS NULL THEN '[]'::json
              ELSE (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', ce.id,
                      'event_type', ce.event_type,
                      'event_time', ce.event_time,
                      'gps_latitude', ce.gps_latitude,
                      'gps_longitude', ce.gps_longitude,
                      'hours_ago', ROUND(EXTRACT(EPOCH FROM (NOW() - ce.event_time)) / 3600, 1)
                    )
                  ),
                  '[]'::json
                )
                FROM (
                  SELECT id, event_type, event_time, gps_latitude, gps_longitude
                  FROM clock_events
                  WHERE staff_profile_id = sp.id
                  ORDER BY event_time DESC
                  LIMIT 20
                ) ce
              )
            END as clock_events,
            CASE
              WHEN sp.id IS NULL THEN '[]'::json
              ELSE (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', sr.id,
                      'shift_date', sr.shift_date,
                      'shift_template_id', sr.shift_template_id,
                      'shift_status', sr.shift_status,
                      'actual_hours_worked', sr.actual_hours_worked,
                      'actual_start_time', sr.actual_start_time,
                      'actual_end_time', sr.actual_end_time
                    )
                  ),
                  '[]'::json
                )
                FROM (
                  SELECT id, shift_date, shift_template_id, shift_status,
                         actual_hours_worked, actual_start_time, actual_end_time
                  FROM shift_rosters
                  WHERE staff_profile_id = sp.id
                  ORDER BY shift_date DESC
                  LIMIT 10
                ) sr
              )
            END as shift_rosters,
            CASE
              WHEN sp.id IS NULL THEN '[]'::json
              ELSE (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', te.id,
                      'timesheet_period_id', te.timesheet_period_id,
                      'period_name', tp.period_name,
                      'start_date', tp.start_date,
                      'end_date', tp.end_date,
                      'pay_date', tp.pay_date,
                      'regular_hours', te.regular_hours,
                      'overtime_hours', te.overtime_hours,
                      'break_hours', te.break_hours,
                      'regular_rate', te.regular_rate,
                      'overtime_rate', te.overtime_rate,
                      'total_regular_pay', te.total_regular_pay,
                      'total_overtime_pay', te.total_overtime_pay,
                      'total_pay', te.total_pay,
                      'status', te.status,
                      'approved_at', te.approved_at
                    )
                    ORDER BY tp.start_date DESC
                  ),
                  '[]'::json
                )
                FROM timesheet_entries te
                LEFT JOIN timesheet_periods tp ON te.timesheet_period_id = tp.id
                WHERE te.staff_profile_id = sp.id
                LIMIT 10
              )
            END as timesheet_entries
          FROM staff_profiles sp
          INNER JOIN users u ON sp.user_id = u.id
          LEFT JOIN departments d ON sp.department_id = d.id
          WHERE sp.business_id = $1
            AND sp.employee_id = $2
          LIMIT 1
        `;
        queryParams = [businessId, employeeId];
      }

      const result = await client.query(query, queryParams);

      if (result.rows.length === 0) {
        return null;
      }

      const workforceData = result.rows[0];

      // Ensure hours_ago is never NaN
      if (workforceData.clock_events && workforceData.clock_events.length > 0) {
        workforceData.clock_events = workforceData.clock_events.map(event => ({
          ...event,
          hours_ago: event.hours_ago || 0
        }));
      }

      return workforceData;

    } catch (error) {
      log.error('Error in UnifiedEmployeeService.getWorkforceData:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clock in for employee - FIXED with UUID detection
   */
  static async clockIn(businessId, employeeId, shiftRosterId = null, gpsLatitude = null, gpsLongitude = null) {
    const client = await getClient();

    try {
      // Determine if employeeId is a UUID or employee_id string
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId);

      let profileQuery;
      let queryParams;

      if (isUUID) {
        // employeeId is a UUID (user_id)
        profileQuery = `
          SELECT sp.id as staff_profile_id
          FROM staff_profiles sp
          INNER JOIN users u ON sp.user_id = u.id
          WHERE u.business_id = $1
            AND u.id = $2::uuid
          LIMIT 1
        `;
        queryParams = [businessId, employeeId];
      } else {
        // employeeId is an employee_id string (like "EMP5011")
        profileQuery = `
          SELECT sp.id as staff_profile_id
          FROM staff_profiles sp
          INNER JOIN users u ON sp.user_id = u.id
          WHERE u.business_id = $1
            AND sp.employee_id = $2
          LIMIT 1
        `;
        queryParams = [businessId, employeeId];
      }

      const profileResult = await client.query(profileQuery, queryParams);

      if (profileResult.rows.length === 0) {
        throw new Error('Employee not found or missing workforce profile');
      }

      const staffProfileId = profileResult.rows[0].staff_profile_id;

      // Check if already clocked in
      const lastEventQuery = `
        SELECT event_type
        FROM clock_events
        WHERE staff_profile_id = $1
        ORDER BY event_time DESC
        LIMIT 1
      `;

      const lastEventResult = await client.query(lastEventQuery, [staffProfileId]);

      if (lastEventResult.rows.length > 0 && lastEventResult.rows[0].event_type === 'clock_in') {
        throw new Error('Already clocked in');
      }

      // Create clock in event
      const clockInQuery = `
        INSERT INTO clock_events (
          business_id, staff_profile_id, shift_roster_id,
          event_type, gps_latitude, gps_longitude, event_time
        ) VALUES ($1, $2, $3, 'clock_in', $4, $5, NOW())
        RETURNING *
      `;

      const clockInResult = await client.query(clockInQuery, [
        businessId,
        staffProfileId,
        shiftRosterId,
        gpsLatitude,
        gpsLongitude
      ]);

      return clockInResult.rows[0];

    } catch (error) {
      log.error('Error in UnifiedEmployeeService.clockIn:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clock out for employee - FIXED with UUID detection
   */
  static async clockOut(businessId, employeeId, gpsLatitude = null, gpsLongitude = null) {
    const client = await getClient();

    try {
      // Determine if employeeId is a UUID or employee_id string
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId);

      let profileQuery;
      let queryParams;

      if (isUUID) {
        // employeeId is a UUID (user_id)
        profileQuery = `
          SELECT sp.id as staff_profile_id
          FROM staff_profiles sp
          INNER JOIN users u ON sp.user_id = u.id
          WHERE u.business_id = $1
            AND u.id = $2::uuid
          LIMIT 1
        `;
        queryParams = [businessId, employeeId];
      } else {
        // employeeId is an employee_id string (like "EMP5011")
        profileQuery = `
          SELECT sp.id as staff_profile_id
          FROM staff_profiles sp
          INNER JOIN users u ON sp.user_id = u.id
          WHERE u.business_id = $1
            AND sp.employee_id = $2
          LIMIT 1
        `;
        queryParams = [businessId, employeeId];
      }

      const profileResult = await client.query(profileQuery, queryParams);

      if (profileResult.rows.length === 0) {
        throw new Error('Employee not found or missing workforce profile');
      }

      const staffProfileId = profileResult.rows[0].staff_profile_id;

      // Check if clocked in
      const lastEventQuery = `
        SELECT event_type, id as last_event_id
        FROM clock_events
        WHERE staff_profile_id = $1
        ORDER BY event_time DESC
        LIMIT 1
      `;

      const lastEventResult = await client.query(lastEventQuery, [staffProfileId]);

      if (lastEventResult.rows.length === 0 || lastEventResult.rows[0].event_type !== 'clock_in') {
        throw new Error('Not clocked in');
      }

      // Create clock out event
      const clockOutQuery = `
        INSERT INTO clock_events (
          business_id, staff_profile_id,
          event_type, gps_latitude, gps_longitude, event_time
        ) VALUES ($1, $2, 'clock_out', $3, $4, NOW())
        RETURNING *
      `;

      const clockOutResult = await client.query(clockOutQuery, [
        businessId,
        staffProfileId,
        gpsLatitude,
        gpsLongitude
      ]);

      return clockOutResult.rows[0];

    } catch (error) {
      log.error('Error in UnifiedEmployeeService.clockOut:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update employee - NEEDS FIX with UUID detection
   */
  static async updateEmployee(businessId, employeeId, employeeData) {
    const client = await getClient();

    try {
      // Determine if employeeId is a UUID or employee_id string
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId);

      await client.query('BEGIN');

      // Update user record
      const userUpdateFields = [];
      const userUpdateValues = [];
      let userParamCount = 1;

      if (employeeData.email !== undefined) {
        userUpdateFields.push(`email = $${userParamCount++}`);
        userUpdateValues.push(employeeData.email);
      }

      if (employeeData.full_name !== undefined) {
        userUpdateFields.push(`full_name = $${userParamCount++}`);
        userUpdateValues.push(employeeData.full_name);
      }

      if (employeeData.role !== undefined) {
        userUpdateFields.push(`role = $${userParamCount++}`);
        userUpdateValues.push(employeeData.role);
      }

      if (employeeData.department_id !== undefined) {
        userUpdateFields.push(`department_id = $${userParamCount++}`);
        userUpdateValues.push(employeeData.department_id);
      }

      if (employeeData.phone !== undefined) {
        userUpdateFields.push(`phone = $${userParamCount++}`);
        userUpdateValues.push(employeeData.phone);
      }

      if (employeeData.is_active !== undefined) {
        userUpdateFields.push(`is_active = $${userParamCount++}`);
        userUpdateValues.push(employeeData.is_active);
      }

      if (userUpdateFields.length > 0) {
        let userUpdateQuery;
        if (isUUID) {
          userUpdateQuery = `
            UPDATE users
            SET ${userUpdateFields.join(', ')}, updated_at = NOW()
            WHERE business_id = $${userParamCount}
              AND id = $${userParamCount + 1}::uuid
            RETURNING *
          `;
        } else {
          userUpdateQuery = `
            UPDATE users
            SET ${userUpdateFields.join(', ')}, updated_at = NOW()
            WHERE business_id = $${userParamCount}
              AND id IN (SELECT user_id FROM staff_profiles WHERE employee_id = $${userParamCount + 1})
            RETURNING *
          `;
        }

        userUpdateValues.push(businessId, employeeId);
        await client.query(userUpdateQuery, userUpdateValues);
      }

      // Update staff profile if needed
      if (employeeData.job_title !== undefined ||
          employeeData.base_wage_rate !== undefined ||
          employeeData.employment_type !== undefined) {

        const profileUpdateFields = [];
        const profileUpdateValues = [];
        let profileParamCount = 1;

        if (employeeData.job_title !== undefined) {
          profileUpdateFields.push(`job_title = $${profileParamCount++}`);
          profileUpdateValues.push(employeeData.job_title);
        }

        if (employeeData.base_wage_rate !== undefined) {
          profileUpdateFields.push(`base_wage_rate = $${profileParamCount++}`);
          profileUpdateValues.push(employeeData.base_wage_rate);
        }

        if (employeeData.employment_type !== undefined) {
          profileUpdateFields.push(`employment_type = $${profileParamCount++}`);
          profileUpdateValues.push(employeeData.employment_type);
        }

        if (employeeData.department_id !== undefined) {
          profileUpdateFields.push(`department_id = $${profileParamCount++}`);
          profileUpdateValues.push(employeeData.department_id);
        }

        if (profileUpdateFields.length > 0) {
          let profileUpdateQuery;
          if (isUUID) {
            profileUpdateQuery = `
              UPDATE staff_profiles
              SET ${profileUpdateFields.join(', ')}, updated_at = NOW()
              WHERE business_id = $${profileParamCount}
                AND user_id = $${profileParamCount + 1}::uuid
              RETURNING *
            `;
          } else {
            profileUpdateQuery = `
              UPDATE staff_profiles
              SET ${profileUpdateFields.join(', ')}, updated_at = NOW()
              WHERE business_id = $${profileParamCount}
                AND employee_id = $${profileParamCount + 1}
              RETURNING *
            `;
          }

          profileUpdateValues.push(businessId, employeeId);
          await client.query(profileUpdateQuery, profileUpdateValues);
        }
      }

      await client.query('COMMIT');

      // Return updated employee
      const updatedEmployee = await this.getEmployeeById(businessId, employeeId);
      return updatedEmployee;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error in UnifiedEmployeeService.updateEmployee:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete employee - NEEDS FIX with UUID detection
   */
  static async deleteEmployee(businessId, employeeId) {
    const client = await getClient();

    try {
      // Determine if employeeId is a UUID or employee_id string
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId);

      await client.query('BEGIN');

      let getUserQuery;
      let queryParams;

      if (isUUID) {
        getUserQuery = `
          SELECT u.id as user_id
          FROM users u
          LEFT JOIN staff_profiles sp ON u.id = sp.user_id
          WHERE u.business_id = $1
            AND u.id = $2::uuid
          LIMIT 1
        `;
        queryParams = [businessId, employeeId];
      } else {
        getUserQuery = `
          SELECT u.id as user_id
          FROM users u
          LEFT JOIN staff_profiles sp ON u.id = sp.user_id
          WHERE u.business_id = $1
            AND sp.employee_id = $2
          LIMIT 1
        `;
        queryParams = [businessId, employeeId];
      }

      const userResult = await client.query(getUserQuery, queryParams);

      if (userResult.rows.length === 0) {
        throw new Error('Employee not found');
      }

      const userId = userResult.rows[0].user_id;

      // Soft delete user (set is_active = false)
      const deleteQuery = `
        UPDATE users
        SET is_active = false, updated_at = NOW()
        WHERE id = $1 AND business_id = $2
        RETURNING *
      `;

      const deleteResult = await client.query(deleteQuery, [userId, businessId]);

      await client.query('COMMIT');

      return deleteResult.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error in UnifiedEmployeeService.deleteEmployee:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get employee timesheet entries with period details - FIXED with correct column names
   */
  static async getTimesheetEntries(businessId, employeeId, limit = 10, offset = 0) {
    const client = await getClient();

    try {
      // Determine if employeeId is a UUID or employee_id string
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId);

      let query;
      let countQuery;
      let queryParams;

      if (isUUID) {
        query = `
          SELECT
            te.id,
            te.timesheet_period_id,
            tp.period_name,
            tp.start_date,
            tp.end_date,
            tp.pay_date,
            te.regular_hours,
            te.overtime_hours,
            te.break_hours,
            te.regular_rate,
            te.overtime_rate,
            te.total_regular_pay,
            te.total_overtime_pay,
            te.total_pay,
            te.status,
            te.approved_at,
            te.approved_by,
            te.notes,
            te.created_at,
            te.updated_at
          FROM timesheet_entries te
          LEFT JOIN timesheet_periods tp ON te.timesheet_period_id = tp.id
          WHERE te.business_id = $1
            AND te.staff_profile_id IN (
              SELECT id FROM staff_profiles WHERE user_id = $2::uuid
            )
          ORDER BY tp.start_date DESC NULLS LAST, te.created_at DESC
          LIMIT $3 OFFSET $4
        `;

        countQuery = `
          SELECT COUNT(*) as total
          FROM timesheet_entries te
          WHERE te.business_id = $1
            AND te.staff_profile_id IN (
              SELECT id FROM staff_profiles WHERE user_id = $2::uuid
            )
        `;

        queryParams = [businessId, employeeId, limit, offset];
      } else {
        query = `
          SELECT
            te.id,
            te.timesheet_period_id,
            tp.period_name,
            tp.start_date,
            tp.end_date,
            tp.pay_date,
            te.regular_hours,
            te.overtime_hours,
            te.break_hours,
            te.regular_rate,
            te.overtime_rate,
            te.total_regular_pay,
            te.total_overtime_pay,
            te.total_pay,
            te.status,
            te.approved_at,
            te.approved_by,
            te.notes,
            te.created_at,
            te.updated_at
          FROM timesheet_entries te
          LEFT JOIN timesheet_periods tp ON te.timesheet_period_id = tp.id
          WHERE te.business_id = $1
            AND te.staff_profile_id IN (
              SELECT id FROM staff_profiles WHERE employee_id = $2
            )
          ORDER BY tp.start_date DESC NULLS LAST, te.created_at DESC
          LIMIT $3 OFFSET $4
        `;

        countQuery = `
          SELECT COUNT(*) as total
          FROM timesheet_entries te
          WHERE te.business_id = $1
            AND te.staff_profile_id IN (
              SELECT id FROM staff_profiles WHERE employee_id = $2
            )
        `;

        queryParams = [businessId, employeeId, limit, offset];
      }

      const [entriesResult, countResult] = await Promise.all([
        client.query(query, queryParams),
        client.query(countQuery, queryParams.slice(0, 2))
      ]);

      return {
        entries: entriesResult.rows,
        total: parseInt(countResult.rows[0].total, 10),
        limit,
        offset
      };

    } catch (error) {
      log.error('Error in UnifiedEmployeeService.getTimesheetEntries:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get clock events for all employees or filtered by employee_id
   * FIXED: Now properly handles both cases (with and without employee_id)
   */
  static async getClockEvents(businessId, filters = {}) {
    const client = await getClient();

    try {
      let query = `
        SELECT
          ce.id,
          ce.business_id,
          ce.staff_profile_id,
          ce.shift_roster_id,
          ce.event_type,
          ce.event_time,
          ce.gps_latitude,
          ce.gps_longitude,
          ce.location_verified,
          ce.device_id,
          ce.ip_address,
          ce.notes,
          ce.created_at,
          sp.employee_id,
          u.full_name as user_full_name,
          u.email
        FROM clock_events ce
        JOIN staff_profiles sp ON ce.staff_profile_id = sp.id
        JOIN users u ON sp.user_id = u.id
        WHERE ce.business_id = $1
          AND u.business_id = $1  -- Ensure user belongs to the same business
      `;

      const params = [businessId];
      let paramCount = 1;

      // Apply filters - FIXED: Only filter by employee_id if it's provided and not empty
      if (filters.employee_id && filters.employee_id.trim() !== '') {
        paramCount++;
        query += ` AND sp.employee_id = $${paramCount}`;
        params.push(filters.employee_id.trim());
      }

      if (filters.start_date) {
        paramCount++;
        query += ` AND ce.event_time >= $${paramCount}`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        paramCount++;
        query += ` AND ce.event_time <= $${paramCount}`;
        params.push(filters.end_date);
      }

      if (filters.event_type) {
        paramCount++;
        query += ` AND ce.event_type = $${paramCount}`;
        params.push(filters.event_type);
      }

      query += ` ORDER BY ce.event_time DESC`;

      if (filters.limit) {
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        params.push(parseInt(filters.limit));
      }

      if (filters.offset) {
        paramCount++;
        query += ` OFFSET $${paramCount}`;
        params.push(parseInt(filters.offset));
      }

      const result = await client.query(query, params);
      return result.rows;

    } catch (error) {
      log.error('Error in UnifiedEmployeeService.getClockEvents:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get clock events for specific employee
   */
  static async getEmployeeClockEvents(businessId, employeeId, filters = {}) {
    const client = await getClient();

    try {
      // Determine if employeeId is a UUID or employee_id string
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId);

      // Get staff_profile_id
      let staffQuery;
      let staffParams;

      if (isUUID) {
        staffQuery = `
          SELECT sp.id as staff_profile_id
          FROM staff_profiles sp
          INNER JOIN users u ON sp.user_id = u.id
          WHERE u.business_id = $1
            AND u.id = $2::uuid
          LIMIT 1
        `;
        staffParams = [businessId, employeeId];
      } else {
        staffQuery = `
          SELECT sp.id as staff_profile_id
          FROM staff_profiles sp
          INNER JOIN users u ON sp.user_id = u.id
          WHERE u.business_id = $1
            AND sp.employee_id = $2
          LIMIT 1
        `;
        staffParams = [businessId, employeeId];
      }

      const staffResult = await client.query(staffQuery, staffParams);

      if (staffResult.rows.length === 0) {
        throw new Error(`Employee not found: ${employeeId}`);
      }

      const staffProfileId = staffResult.rows[0].staff_profile_id;

      // Query clock events
      let query = `
        SELECT
          ce.id,
          ce.business_id,
          ce.staff_profile_id,
          ce.shift_roster_id,
          ce.event_type,
          ce.event_time,
          ce.gps_latitude,
          ce.gps_longitude,
          ce.location_verified,
          ce.device_id,
          ce.ip_address,
          ce.notes,
          ce.created_at,
          sp.employee_id,
          u.full_name as user_full_name,
          u.email
        FROM clock_events ce
        JOIN staff_profiles sp ON ce.staff_profile_id = sp.id
        JOIN users u ON sp.user_id = u.id
        WHERE ce.business_id = $1
        AND ce.staff_profile_id = $2
      `;

      const params = [businessId, staffProfileId];
      let paramCount = 2;

      if (filters.start_date) {
        paramCount++;
        query += ` AND ce.event_time >= $${paramCount}`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        paramCount++;
        query += ` AND ce.event_time <= $${paramCount}`;
        params.push(filters.end_date);
      }

      if (filters.event_type) {
        paramCount++;
        query += ` AND ce.event_type = $${paramCount}`;
        params.push(filters.event_type);
      }

      query += ` ORDER BY ce.event_time DESC`;

      if (filters.limit) {
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        params.push(parseInt(filters.limit));
      }

      if (filters.offset) {
        paramCount++;
        query += ` OFFSET $${paramCount}`;
        params.push(parseInt(filters.offset));
      }

      const result = await client.query(query, params);
      return result.rows;

    } catch (error) {
      log.error('Error in UnifiedEmployeeService.getEmployeeClockEvents:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Start break for employee
   */
  static async startBreak(businessId, employeeId, notes = null) {
    const client = await getClient();

    try {
      // Determine if employeeId is a UUID or employee_id string
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId);

      let profileQuery;
      let queryParams;

      if (isUUID) {
        profileQuery = `
          SELECT sp.id as staff_profile_id
          FROM staff_profiles sp
          INNER JOIN users u ON sp.user_id = u.id
          WHERE u.business_id = $1
            AND u.id = $2::uuid
          LIMIT 1
        `;
        queryParams = [businessId, employeeId];
      } else {
        profileQuery = `
          SELECT sp.id as staff_profile_id
          FROM staff_profiles sp
          INNER JOIN users u ON sp.user_id = u.id
          WHERE u.business_id = $1
            AND sp.employee_id = $2
          LIMIT 1
        `;
        queryParams = [businessId, employeeId];
      }

      const profileResult = await client.query(profileQuery, queryParams);

      if (profileResult.rows.length === 0) {
        throw new Error('Employee not found or missing workforce profile');
      }

      const staffProfileId = profileResult.rows[0].staff_profile_id;

      // Check current status
      const lastEventQuery = `
        SELECT event_type
        FROM clock_events
        WHERE staff_profile_id = $1
        ORDER BY event_time DESC
        LIMIT 1
      `;

      const lastEventResult = await client.query(lastEventQuery, [staffProfileId]);

      if (lastEventResult.rows.length === 0 || lastEventResult.rows[0].event_type !== 'clock_in') {
        throw new Error('Must be clocked in to start break');
      }

      // Create break start event
      const breakQuery = `
        INSERT INTO clock_events (
          business_id, staff_profile_id,
          event_type, notes, event_time
        ) VALUES ($1, $2, 'break_start', $3, NOW())
        RETURNING *
      `;

      const breakResult = await client.query(breakQuery, [
        businessId,
        staffProfileId,
        notes
      ]);

      return breakResult.rows[0];

    } catch (error) {
      log.error('Error in UnifiedEmployeeService.startBreak:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * End break for employee
   */
  static async endBreak(businessId, employeeId, notes = null) {
    const client = await getClient();

    try {
      // Determine if employeeId is a UUID or employee_id string
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId);

      let profileQuery;
      let queryParams;

      if (isUUID) {
        profileQuery = `
          SELECT sp.id as staff_profile_id
          FROM staff_profiles sp
          INNER JOIN users u ON sp.user_id = u.id
          WHERE u.business_id = $1
            AND u.id = $2::uuid
          LIMIT 1
        `;
        queryParams = [businessId, employeeId];
      } else {
        profileQuery = `
          SELECT sp.id as staff_profile_id
          FROM staff_profiles sp
          INNER JOIN users u ON sp.user_id = u.id
          WHERE u.business_id = $1
            AND sp.employee_id = $2
          LIMIT 1
        `;
        queryParams = [businessId, employeeId];
      }

      const profileResult = await client.query(profileQuery, queryParams);

      if (profileResult.rows.length === 0) {
        throw new Error('Employee not found or missing workforce profile');
      }

      const staffProfileId = profileResult.rows[0].staff_profile_id;

      // Check current status
      const lastEventQuery = `
        SELECT event_type
        FROM clock_events
        WHERE staff_profile_id = $1
        ORDER BY event_time DESC
        LIMIT 1
      `;

      const lastEventResult = await client.query(lastEventQuery, [staffProfileId]);

      if (lastEventResult.rows.length === 0 || lastEventResult.rows[0].event_type !== 'break_start') {
        throw new Error('Not currently on break');
      }

      // Create break end event
      const breakQuery = `
        INSERT INTO clock_events (
          business_id, staff_profile_id,
          event_type, notes, event_time
        ) VALUES ($1, $2, 'break_end', $3, NOW())
        RETURNING *
      `;

      const breakResult = await client.query(breakQuery, [
        businessId,
        staffProfileId,
        notes
      ]);

      return breakResult.rows[0];

    } catch (error) {
      log.error('Error in UnifiedEmployeeService.endBreak:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
FIXED_SERVICE

echo "✅ Fixed getClockEvents method in backend service"
echo "✅ Now properly handles empty employee_id (returns all events)"
echo "✅ Added trim() and empty string check"
echo "✅ Backup saved to unifiedEmployeeService.js.backup"

# Test the fix
echo ""
echo "=== TESTING THE FIX ==="

TOKEN=$(curl -s -X POST "http://localhost:8002/api/businesses/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"fixed@test.com","password":"fixed123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4 2>/dev/null)

echo "1. Testing /api/employees/clock-events (all events):"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees/clock-events?limit=1" | \
  python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('success'):
        print(f'   ✅ Works - Count: {data.get(\"count\")}')
        if data.get('data'):
            print(f'   First event type: {data[\"data\"][0].get(\"event_type\")}')
    else:
        print(f'   ❌ Failed - {data.get(\"error\")}')
except Exception as e:
    print(f'   ❌ Error: {e}')
"

echo ""
echo "2. Testing /api/employees/clock-events?employee_id=EMP5019:"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees/clock-events?employee_id=EMP5019&limit=1" | \
  python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('success'):
        print(f'   ✅ Works - Count: {data.get(\"count\")}')
    else:
        print(f'   ❌ Failed - {data.get(\"error\")}')
except Exception as e:
    print(f'   ❌ Error: {e}')
"

echo ""
echo "3. Testing /api/employees/EMP5019/clock-events (employee-specific):"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees/EMP5019/clock-events?limit=1" | \
  python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('success'):
        print(f'   ✅ Works - Count: {data.get(\"count\")}')
    else:
        print(f'   ❌ Failed - {data.get(\"error\")}')
except Exception as e:
    print(f'   ❌ Error: {e}')
"
