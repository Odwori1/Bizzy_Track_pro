import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

export const userFeatureToggleService = {
  async createUserFeatureToggle(toggleData, grantedByUserId, businessId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify user belongs to the same business
      const userCheckQuery = `
        SELECT id FROM users 
        WHERE id = $1 AND business_id = $2
      `;
      const userCheckResult = await client.query(userCheckQuery, [toggleData.user_id, businessId]);
      
      if (userCheckResult.rows.length === 0) {
        throw new Error('User not found in business');
      }

      // Verify permission belongs to the same business
      const permissionCheckQuery = `
        SELECT id FROM permissions 
        WHERE id = $1 AND business_id = $2
      `;
      const permissionCheckResult = await client.query(permissionCheckQuery, [toggleData.permission_id, businessId]);
      
      if (permissionCheckResult.rows.length === 0) {
        throw new Error('Permission not found in business');
      }

      const createQuery = `
        INSERT INTO user_feature_toggles (
          user_id, permission_id, is_allowed, conditions, granted_by, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [
        toggleData.user_id,
        toggleData.permission_id,
        toggleData.is_allowed !== undefined ? toggleData.is_allowed : false,
        toggleData.conditions || null,
        grantedByUserId,
        toggleData.expires_at || null
      ];

      const result = await client.query(createQuery, values);
      const newToggle = result.rows[0];

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId: grantedByUserId,
        action: 'user_feature_toggle.created',
        resourceType: 'user_feature_toggle',
        resourceId: newToggle.id,
        newValues: newToggle
      });

      await client.query('COMMIT');

      log.info('User feature toggle created', {
        toggleId: newToggle.id,
        userId: toggleData.user_id,
        permissionId: toggleData.permission_id,
        businessId,
        grantedBy: grantedByUserId
      });

      return newToggle;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('User feature toggle creation failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getUserFeatureToggles(userId, businessId) {
    try {
      const selectQuery = `
        SELECT 
          uft.*,
          p.name as permission_name,
          p.category as permission_category,
          p.description as permission_description,
          u.email as user_email,
          u.full_name as user_name,
          g.email as granted_by_email
        FROM user_feature_toggles uft
        JOIN permissions p ON uft.permission_id = p.id
        JOIN users u ON uft.user_id = u.id
        LEFT JOIN users g ON uft.granted_by = g.id
        WHERE uft.user_id = $1 AND u.business_id = $2
        ORDER BY uft.granted_at DESC
      `;

      const result = await query(selectQuery, [userId, businessId]);

      log.debug('Fetched user feature toggles', {
        userId,
        businessId,
        count: result.rows.length
      });

      return result.rows;
    } catch (error) {
      log.error('Failed to fetch user feature toggles', error);
      throw error;
    }
  },

  async updateUserFeatureToggle(toggleId, updateData, userId, businessId) {
    const client = await getClient();

    try {
      // First get the current values for audit logging
      const currentToggleQuery = `
        SELECT uft.*, u.business_id
        FROM user_feature_toggles uft
        JOIN users u ON uft.user_id = u.id
        WHERE uft.id = $1 AND u.business_id = $2
      `;
      const currentResult = await client.query(currentToggleQuery, [toggleId, businessId]);
      
      if (currentResult.rows.length === 0) {
        throw new Error('User feature toggle not found');
      }

      const currentToggle = currentResult.rows[0];

      await client.query('BEGIN');

      const updateFields = [];
      const values = [];
      let paramCount = 1;

      // Build dynamic update query
      if (updateData.is_allowed !== undefined) {
        updateFields.push(`is_allowed = $${paramCount}`);
        values.push(updateData.is_allowed);
        paramCount++;
      }

      if (updateData.conditions !== undefined) {
        updateFields.push(`conditions = $${paramCount}`);
        values.push(updateData.conditions);
        paramCount++;
      }

      if (updateData.expires_at !== undefined) {
        updateFields.push(`expires_at = $${paramCount}`);
        values.push(updateData.expires_at);
        paramCount++;
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      values.push(toggleId);

      const updateQuery = `
        UPDATE user_feature_toggles
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await client.query(updateQuery, values);
      const updatedToggle = result.rows[0];

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'user_feature_toggle.updated',
        resourceType: 'user_feature_toggle',
        resourceId: toggleId,
        oldValues: currentToggle,
        newValues: updatedToggle
      });

      await client.query('COMMIT');

      log.info('User feature toggle updated', {
        toggleId,
        userId,
        businessId
      });

      return updatedToggle;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('User feature toggle update failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async deleteUserFeatureToggle(toggleId, userId, businessId) {
    const client = await getClient();

    try {
      // First get the current values for audit logging
      const currentToggleQuery = `
        SELECT uft.*, u.business_id
        FROM user_feature_toggles uft
        JOIN users u ON uft.user_id = u.id
        WHERE uft.id = $1 AND u.business_id = $2
      `;
      const currentResult = await client.query(currentToggleQuery, [toggleId, businessId]);
      
      if (currentResult.rows.length === 0) {
        throw new Error('User feature toggle not found');
      }

      const currentToggle = currentResult.rows[0];

      await client.query('BEGIN');

      const deleteQuery = `
        DELETE FROM user_feature_toggles 
        WHERE id = $1
        RETURNING *
      `;

      const result = await client.query(deleteQuery, [toggleId]);
      const deletedToggle = result.rows[0];

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'user_feature_toggle.deleted',
        resourceType: 'user_feature_toggle',
        resourceId: toggleId,
        oldValues: currentToggle
      });

      await client.query('COMMIT');

      log.info('User feature toggle deleted', {
        toggleId,
        userId,
        businessId
      });

      return deletedToggle;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('User feature toggle deletion failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async checkUserPermissionWithConditions(userId, permissionName, context = {}) {
    try {
      const permissionCheckQuery = `
        SELECT 
          uft.is_allowed,
          uft.conditions,
          uft.expires_at,
          p.name as permission_name
        FROM user_feature_toggles uft
        JOIN permissions p ON uft.permission_id = p.id
        WHERE uft.user_id = $1 
          AND p.name = $2
          AND (uft.expires_at IS NULL OR uft.expires_at > NOW())
        LIMIT 1
      `;

      const result = await query(permissionCheckQuery, [userId, permissionName]);
      
      if (result.rows.length === 0) {
        return null; // No specific toggle for this permission
      }

      const toggle = result.rows[0];
      
      // Apply ABAC conditions if they exist
      if (toggle.conditions) {
        const conditions = toggle.conditions;
        
        // Time restriction check (e.g., "9-17" for business hours)
        if (conditions.time_restriction && context.currentTime) {
          const [startHour, endHour] = conditions.time_restriction.split('-').map(Number);
          const currentHour = new Date(context.currentTime).getHours();
          
          if (currentHour < startHour || currentHour >= endHour) {
            return { is_allowed: false, reason: 'outside_business_hours' };
          }
        }

        // Amount limit check
        if (conditions.amount_limit && context.amount) {
          if (context.amount > conditions.amount_limit) {
            return { is_allowed: false, reason: 'amount_exceeds_limit' };
          }
        }

        // Max discount check
        if (conditions.max_discount && context.discount_amount) {
          if (context.discount_amount > conditions.max_discount) {
            return { is_allowed: false, reason: 'discount_exceeds_limit' };
          }
        }
      }

      return { is_allowed: toggle.is_allowed, conditions: toggle.conditions };

    } catch (error) {
      log.error('User permission condition check failed', error);
      throw error;
    }
  }
};
