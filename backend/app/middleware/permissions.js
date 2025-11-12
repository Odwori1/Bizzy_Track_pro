import { query } from '../utils/database.js';
import { log } from '../utils/logger.js';

export const requirePermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Check if user has the required permission via role or direct grant
      const permissionCheckQuery = `
        SELECT 
          p.name,
          p.category,
          p.resource_type,
          p.action
        FROM permissions p
        LEFT JOIN role_permissions rp ON p.id = rp.permission_id
        LEFT JOIN roles r ON rp.role_id = r.id
        LEFT JOIN users u ON u.role = r.name AND u.business_id = r.business_id
        LEFT JOIN user_feature_toggles uft ON p.id = uft.permission_id AND uft.user_id = $1
        WHERE u.id = $2 
          AND p.name = $3
          AND u.business_id = $4
          AND (
            (uft.is_allowed = true AND (uft.expires_at IS NULL OR uft.expires_at > NOW()))
            OR uft.id IS NULL
          )
        LIMIT 1
      `;

      const result = await query(permissionCheckQuery, [
        req.user.userId,
        req.user.userId, 
        permissionName,
        req.user.businessId
      ]);

      if (result.rows.length === 0) {
        log.warn('Permission denied', {
          userId: req.user.userId,
          permission: permissionName,
          path: req.path
        });

        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          required: permissionName
        });
      }

      log.debug('Permission granted', {
        userId: req.user.userId,
        permission: permissionName
      });

      next();
    } catch (error) {
      log.error('Permission check failed', error);
      return res.status(500).json({
        success: false,
        error: 'Permission verification failed'
      });
    }
  };
};

// Convenience middleware for common permissions
export const requireCustomerRead = requirePermission('customer:read');
export const requireCustomerWrite = requirePermission('customer:create');
export const requireServiceRead = requirePermission('service:read');
export const requireServiceWrite = requirePermission('service:create');
