import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export class StaffService {
  /**
   * Create a new staff account with optional password
   */
  static async createStaff(businessId, staffData, createdBy) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if user already exists in this business
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1 AND business_id = $2',
        [staffData.email, businessId]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('Staff with this email already exists in your business');
      }

      // =========== CRITICAL FIX: Accept both password and custom_password fields ===========
      // Use provided password (from frontend) or generate random one
      let password = staffData.password || staffData.custom_password;
      let tempPassword = null;

      if (!password) {
        // Generate random password
        tempPassword = crypto.randomBytes(8).toString('hex');
        password = tempPassword;
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // =========== CRITICAL FIX: Get role_id ===========
      // Find role_id from role name if role_id not provided
      let roleId = staffData.role_id;
      const roleName = staffData.role || 'staff';

      if (!roleId && roleName) {
        // Try to find role_id from database
        const roleResult = await client.query(
          'SELECT id FROM roles WHERE business_id = $1 AND name = $2',
          [businessId, roleName.toLowerCase()]
        );

        if (roleResult.rows.length > 0) {
          roleId = roleResult.rows[0].id;
        } else {
          // If role doesn't exist, create it
          log.warn(`Role "${roleName}" not found, creating it...`);
          const newRoleId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
          await client.query(
            `INSERT INTO roles (id, business_id, name, description, is_system_role, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
              newRoleId,
              businessId,
              roleName,
              roleName === 'owner' ? 'Full system access with all permissions' :
              roleName === 'manager' ? 'Management access without business settings' :
              roleName === 'supervisor' ? 'Team supervision role' :
              'Basic operational access',
              true
            ]
          );
          roleId = newRoleId;
        }
      }
      // =========== END CRITICAL FIX ===========

      // Create staff user WITH role_id
      const userResult = await client.query(
        `INSERT INTO users (
          email, password_hash, full_name, phone,
          role, role_id, business_id, department_id,
          is_active, is_staff, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, email, full_name, role, is_active, created_at`,
        [
          staffData.email,
          hashedPassword,
          staffData.full_name,
          staffData.phone || null,
          roleName,
          roleId,
          businessId,
          staffData.department_id || null,
          true,
          true,
          createdBy
        ]
      );

      const user = userResult.rows[0];

      // =========== FIX: Update invitation logic ===========
      // Only create invitation if no password was provided (either password or custom_password)
      let invitationToken = null;
      if (!staffData.password && !staffData.custom_password) {
        invitationToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await client.query(
          `INSERT INTO staff_invitations (
            business_id, user_id, token, token_expiry,
            invited_by, status
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            businessId,
            user.id,
            invitationToken,
            tokenExpiry,
            createdBy,
            'pending'
          ]
        );
      }

      await auditLogger.logAction({
        businessId,
        userId: createdBy,
        action: 'staff.created',
        resourceType: 'staff',
        resourceId: user.id,
        newValues: {
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          role_id: roleId
        }
      });

      await client.query('COMMIT');

      const response = {
        ...user,
        temp_password: tempPassword // Only if generated
      };

      if (invitationToken) {
        response.invitation_token = invitationToken;
      }

      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all staff for a business
   */
  static async getStaff(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT
          u.id, u.email, u.full_name, u.phone, u.role, u.role_id,
          u.department_id, u.is_active, u.last_login_at,
          u.created_at, u.updated_at,
          d.name as department_name,
          si.status as invitation_status
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN staff_invitations si ON u.id = si.user_id AND si.status = 'pending'
        WHERE u.business_id = $1 AND u.is_staff = true
      `;

      const params = [businessId];
      let paramCount = 1;

      if (filters.department_id) {
        paramCount++;
        queryStr += ` AND u.department_id = $${paramCount}`;
        params.push(filters.department_id);
      }

      if (filters.role) {
        paramCount++;
        queryStr += ` AND u.role = $${paramCount}`;
        params.push(filters.role);
      }

      if (filters.is_active !== undefined) {
        paramCount++;
        queryStr += ` AND u.is_active = $${paramCount}`;
        params.push(filters.is_active === 'true');
      }

      queryStr += ' ORDER BY u.created_at DESC';

      const result = await client.query(queryStr, params);
      return result.rows;
    } catch (error) {
      log.error('Staff query failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get staff by ID
   */
  static async getStaffById(businessId, staffId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT
          u.*,
          d.name as department_name,
          si.status as invitation_status
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN staff_invitations si ON u.id = si.user_id
        WHERE u.business_id = $1 AND u.id = $2 AND u.is_staff = true
      `;

      const result = await client.query(queryStr, [businessId, staffId]);

      if (result.rows.length === 0) {
        throw new Error('Staff not found');
      }

      return result.rows[0];
    } catch (error) {
      log.error('Staff details query failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update staff account - SIMPLIFIED VERSION
   */
  static async updateStaff(businessId, staffId, updateData, updatedBy) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify staff exists
      const currentStaff = await client.query(
        'SELECT * FROM users WHERE id = $1 AND business_id = $2 AND is_staff = true',
        [staffId, businessId]
      );

      if (currentStaff.rows.length === 0) {
        throw new Error('Staff not found');
      }

      // Update individual fields
      if (updateData.full_name !== undefined) {
        await client.query(
          'UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2 AND business_id = $3',
          [updateData.full_name, staffId, businessId]
        );
      }

      if (updateData.phone !== undefined) {
        await client.query(
          'UPDATE users SET phone = $1, updated_at = NOW() WHERE id = $2 AND business_id = $3',
          [updateData.phone, staffId, businessId]
        );
      }

      if (updateData.role !== undefined) {
        await client.query(
          'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND business_id = $3',
          [updateData.role, staffId, businessId]
        );
      }

      if (updateData.department_id !== undefined) {
        await client.query(
          'UPDATE users SET department_id = $1, updated_at = NOW() WHERE id = $2 AND business_id = $3',
          [updateData.department_id, staffId, businessId]
        );
      }

      if (updateData.is_active !== undefined) {
        await client.query(
          'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 AND business_id = $3',
          [updateData.is_active, staffId, businessId]
        );
      }

      // Get updated staff
      const result = await client.query(
        'SELECT id, email, full_name, phone, role, department_id, is_active, updated_at FROM users WHERE id = $1 AND business_id = $2',
        [staffId, businessId]
      );

      const updatedStaff = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId: updatedBy,
        action: 'staff.updated',
        resourceType: 'staff',
        resourceId: staffId,
        oldValues: currentStaff.rows[0],
        newValues: updatedStaff
      });

      await client.query('COMMIT');
      return updatedStaff;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete staff (soft delete)
   */
  static async deleteStaff(businessId, staffId, deletedBy) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify staff exists
      const currentStaff = await client.query(
        'SELECT * FROM users WHERE id = $1 AND business_id = $2 AND is_staff = true',
        [staffId, businessId]
      );

      if (currentStaff.rows.length === 0) {
        throw new Error('Staff not found');
      }

      // Soft delete
      const result = await client.query(
        `UPDATE users
         SET is_active = false, deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND business_id = $2
         RETURNING id, email, full_name, is_active, deleted_at`,
        [staffId, businessId]
      );

      const deletedStaff = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId: deletedBy,
        action: 'staff.deleted',
        resourceType: 'staff',
        resourceId: staffId,
        oldValues: currentStaff.rows[0]
      });

      await client.query('COMMIT');
      return deletedStaff;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Invite staff via email
   */
  static async inviteStaff(businessId, inviteData, invitedBy) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if user already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1 AND business_id = $2',
        [inviteData.email, businessId]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('User already exists in your business');
      }

      // Generate random password
      const tempPassword = crypto.randomBytes(8).toString('hex');
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // =========== CRITICAL FIX: Get role_id for invitation ===========
      let roleId = inviteData.role_id;
      const roleName = inviteData.role || 'staff';

      if (!roleId && roleName) {
        const roleResult = await client.query(
          'SELECT id FROM roles WHERE business_id = $1 AND name = $2',
          [businessId, roleName.toLowerCase()]
        );

        if (roleResult.rows.length > 0) {
          roleId = roleResult.rows[0].id;
        }
      }
      // =========== END CRITICAL FIX ===========

      // Create user WITH role_id
      const userResult = await client.query(
        `INSERT INTO users (
          email, password_hash, full_name, role, role_id, business_id,
          is_active, is_staff, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, email, full_name, role`,
        [
          inviteData.email,
          hashedPassword,
          inviteData.full_name || '',
          roleName,
          roleId,
          businessId,
          true,
          true,
          invitedBy
        ]
      );

      const user = userResult.rows[0];

      // Create invitation
      const invitationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await client.query(
        `INSERT INTO staff_invitations (
          business_id, user_id, token, token_expiry, invited_by, status
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          businessId,
          user.id,
          invitationToken,
          tokenExpiry,
          invitedBy,
          'pending'
        ]
      );

      await auditLogger.logAction({
        businessId,
        userId: invitedBy,
        action: 'staff.invited',
        resourceType: 'staff',
        resourceId: user.id,
        newValues: {
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          role_id: roleId
        }
      });

      await client.query('COMMIT');

      // TODO: Send actual email
      const invitationLink = `http://localhost:3003/accept-invitation?token=${invitationToken}`;

      return {
        user_id: user.id,
        invitation_token: invitationToken,
        invitation_link: invitationLink,
        expires_at: tokenExpiry,
        temp_password: tempPassword,
        message: 'Invitation sent successfully'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Staff login - UPDATED: No business_id required, finds by email only
   */
  static async staffLogin(email, password) {
    const client = await getClient();

    try {
      // Find staff user by email only (email should be unique per business)
      const userResult = await client.query(
        `SELECT u.*, b.name as business_name, r.id as role_id
         FROM users u
         JOIN businesses b ON u.business_id = b.id
         LEFT JOIN roles r ON r.business_id = u.business_id AND r.name = u.role
         WHERE u.email = $1
           AND u.is_staff = true
           AND u.is_active = true
           AND u.deleted_at IS NULL`,
        [email]
      );

      if (userResult.rows.length === 0) {
        throw new Error('Invalid email or password');
      }

      const user = userResult.rows[0];

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }

      // Update last login
      await client.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
      );

      // Return user data
      return {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          role_id: user.role_id,
          is_staff: true,
          business_id: user.business_id
        },
        business: {
          id: user.business_id,
          name: user.business_name
        }
      };
    } catch (error) {
      log.error('Staff login failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Resend invitation
   */
  static async resendInvitation(businessId, staffId, userId) {
    const client = await getClient();

    try {
      // Just update the invitation expiry
      const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const newToken = crypto.randomBytes(32).toString('hex');

      await client.query(
        `UPDATE staff_invitations
         SET token = $1, token_expiry = $2, invited_at = NOW()
         WHERE user_id = $3 AND business_id = $4`,
        [newToken, newExpiry, staffId, businessId]
      );

      return {
        new_token: newToken,
        expires_at: newExpiry,
        message: 'Invitation resent successfully'
      };
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Assign role
   */
  static async assignRole(businessId, staffId, roleId, userId) {
    const client = await getClient();

    try {
      await client.query(
        'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND business_id = $3',
        [roleId, staffId, businessId]
      );

      return {
        staff_id: staffId,
        role: roleId,
        assigned_by: userId,
        assigned_at: new Date()
      };
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get staff performance
   */
  static async getStaffPerformance(businessId, staffId, filters) {
    const client = await getClient();

    try {
      // Simple performance metrics
      const result = await client.query(
        `SELECT
          COUNT(*) as total_assignments,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_assignments
         FROM job_department_assignments
         WHERE assigned_to = $1 AND business_id = $2`,
        [staffId, businessId]
      );

      return result.rows[0] || {
        total_assignments: 0,
        completed_assignments: 0
      };
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get staff dashboard
   */
  static async getStaffDashboard(businessId, staffId, filters) {
    return {
      active_assignments: 0,
      completed_today: 0,
      upcoming_deadlines: [],
      recent_activity: []
    };
  }

  /**
   * Get staff roles - FIXED: Return actual UUIDs from database
   */
  static async getStaffRoles(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT id, name, description
         FROM roles
         WHERE business_id = $1
         ORDER BY
           CASE name
             WHEN 'owner' THEN 1
             WHEN 'manager' THEN 2
             WHEN 'supervisor' THEN 3
             WHEN 'staff' THEN 4
             ELSE 5
           END`,
        [businessId]
      );

      return result.rows;
    } catch (error) {
      log.error('Failed to fetch roles:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }
}
