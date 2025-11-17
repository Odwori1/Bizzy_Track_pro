import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';

export class BranchService {
  
  // Create a new business branch
  static async createBranch(businessId, branchData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `INSERT INTO business_branches 
         (business_id, name, code, address, city, state, country, postal_code, phone, email, manager_id, timezone, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          businessId,
          branchData.name,
          branchData.code,
          branchData.address || null,
          branchData.city || null,
          branchData.state || null,
          branchData.country || 'US',
          branchData.postal_code || null,
          branchData.phone || null,
          branchData.email || null,
          branchData.manager_id || null,
          branchData.timezone || 'UTC',
          branchData.latitude || null,
          branchData.longitude || null
        ]
      );
      
      const branch = result.rows[0];
      
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'branch.created',
        resourceType: 'business_branches',
        resourceId: branch.id,
        newValues: {
          name: branchData.name,
          code: branchData.code
        }
      });
      
      await client.query('COMMIT');
      return branch;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Get all branches for a business - FIXED COLUMN NAMES
  static async getBranches(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT bb.*, u.email as manager_email
         FROM business_branches bb
         LEFT JOIN users u ON bb.manager_id = u.id
         WHERE bb.business_id = $1
         ORDER BY bb.name`,
        [businessId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }
  
  // Get a specific branch - FIXED COLUMN NAMES
  static async getBranchById(businessId, branchId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT bb.*, u.email as manager_email
         FROM business_branches bb
         LEFT JOIN users u ON bb.manager_id = u.id
         WHERE bb.business_id = $1 AND bb.id = $2`,
        [businessId, branchId]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }
  
  // Update a branch
  static async updateBranch(businessId, branchId, updateData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      const currentBranch = await client.query(
        'SELECT * FROM business_branches WHERE business_id = $1 AND id = $2',
        [businessId, branchId]
      );
      
      if (currentBranch.rows.length === 0) {
        throw new Error('Branch not found');
      }
      
      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;
      
      const fieldMapping = {
        name: 'name',
        code: 'code',
        address: 'address',
        city: 'city',
        state: 'state',
        country: 'country',
        postal_code: 'postal_code',
        phone: 'phone',
        email: 'email',
        manager_id: 'manager_id',
        timezone: 'timezone',
        latitude: 'latitude',
        longitude: 'longitude',
        is_active: 'is_active'
      };
      
      for (const [key, dbField] of Object.entries(fieldMapping)) {
        if (updateData[key] !== undefined) {
          updateFields.push(`${dbField} = $${paramCount}`);
          updateValues.push(updateData[key]);
          paramCount++;
        }
      }
      
      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }
      
      updateFields.push('updated_at = NOW()');
      updateValues.push(businessId, branchId);
      
      const result = await client.query(
        `UPDATE business_branches 
         SET ${updateFields.join(', ')}
         WHERE business_id = $${paramCount} AND id = $${paramCount + 1}
         RETURNING *`,
        updateValues
      );
      
      const updatedBranch = result.rows[0];
      
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'branch.updated',
        resourceType: 'business_branches',
        resourceId: branchId,
        previousValues: currentBranch.rows[0],
        newValues: updatedBranch
      });
      
      await client.query('COMMIT');
      return updatedBranch;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Create branch permission set
  static async createBranchPermissionSet(businessId, permissionData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      const branchCheck = await client.query(
        'SELECT id FROM business_branches WHERE business_id = $1 AND id = $2',
        [businessId, permissionData.branch_id]
      );
      
      if (branchCheck.rows.length === 0) {
        throw new Error('Branch not found or access denied');
      }
      
      const result = await client.query(
        `INSERT INTO branch_permission_sets 
         (business_id, branch_id, name, description, permissions, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          businessId,
          permissionData.branch_id,
          permissionData.name,
          permissionData.description || null,
          JSON.stringify(permissionData.permissions || []),
          userId
        ]
      );
      
      const permissionSet = result.rows[0];
      
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'branch_permission_set.created',
        resourceType: 'branch_permission_sets',
        resourceId: permissionSet.id,
        newValues: {
          branch_id: permissionData.branch_id,
          name: permissionData.name,
          permissions_count: permissionData.permissions?.length || 0
        }
      });
      
      await client.query('COMMIT');
      return permissionSet;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Assign user to branch
  static async assignUserToBranch(businessId, assignmentData, assignedByUserId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      const branchCheck = await client.query(
        'SELECT id FROM business_branches WHERE business_id = $1 AND id = $2',
        [businessId, assignmentData.branch_id]
      );
      
      if (branchCheck.rows.length === 0) {
        throw new Error('Branch not found or access denied');
      }
      
      if (assignmentData.is_primary) {
        await client.query(
          'UPDATE user_branch_assignments SET is_primary = false WHERE business_id = $1 AND user_id = $2',
          [businessId, assignmentData.user_id]
        );
      }
      
      const result = await client.query(
        `INSERT INTO user_branch_assignments 
         (business_id, user_id, branch_id, is_primary, assigned_permissions, assigned_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (business_id, user_id, branch_id) 
         DO UPDATE SET is_primary = $4, assigned_permissions = $5, assigned_by = $6
         RETURNING *`,
        [
          businessId,
          assignmentData.user_id,
          assignmentData.branch_id,
          assignmentData.is_primary,
          JSON.stringify(assignmentData.assigned_permissions || []),
          assignedByUserId
        ]
      );
      
      const assignment = result.rows[0];
      
      await auditLogger.logAction({
        businessId,
        userId: assignedByUserId,
        action: 'user_branch_assigned',
        resourceType: 'user_branch_assignments',
        resourceId: assignment.id,
        newValues: {
          user_id: assignmentData.user_id,
          branch_id: assignmentData.branch_id,
          is_primary: assignmentData.is_primary
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
  
  // Get user's branch assignments
  static async getUserBranchAssignments(businessId, userId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT uba.*, bb.name as branch_name, bb.code as branch_code
         FROM user_branch_assignments uba
         JOIN business_branches bb ON uba.branch_id = bb.id
         WHERE uba.business_id = $1 AND uba.user_id = $2
         ORDER BY uba.is_primary DESC, bb.name`,
        [businessId, userId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }
  
  // Create cross-branch access rule
  static async createCrossBranchAccess(businessId, accessData, userId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `INSERT INTO cross_branch_access_rules 
         (business_id, from_branch_id, to_branch_id, access_type, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          businessId,
          accessData.from_branch_id,
          accessData.to_branch_id,
          accessData.access_type,
          accessData.description || null,
          userId
        ]
      );
      
      const accessRule = result.rows[0];
      
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'cross_branch_access.created',
        resourceType: 'cross_branch_access_rules',
        resourceId: accessRule.id,
        newValues: {
          from_branch_id: accessData.from_branch_id,
          to_branch_id: accessData.to_branch_id,
          access_type: accessData.access_type
        }
      });
      
      await client.query('COMMIT');
      return accessRule;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
