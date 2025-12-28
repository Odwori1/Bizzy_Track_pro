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
   * Get current clock state for an employee
   * Properly tracks state through clock_in/out and break_start/end events
   */
  static async getCurrentClockState(staffProfileId, client) {
    const query = `
      WITH latest_clock AS (
        SELECT event_type, event_time
        FROM clock_events
        WHERE staff_profile_id = $1
          AND event_type IN ('clock_in', 'clock_out')
        ORDER BY event_time DESC
        LIMIT 1
      ),
      latest_break AS (
        SELECT event_type, event_time
        FROM clock_events
        WHERE staff_profile_id = $1
          AND event_type IN ('break_start', 'break_end')
        ORDER BY event_time DESC
        LIMIT 1
      )
      SELECT 
        lc.event_type as clock_event,
        lc.event_time as clock_time,
        lb.event_type as break_event,
        lb.event_time as break_time
      FROM latest_clock lc
      FULL OUTER JOIN latest_break lb ON true
    `;

    const result = await client.query(query, [staffProfileId]);
    
    if (result.rows.length === 0 || !result.rows[0].clock_event) {
      return { 
        state: 'clocked_out', 
        canClockIn: true, 
        canClockOut: false, 
        canBreak: false 
      };
    }

    const row = result.rows[0];
    
    // If last clock event is clock_out, they're clocked out
    if (row.clock_event === 'clock_out') {
      return { 
        state: 'clocked_out', 
        canClockIn: true, 
        canClockOut: false, 
        canBreak: false 
      };
    }

    // Last clock event is clock_in, check break status
    if (row.break_event === 'break_start' && 
        row.break_time > row.clock_time) {
      return { 
        state: 'on_break', 
        canClockIn: false, 
        canClockOut: true,  // Allow clock out while on break
        canBreak: false,
        canEndBreak: true 
      };
    }

    // They're clocked in (not on break)
    return { 
      state: 'clocked_in', 
      canClockIn: false, 
      canClockOut: true, 
      canBreak: true 
    };
  }

  /**
   * Clock in for employee - ENHANCED VERSION
   */
  static async clockIn(businessId, employeeId, shiftRosterId = null, gpsLatitude = null, gpsLongitude = null) {
    const client = await getClient();

    try {
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

      // Get current state
      const currentState = await this.getCurrentClockState(staffProfileId, client);

      log.info('Clock in - current state', { 
        employeeId, 
        state: currentState.state,
        canClockIn: currentState.canClockIn
      });

      // Check if they can clock in
      if (!currentState.canClockIn) {
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
   * Clock out for employee - FIXED VERSION
   */
  static async clockOut(businessId, employeeId, gpsLatitude = null, gpsLongitude = null) {
    const client = await getClient();

    try {
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

      // Get current state using the helper function
      const currentState = await this.getCurrentClockState(staffProfileId, client);

      log.info('Clock out - current state', { 
        employeeId, 
        state: currentState.state,
        canClockOut: currentState.canClockOut
      });

      // Check if they can clock out
      if (!currentState.canClockOut) {
        throw new Error('Not clocked in');
      }

      // If they're on break, end the break first automatically
      if (currentState.state === 'on_break') {
        log.info('Auto-ending break before clock out', { employeeId });
        await client.query(`
          INSERT INTO clock_events (
            business_id, staff_profile_id,
            event_type, notes, event_time
          ) VALUES ($1, $2, 'break_end', 'Auto-ended before clock out', NOW())
        `, [businessId, staffProfileId]);
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
   * Get clock events for specific employee
   */
  static async getEmployeeClockEvents(businessId, employeeId, filters = {}) {
    console.log("=== TRACE: getEmployeeClockEvents called ===");
    console.log("employeeId:", employeeId);
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
   * Get clock events for all employees with comprehensive filtering
   *
   * This method retrieves clock events across all employees in the business,
   * with support for filtering by employee, date range, event type, and pagination.
   * It follows the same patterns as getEmployeeClockEvents but works across all staff.
   *
   * @param {string} businessId - The business UUID
   * @param {Object} filters - Filter options
   * @param {string} filters.employee_id - Optional: Filter by specific employee (UUID or EMPxxx)
   * @param {string} filters.start_date - Optional: Filter events after this date (ISO format)
   * @param {string} filters.end_date - Optional: Filter events before this date (ISO format)
   * @param {string} filters.event_type - Optional: Filter by event type (clock_in, clock_out, break_start, break_end)
   * @param {number} filters.limit - Number of results to return (default: 50, max: 1000)
   * @param {number} filters.offset - Number of results to skip (default: 0)
   * @returns {Promise<Array>} Array of clock event objects with employee details
   */
  static async getClockEvents(businessId, filters = {}) {
    const client = await getClient();

    try {
      log.info(`Fetching clock events for business ${businessId}`, { filters });

      // Build the base query with proper joins to get employee information
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
          -- Employee information from staff profile
          sp.employee_id,
          sp.job_title,
          sp.employment_type,
          -- User information
          u.full_name as user_full_name,
          u.email,
          u.role as user_role,
          -- Department information
          d.name as department_name,
          d.code as department_code,
          -- Shift information (if associated with a shift)
          sr.shift_date,
          sr.shift_status,
          sr.actual_start_time,
          sr.actual_end_time,
          sr.actual_hours_worked
        FROM clock_events ce
        INNER JOIN staff_profiles sp ON ce.staff_profile_id = sp.id
        INNER JOIN users u ON sp.user_id = u.id
        LEFT JOIN departments d ON sp.department_id = d.id
        LEFT JOIN shift_rosters sr ON ce.shift_roster_id = sr.id
        WHERE ce.business_id = $1
          AND u.business_id = $1
      `;

      const params = [businessId];
      let paramCount = 1;

      // Apply employee_id filter if provided
      if (filters.employee_id) {
        // Determine if it's a UUID or EMPxxx format
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.employee_id);

        if (isUUID) {
          // Filter by user UUID
          paramCount++;
          query += ` AND u.id = $${paramCount}::uuid`;
          params.push(filters.employee_id);
        } else {
          // Filter by employee_id string
          paramCount++;
          query += ` AND sp.employee_id = $${paramCount}`;
          params.push(filters.employee_id);
        }
      }

      // Apply date range filters
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

      // Apply event type filter
      if (filters.event_type) {
        paramCount++;
        query += ` AND ce.event_type = $${paramCount}`;
        params.push(filters.event_type);
      }

      // Apply department filter (if needed in the future)
      if (filters.department_id) {
        paramCount++;
        query += ` AND sp.department_id = $${paramCount}::uuid`;
        params.push(filters.department_id);
      }

      // Order by most recent first
      query += ` ORDER BY ce.event_time DESC`;

      // Apply pagination
      const limit = parseInt(filters.limit) || 50;
      const offset = parseInt(filters.offset) || 0;

      // Validate limits to prevent abuse
      const validatedLimit = Math.min(Math.max(limit, 1), 1000);
      const validatedOffset = Math.max(offset, 0);

      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(validatedLimit);

      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(validatedOffset);

      log.debug('Executing clock events query', {
        paramCount,
        limit: validatedLimit,
        offset: validatedOffset
      });

      const result = await client.query(query, params);

      log.info(`Found ${result.rows.length} clock events`, {
        businessId,
        total: result.rows.length
      });

      return result.rows;

    } catch (error) {
      log.error('Error in UnifiedEmployeeService.getClockEvents:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get clock events summary/statistics for dashboard or reporting
   * Useful companion method for analytics
   *
   * @param {string} businessId - The business UUID
   * @param {Object} filters - Filter options (same as getClockEvents)
   * @returns {Promise<Object>} Summary statistics
   */
  static async getClockEventsSummary(businessId, filters = {}) {
    const client = await getClient();

    try {
      log.info(`Fetching clock events summary for business ${businessId}`, { filters });

      let query = `
        SELECT
          COUNT(*) as total_events,
          COUNT(DISTINCT sp.employee_id) as unique_employees,
          COUNT(CASE WHEN ce.event_type = 'clock_in' THEN 1 END) as clock_ins,
          COUNT(CASE WHEN ce.event_type = 'clock_out' THEN 1 END) as clock_outs,
          COUNT(CASE WHEN ce.event_type = 'break_start' THEN 1 END) as break_starts,
          COUNT(CASE WHEN ce.event_type = 'break_end' THEN 1 END) as break_ends,
          MIN(ce.event_time) as earliest_event,
          MAX(ce.event_time) as latest_event,
          -- Count events by day for trend analysis
          COUNT(CASE WHEN ce.event_time >= NOW() - INTERVAL '1 day' THEN 1 END) as events_last_24h,
          COUNT(CASE WHEN ce.event_time >= NOW() - INTERVAL '7 days' THEN 1 END) as events_last_7d,
          COUNT(CASE WHEN ce.event_time >= NOW() - INTERVAL '30 days' THEN 1 END) as events_last_30d
        FROM clock_events ce
        INNER JOIN staff_profiles sp ON ce.staff_profile_id = sp.id
        INNER JOIN users u ON sp.user_id = u.id
        WHERE ce.business_id = $1
          AND u.business_id = $1
      `;

      const params = [businessId];
      let paramCount = 1;

      // Apply same filters as main method
      if (filters.employee_id) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.employee_id);
        paramCount++;
        if (isUUID) {
          query += ` AND u.id = $${paramCount}::uuid`;
        } else {
          query += ` AND sp.employee_id = $${paramCount}`;
        }
        params.push(filters.employee_id);
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

      const result = await client.query(query, params);

      return result.rows[0];

    } catch (error) {
      log.error('Error in UnifiedEmployeeService.getClockEventsSummary:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get currently clocked-in employees
   * Useful for real-time dashboard showing who's working now
   *
   * @param {string} businessId - The business UUID
   * @returns {Promise<Array>} Array of currently clocked-in employees with their clock-in details
   */
  static async getCurrentlyClockedInEmployees(businessId) {
    const client = await getClient();

    try {
      log.info(`Fetching currently clocked-in employees for business ${businessId}`);

      const query = `
        WITH latest_events AS (
          SELECT DISTINCT ON (ce.staff_profile_id)
            ce.staff_profile_id,
            ce.event_type,
            ce.event_time,
            ce.gps_latitude,
            ce.gps_longitude
          FROM clock_events ce
          WHERE ce.business_id = $1
          ORDER BY ce.staff_profile_id, ce.event_time DESC
        )
        SELECT
          sp.employee_id,
          u.full_name,
          u.email,
          sp.job_title,
          d.name as department_name,
          le.event_time as clock_in_time,
          le.gps_latitude,
          le.gps_longitude,
          EXTRACT(EPOCH FROM (NOW() - le.event_time)) / 3600 as hours_since_clock_in,
          -- Get their current shift if any
          sr.shift_date,
          sr.shift_status
        FROM latest_events le
        INNER JOIN staff_profiles sp ON le.staff_profile_id = sp.id
        INNER JOIN users u ON sp.user_id = u.id
        LEFT JOIN departments d ON sp.department_id = d.id
        LEFT JOIN shift_rosters sr ON sp.id = sr.staff_profile_id
          AND sr.shift_date = CURRENT_DATE
          AND sr.shift_status = 'in_progress'
        WHERE le.event_type = 'clock_in'
          AND u.business_id = $1
        ORDER BY le.event_time DESC
      `;

      const result = await client.query(query, [businessId]);

      log.info(`Found ${result.rows.length} currently clocked-in employees`);

      return result.rows;

    } catch (error) {
      log.error('Error in UnifiedEmployeeService.getCurrentlyClockedInEmployees:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Start break for employee - ENHANCED VERSION
   */
  static async startBreak(businessId, employeeId, notes = null) {
    const client = await getClient();

    try {
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

      // Get current state
      const currentState = await this.getCurrentClockState(staffProfileId, client);

      log.info('Start break - current state', { 
        employeeId, 
        state: currentState.state,
        canBreak: currentState.canBreak
      });

      // Check if they can start break
      if (!currentState.canBreak) {
        if (currentState.state === 'clocked_out') {
          throw new Error('Must be clocked in to start break');
        } else if (currentState.state === 'on_break') {
          throw new Error('Already on break');
        }
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
   * End break for employee - ENHANCED VERSION
   */
  static async endBreak(businessId, employeeId, notes = null) {
    const client = await getClient();

    try {
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

      // Get current state
      const currentState = await this.getCurrentClockState(staffProfileId, client);

      log.info('End break - current state', { 
        employeeId, 
        state: currentState.state,
        canEndBreak: currentState.canEndBreak
      });

      // Check if they can end break
      if (!currentState.canEndBreak) {
        if (currentState.state === 'clocked_out') {
          throw new Error('Not clocked in');
        } else if (currentState.state === 'clocked_in') {
          throw new Error('Not currently on break');
        }
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
