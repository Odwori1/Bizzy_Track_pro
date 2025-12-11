import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

export class PermissionService {
  
  /**
   * Get all permission categories
   */
  static async getPermissionCategories(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(`
        SELECT 
          category,
          COUNT(*) as permission_count,
          MIN(description) as sample_description
        FROM permissions 
        WHERE business_id IS NULL OR business_id = $1
        GROUP BY category 
        ORDER BY category
      `, [businessId]);

      return result.rows;
    } catch (error) {
      log.error('Failed to fetch permission categories:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get permissions by category
   */
  static async getPermissionsByCategory(businessId, category) {
    const client = await getClient();
    try {
      const result = await client.query(`
        SELECT 
          id, name, description, action, resource_type, category,
          created_at, updated_at
        FROM permissions 
        WHERE (business_id IS NULL OR business_id = $1)
          AND category = $2
        ORDER BY name
      `, [businessId, category]);

      return result.rows;
    } catch (error) {
      log.error('Failed to fetch permissions by category:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get role permissions (RBAC)
   */
  static async getRolePermissions(businessId, roleId) {
    const client = await getClient();
    try {
      const result = await client.query(`
        SELECT 
          p.id, p.name, p.description, p.category,
          CASE WHEN rp.role_id IS NOT NULL THEN true ELSE false END as has_permission,
          r.name as role_name
        FROM permissions p
        CROSS JOIN roles r
        LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.role_id = $2
        WHERE r.id = $2 
          AND r.business_id = $1
          AND (p.business_id IS NULL OR p.business_id = $1)
        ORDER BY p.category, p.name
      `, [businessId, roleId]);

      return result.rows;
    } catch (error) {
      log.error('Failed to fetch role permissions:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update role permissions (RBAC)
   */
  static async updateRolePermissions(businessId, roleId, permissionUpdates, updatedBy) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      // Get role info
      const roleResult = await client.query(
        'SELECT name FROM roles WHERE id = $1 AND business_id = $2',
        [roleId, businessId]
      );

      if (roleResult.rows.length === 0) {
        throw new Error('Role not found');
      }

      const roleName = roleResult.rows[0].name;

      // Process updates based on operation
      const { operation, permissions } = permissionUpdates;
      
      if (operation === 'replace') {
        // Clear all existing permissions for this role
        await client.query(
          'DELETE FROM role_permissions WHERE role_id = $1',
          [roleId]
        );

        // Add new permissions
        if (permissions.length > 0) {
          // Validate permissions belong to this business or are system permissions
          for (const permId of permissions) {
            const permCheck = await client.query(
              'SELECT 1 FROM permissions WHERE id = $1 AND (business_id IS NULL OR business_id = $2)',
              [permId, businessId]
            );
            
            if (permCheck.rows.length === 0) {
              throw new Error(`Permission ${permId} not found or not accessible`);
            }
            
            await client.query(`
              INSERT INTO role_permissions (role_id, permission_id)
              VALUES ($1, $2)
              ON CONFLICT (role_id, permission_id) DO NOTHING
            `, [roleId, permId]);
          }
        }
      } 
      else if (operation === 'add') {
        // Add only new permissions
        for (const permId of permissions) {
          // Validate permission belongs to this business or is system permission
          const permCheck = await client.query(
            'SELECT 1 FROM permissions WHERE id = $1 AND (business_id IS NULL OR business_id = $2)',
            [permId, businessId]
          );
          
          if (permCheck.rows.length === 0) {
            throw new Error(`Permission ${permId} not found or not accessible`);
          }
          
          await client.query(`
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES ($1, $2)
            ON CONFLICT (role_id, permission_id) DO NOTHING
          `, [roleId, permId]);
        }
      }
      else if (operation === 'remove') {
        // Remove specified permissions
        for (const permId of permissions) {
          await client.query(
            'DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
            [roleId, permId]
          );
        }
      }

      // Log the change
      await auditLogger.logAction({
        businessId,
        userId: updatedBy,
        action: 'role.permissions.updated',
        resourceType: 'role',
        resourceId: roleId,
        newValues: {
          operation,
          permission_count: permissions.length,
          role_name: roleName
        }
      });

      await client.query('COMMIT');

      // Return updated permission count
      const countResult = await client.query(
        'SELECT COUNT(*) as count FROM role_permissions WHERE role_id = $1',
        [roleId]
      );

      return {
        role_id: roleId,
        role_name: roleName,
        permission_count: parseInt(countResult.rows[0].count),
        operation: operation
      };
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Failed to update role permissions:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get user permissions (RBAC + ABAC)
   */
  static async getUserPermissions(businessId, userId) {
    const client = await getClient();
    try {
      // Get user info
      const userResult = await client.query(`
        SELECT u.id, u.email, u.role, u.role_id, r.name as role_name
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.id = $1 AND u.business_id = $2
      `, [userId, businessId]);

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];

      // Get RBAC permissions from role
      const rbacPermissions = await client.query(`
        SELECT 
          p.id, p.name, p.description, p.category,
          'role' as source,
          NULL as expires_at,
          NULL as conditions
        FROM permissions p
        INNER JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id = $1
          AND (p.business_id IS NULL OR p.business_id = $2)
        ORDER BY p.category, p.name
      `, [user.role_id, businessId]);

      // Get ABAC overrides (user_feature_toggles)
      const abacOverrides = await client.query(`
        SELECT 
          p.id, p.name, p.description, p.category,
          'abac' as source,
          uft.expires_at,
          uft.conditions,
          uft.is_allowed,
          uft.granted_at,
          granted_user.email as granted_by_email
        FROM user_feature_toggles uft
        JOIN permissions p ON uft.permission_id = p.id
        LEFT JOIN users granted_user ON uft.granted_by = granted_user.id
        WHERE uft.user_id = $1 
          AND (p.business_id IS NULL OR p.business_id = $2)
          AND (uft.expires_at IS NULL OR uft.expires_at > NOW())
        ORDER BY p.category, p.name
      `, [userId, businessId]);

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          role_name: user.role_name
        },
        rbac_permissions: rbacPermissions.rows,
        abac_overrides: abacOverrides.rows,
        summary: {
          rbac_count: rbacPermissions.rows.length,
          abac_count: abacOverrides.rows.length
        }
      };
    } catch (error) {
      log.error('Failed to fetch user permissions:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add user permission override (ABAC)
   */
  static async addUserPermissionOverride(businessId, userId, permissionData, grantedBy) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      // Validate user exists in business
      const userCheck = await client.query(
        'SELECT id FROM users WHERE id = $1 AND business_id = $2',
        [userId, businessId]
      );

      if (userCheck.rows.length === 0) {
        throw new Error('User not found in your business');
      }

      // Validate permission exists and is accessible to this business
      const permCheck = await client.query(
        'SELECT id, name FROM permissions WHERE id = $1 AND (business_id IS NULL OR business_id = $2)',
        [permissionData.permission_id, businessId]
      );

      if (permCheck.rows.length === 0) {
        throw new Error('Permission not found or not accessible');
      }

      const permissionName = permCheck.rows[0].name;

      // Check if override already exists
      const existingCheck = await client.query(
        'SELECT id FROM user_feature_toggles WHERE user_id = $1 AND permission_id = $2',
        [userId, permissionData.permission_id]
      );

      if (existingCheck.rows.length > 0) {
        // Update existing
        await client.query(`
          UPDATE user_feature_toggles 
          SET 
            is_allowed = $1,
            conditions = $2,
            expires_at = $3,
            granted_by = $4,
            granted_at = NOW()
          WHERE user_id = $5 AND permission_id = $6
        `, [
          permissionData.value,
          permissionData.conditions || null,
          permissionData.expires_at || null,
          grantedBy,
          userId,
          permissionData.permission_id
        ]);
      } else {
        // Create new
        await client.query(`
          INSERT INTO user_feature_toggles (
            id, user_id, permission_id, is_allowed, 
            conditions, granted_by, granted_at, expires_at
          ) VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NOW(), $6)
        `, [
          userId,
          permissionData.permission_id,
          permissionData.value,
          permissionData.conditions || null,
          grantedBy,
          permissionData.expires_at || null
        ]);
      }

      // Log the change
      await auditLogger.logAction({
        businessId,
        userId: grantedBy,
        action: 'user.permission.override',
        resourceType: 'user',
        resourceId: userId,
        newValues: {
          permission_id: permissionData.permission_id,
          permission_name: permissionName,
          is_allowed: permissionData.value,
          conditions: permissionData.conditions,
          expires_at: permissionData.expires_at
        }
      });

      await client.query('COMMIT');

      return {
        user_id: userId,
        permission_id: permissionData.permission_id,
        permission_name: permissionName,
        is_allowed: permissionData.value,
        conditions: permissionData.conditions,
        expires_at: permissionData.expires_at,
        granted_by: grantedBy,
        granted_at: new Date()
      };
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Failed to add user permission override:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Remove user permission override (ABAC)
   */
  static async removeUserPermissionOverride(businessId, userId, permissionId, removedBy) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      // Get permission info before deleting
      const permInfo = await client.query(
        'SELECT name FROM permissions WHERE id = $1',
        [permissionId]
      );

      const permissionName = permInfo.rows[0]?.name || permissionId;

      // Delete the override
      const result = await client.query(`
        DELETE FROM user_feature_toggles 
        WHERE user_id = $1 AND permission_id = $2
        RETURNING id
      `, [userId, permissionId]);

      if (result.rows.length === 0) {
        throw new Error('Permission override not found');
      }

      // Log the change
      await auditLogger.logAction({
        businessId,
        userId: removedBy,
        action: 'user.permission.override.removed',
        resourceType: 'user',
        resourceId: userId,
        oldValues: {
          permission_id: permissionId,
          permission_name: permissionName
        }
      });

      await client.query('COMMIT');

      return {
        user_id: userId,
        permission_id: permissionId,
        permission_name: permissionName,
        removed_by: removedBy,
        removed_at: new Date()
      };
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Failed to remove user permission override:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Evaluate permission for user (RBAC + ABAC + Business Rules)
   */
  static async evaluatePermission(businessId, userId, permissionName, context = {}) {
    const client = await getClient();
    
    try {
      // Get user role first
      const userResult = await client.query(`
        SELECT u.role, u.role_id 
        FROM users u 
        WHERE u.id = $1 AND u.business_id = $2
      `, [userId, businessId]);

      if (userResult.rows.length === 0) {
        return { allowed: false, reason: 'User not found' };
      }

      const user = userResult.rows[0];

      // Check RBAC first
      const rbacCheck = await client.query(`
        SELECT 1
        FROM permissions p
        INNER JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id = $1 
          AND p.name = $2
          AND (p.business_id IS NULL OR p.business_id = $3)
        LIMIT 1
      `, [user.role_id, permissionName, businessId]);

      let allowed = rbacCheck.rows.length > 0;
      let source = allowed ? 'rbac' : null;

      // Check ABAC overrides
      const abacCheck = await client.query(`
        SELECT is_allowed, conditions, expires_at
        FROM user_feature_toggles uft
        JOIN permissions p ON uft.permission_id = p.id
        WHERE uft.user_id = $1 
          AND p.name = $2
          AND (p.business_id IS NULL OR p.business_id = $3)
          AND (uft.expires_at IS NULL OR uft.expires_at > NOW())
        LIMIT 1
      `, [userId, permissionName, businessId]);

      if (abacCheck.rows.length > 0) {
        const override = abacCheck.rows[0];
        
        // Check if expired
        if (override.expires_at && new Date(override.expires_at) < new Date()) {
          // Permission expired, fall back to RBAC
          source = allowed ? 'rbac' : null;
        } else {
          // Apply ABAC override
          allowed = override.is_allowed;
          source = 'abac';
          
          // Apply business rules from conditions
          if (override.conditions) {
            const conditions = override.conditions;
            
            // Time-based condition
            if (conditions.valid_times) {
              const now = new Date();
              const currentTime = now.getHours() * 60 + now.getMinutes();
              
              if (conditions.valid_times.start && conditions.valid_times.end) {
                const [startHour, startMin] = conditions.valid_times.start.split(':').map(Number);
                const [endHour, endMin] = conditions.valid_times.end.split(':').map(Number);
                
                const startTime = startHour * 60 + startMin;
                const endTime = endHour * 60 + endMin;
                
                if (currentTime < startTime || currentTime > endTime) {
                  allowed = false;
                  source = 'abac_condition_failed';
                }
              }
            }
            
            // Day of week condition
            if (conditions.valid_days && conditions.valid_days.length > 0) {
              const today = new Date().getDay(); // 0 = Sunday, 6 = Saturday
              if (!conditions.valid_days.includes(today)) {
                allowed = false;
                source = 'abac_condition_failed';
              }
            }
            
            // Location condition (if context has location)
            if (conditions.valid_locations && context.location) {
              if (!conditions.valid_locations.includes(context.location)) {
                allowed = false;
                source = 'abac_condition_failed';
              }
            }
          }
        }
      }

      // Owner always has all permissions
      if (user.role === 'owner') {
        allowed = true;
        source = 'owner_role';
      }

      return {
        allowed,
        source,
        user_id: userId,
        permission: permissionName,
        context,
        evaluated_at: new Date()
      };
    } catch (error) {
      log.error('Permission evaluation failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get permission audit log
   */
  static async getPermissionAuditLog(businessId, filters = {}) {
    const client = await getClient();
    try {
      let query = `
        SELECT 
          al.id,
          al.action,
          al.resource_type,
          al.resource_id,
          al.user_id,
          u.email as user_email,
          al.old_values,
          al.new_values,
          al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.business_id = $1
          AND (
            al.action LIKE '%permission%' 
            OR al.action LIKE '%role.permission%'
            OR al.resource_type IN ('role', 'permission', 'user_feature_toggle')
          )
      `;

      const params = [businessId];
      let paramCount = 1;

      if (filters.user_id) {
        paramCount++;
        query += ` AND al.user_id = $${paramCount}`;
        params.push(filters.user_id);
      }

      if (filters.action) {
        paramCount++;
        query += ` AND al.action = $${paramCount}`;
        params.push(filters.action);
      }

      if (filters.start_date) {
        paramCount++;
        query += ` AND al.created_at >= $${paramCount}`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        paramCount++;
        query += ` AND al.created_at <= $${paramCount}`;
        params.push(filters.end_date);
      }

      query += ' ORDER BY al.created_at DESC LIMIT 100';

      const result = await client.query(query, params);
      return result.rows;
    } catch (error) {
      log.error('Failed to fetch permission audit log:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all permissions with role assignments
   */
  static async getAllPermissionsWithRoleInfo(businessId, roleId = null) {
    const client = await getClient();
    try {
      let query;
      let params;

      if (roleId) {
        query = `
          SELECT 
            p.id,
            p.name,
            p.description,
            p.category,
            p.action,
            p.resource_type,
            p.created_at,
            CASE WHEN rp.role_id IS NOT NULL THEN true ELSE false END as has_permission,
            r.name as role_name
          FROM permissions p
          LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.role_id = $2
          LEFT JOIN roles r ON rp.role_id = r.id
          WHERE (p.business_id IS NULL OR p.business_id = $1)
            AND (r.id = $2 OR r.id IS NULL)
          ORDER BY p.category, p.name
        `;
        params = [businessId, roleId];
      } else {
        query = `
          SELECT 
            p.id,
            p.name,
            p.description,
            p.category,
            p.action,
            p.resource_type,
            p.created_at,
            false as has_permission,
            NULL as role_name
          FROM permissions p
          WHERE p.business_id IS NULL OR p.business_id = $1
          ORDER BY p.category, p.name
        `;
        params = [businessId];
      }

      const result = await client.query(query, params);
      return result.rows;
    } catch (error) {
      log.error('Failed to fetch permissions with role info:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all roles for business
   */
  static async getBusinessRoles(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(`
        SELECT 
          r.id,
          r.name,
          r.description,
          r.is_system_role,
          r.created_at,
          COUNT(rp.permission_id) as permission_count
        FROM roles r
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        WHERE r.business_id = $1
        GROUP BY r.id, r.name, r.description, r.is_system_role, r.created_at
        ORDER BY 
          CASE r.name
            WHEN 'owner' THEN 1
            WHEN 'manager' THEN 2
            WHEN 'supervisor' THEN 3
            WHEN 'staff' THEN 4
            ELSE 5
          END
      `, [businessId]);

      return result.rows;
    } catch (error) {
      log.error('Failed to fetch business roles:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }
}
