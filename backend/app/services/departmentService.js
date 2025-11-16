import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class DepartmentService {
  /**
   * Create a new department
   */
  static async createDepartment(businessId, departmentData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if department code already exists for this business
      const existingCheck = await client.query(
        'SELECT id FROM departments WHERE business_id = $1 AND code = $2',
        [businessId, departmentData.code]
      );

      if (existingCheck.rows.length > 0) {
        throw new Error('Department code already exists for this business');
      }

      // Insert new department
      const result = await client.query(
        `INSERT INTO departments (
          business_id, name, code, description, parent_department_id,
          cost_center_code, department_type, color_hex, sort_order, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          businessId,
          departmentData.name,
          departmentData.code,
          departmentData.description || '',
          departmentData.parent_department_id || null,
          departmentData.cost_center_code || '',
          departmentData.department_type,
          departmentData.color_hex || '',
          departmentData.sort_order || 0,
          departmentData.is_active !== false
        ]
      );

      const department = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'department.created',
        resourceType: 'department',
        resourceId: department.id,
        newValues: {
          name: department.name,
          code: department.code,
          department_type: department.department_type
        }
      });

      await client.query('COMMIT');
      return department;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all departments with optional filters
   */
  static async getDepartments(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT
          d.*,
          parent.name as parent_department_name,
          COUNT(DISTINCT jda.id) as active_assignments_count,
          COUNT(DISTINCT dr.id) as role_count
        FROM departments d
        LEFT JOIN departments parent ON d.parent_department_id = parent.id
        LEFT JOIN job_department_assignments jda ON d.id = jda.department_id AND jda.status IN ('assigned', 'in_progress')
        LEFT JOIN department_roles dr ON d.id = dr.department_id
        WHERE d.business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (filters.department_type) {
        paramCount++;
        queryStr += ` AND d.department_type = $${paramCount}`;
        params.push(filters.department_type);
      }

      if (filters.is_active !== undefined) {
        paramCount++;
        queryStr += ` AND d.is_active = $${paramCount}`;
        params.push(filters.is_active);
      }

      queryStr += ' GROUP BY d.id, parent.name ORDER BY d.sort_order, d.name';

      log.info('🗄️ Database Query - getDepartments:', { query: queryStr, params });

      const result = await client.query(queryStr, params);

      log.info('✅ Departments query successful', {
        rowCount: result.rows.length,
        businessId
      });

      return result.rows;
    } catch (error) {
      log.error('❌ Departments query failed:', {
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
   * Get department by ID with hierarchy
   */
  static async getDepartmentById(businessId, departmentId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT
          d.*,
          parent.name as parent_department_name,
          parent.code as parent_department_code,
          COUNT(DISTINCT jda.id) as active_assignments_count,
          COUNT(DISTINCT dr.id) as role_count
        FROM departments d
        LEFT JOIN departments parent ON d.parent_department_id = parent.id
        LEFT JOIN job_department_assignments jda ON d.id = jda.department_id AND jda.status IN ('assigned', 'in_progress')
        LEFT JOIN department_roles dr ON d.id = dr.department_id
        WHERE d.business_id = $1 AND d.id = $2
        GROUP BY d.id, parent.name, parent.code
      `;

      const result = await client.query(queryStr, [businessId, departmentId]);

      if (result.rows.length === 0) {
        throw new Error('Department not found or access denied');
      }

      // Get child departments
      const childrenResult = await client.query(
        `SELECT id, name, code, department_type, is_active
         FROM departments
         WHERE business_id = $1 AND parent_department_id = $2
         ORDER BY sort_order, name`,
        [businessId, departmentId]
      );

      const department = result.rows[0];
      department.child_departments = childrenResult.rows;

      return department;
    } catch (error) {
      log.error('❌ Department query failed:', {
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
   * Update department
   */
  static async updateDepartment(businessId, departmentId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify department belongs to business and get current values
      const currentDepartment = await client.query(
        'SELECT * FROM departments WHERE id = $1 AND business_id = $2',
        [departmentId, businessId]
      );

      if (currentDepartment.rows.length === 0) {
        throw new Error('Department not found or access denied');
      }

      // Check if code already exists (if code is being updated)
      if (updateData.code && updateData.code !== currentDepartment.rows[0].code) {
        const codeCheck = await client.query(
          'SELECT id FROM departments WHERE business_id = $1 AND code = $2 AND id != $3',
          [businessId, updateData.code, departmentId]
        );

        if (codeCheck.rows.length > 0) {
          throw new Error('Department code already exists for this business');
        }
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
      updateValues.push(departmentId);
      paramCount++;
      updateValues.push(businessId);

      const updateQuery = `
        UPDATE departments
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount - 1} AND business_id = $${paramCount}
        RETURNING *
      `;

      log.info('🗄️ Database Query - updateDepartment:', { query: updateQuery, params: updateValues });

      const result = await client.query(updateQuery, updateValues);
      const updatedDepartment = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'department.updated',
        resourceType: 'department',
        resourceId: departmentId,
        oldValues: currentDepartment.rows[0],
        newValues: updatedDepartment
      });

      await client.query('COMMIT');
      return updatedDepartment;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete department (soft delete by setting inactive)
   */
  static async deleteDepartment(businessId, departmentId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify department belongs to business
      const departmentCheck = await client.query(
        'SELECT * FROM departments WHERE id = $1 AND business_id = $2',
        [departmentId, businessId]
      );

      if (departmentCheck.rows.length === 0) {
        throw new Error('Department not found or access denied');
      }

      // Check if department has active assignments
      const activeAssignments = await client.query(
        'SELECT COUNT(*) FROM job_department_assignments WHERE department_id = $1 AND status IN ($2, $3)',
        [departmentId, 'assigned', 'in_progress']
      );

      if (parseInt(activeAssignments.rows[0].count) > 0) {
        throw new Error('Cannot delete department with active job assignments');
      }

      // Check if department has child departments
      const childDepartments = await client.query(
        'SELECT COUNT(*) FROM departments WHERE parent_department_id = $1 AND is_active = true',
        [departmentId]
      );

      if (parseInt(childDepartments.rows[0].count) > 0) {
        throw new Error('Cannot delete department with active child departments');
      }

      // Soft delete by setting inactive
      const result = await client.query(
        'UPDATE departments SET is_active = false, updated_at = NOW() WHERE id = $1 AND business_id = $2 RETURNING *',
        [departmentId, businessId]
      );

      const deletedDepartment = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'department.deleted',
        resourceType: 'department',
        resourceId: departmentId,
        oldValues: departmentCheck.rows[0]
      });

      await client.query('COMMIT');
      return deletedDepartment;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get department hierarchy
   */
  static async getDepartmentHierarchy(businessId) {
    const client = await getClient();

    try {
      const queryStr = `
        WITH RECURSIVE department_hierarchy AS (
          -- Base case: top-level departments (no parent)
          SELECT 
            id, name, code, department_type, parent_department_id,
            color_hex, is_active, sort_order,
            1 as level,
            ARRAY[name]::text[] as path,
            ARRAY[sort_order]::integer[] as sort_path
          FROM departments 
          WHERE business_id = $1 AND parent_department_id IS NULL AND is_active = true
          
          UNION ALL
          
          -- Recursive case: child departments
          SELECT 
            d.id, d.name, d.code, d.department_type, d.parent_department_id,
            d.color_hex, d.is_active, d.sort_order,
            dh.level + 1 as level,
            dh.path || d.name as path,
            dh.sort_path || d.sort_order as sort_path
          FROM departments d
          INNER JOIN department_hierarchy dh ON d.parent_department_id = dh.id
          WHERE d.business_id = $1 AND d.is_active = true
        )
        SELECT 
          id, name, code, department_type, parent_department_id,
          color_hex, is_active, sort_order, level, path, sort_path
        FROM department_hierarchy
        ORDER BY sort_path, name
      `;

      const result = await client.query(queryStr, [businessId]);
      return result.rows;
    } catch (error) {
      log.error('❌ Department hierarchy query failed:', {
        error: error.message,
        businessId
      });
      throw error;
    } finally {
      client.release();
    }
  }
}
