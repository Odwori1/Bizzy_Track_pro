import { query } from '../utils/database.js';
import { log } from '../utils/logger.js';

// Basic permission check (RBAC + ABAC)
export const requirePermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // For owner role, grant all permissions by default (OPTIMIZATION)
      if (req.user.role === 'owner') {
        log.debug('Permission granted for owner', {
          userId: req.user.userId,
          permission: permissionName
        });
        return next();
      }

      // FIXED: Permission query that checks both RBAC AND ABAC grants
      const permissionCheckQuery = `
        -- Check if user has permission via either RBAC or ABAC
        SELECT 1
        FROM permissions p
        WHERE p.name = $2
          AND (
            -- Option 1: RBAC permission (via role) WITHOUT ABAC denial
            EXISTS (
              SELECT 1
              FROM role_permissions rp
              INNER JOIN users u ON rp.role_id = u.role_id
              WHERE rp.permission_id = p.id
                AND u.id = $1
                AND u.business_id = $3
                -- Check for negative ABAC overrides (denials)
                AND NOT EXISTS (
                  SELECT 1 FROM user_feature_toggles uft
                  WHERE uft.permission_id = p.id
                    AND uft.user_id = u.id
                    AND uft.is_allowed = false
                    AND (uft.expires_at IS NULL OR uft.expires_at > NOW())
                )
            )
            OR
            -- Option 2: ABAC override that POSITIVELY GRANTS permission
            EXISTS (
              SELECT 1
              FROM user_feature_toggles uft
              INNER JOIN users u ON uft.user_id = u.id
              WHERE uft.permission_id = p.id
                AND uft.user_id = $1
                AND uft.is_allowed = true
                AND (uft.expires_at IS NULL OR uft.expires_at > NOW())
                AND u.business_id = $3
            )
          )
        LIMIT 1
      `;

      const result = await query(permissionCheckQuery, [
        req.user.userId,
        permissionName,
        req.user.businessId
      ]);

      if (result.rows.length === 0) {
        log.warn('Permission denied', {
          userId: req.user.userId,
          permission: permissionName,
          path: req.path,
          userRole: req.user.role
        });

        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          required: permissionName
        });
      }

      log.debug('Permission granted', {
        userId: req.user.userId,
        permission: permissionName,
        source: result.rows[0].source || 'rbac/abac'
      });

      next();
    } catch (error) {
      log.error('Permission check failed', error);

      // On timeout or database error, allow for owner role as fallback
      if (req.user.role === 'owner') {
        log.warn('Database error in permission check, allowing owner as fallback', {
          userId: req.user.userId,
          permissionName
        });
        return next();
      }

      return res.status(500).json({
        success: false,
        error: 'Permission verification failed'
      });
    }
  };
};

// Enhanced permission check with ABAC support
export const requirePermissionWithContext = (permissionName, contextExtractor = null) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Extract context if provided
      const context = contextExtractor ? contextExtractor(req) : {};

      // For owner role, grant all permissions by default
      if (req.user.role === 'owner') {
        log.debug('ABAC permission granted for owner', {
          userId: req.user.userId,
          permission: permissionName,
          context
        });
        return next();
      }

      // Check for user-specific feature toggles first (ABAC)
      // Note: This requires userFeatureToggleService to be imported
      let userToggleCheck = null;
      try {
        // Dynamic import to avoid circular dependency
        const { userFeatureToggleService } = await import('../services/userFeatureToggleService.js');
        userToggleCheck = await userFeatureToggleService.checkUserPermissionWithConditions(
          req.user.userId,
          permissionName,
          context
        );
      } catch (importError) {
        log.debug('User feature toggle service not available, falling back to RBAC');
      }

      // If user has a specific toggle, use that
      if (userToggleCheck !== null) {
        if (userToggleCheck.is_allowed) {
          log.debug('ABAC permission granted', {
            userId: req.user.userId,
            permission: permissionName,
            context
          });
          return next();
        } else {
          log.warn('ABAC permission denied', {
            userId: req.user.userId,
            permission: permissionName,
            reason: userToggleCheck.reason,
            context
          });
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions',
            required: permissionName,
            reason: userToggleCheck.reason
          });
        }
      }

      // Fall back to RBAC+ABAC check (using the FIXED query)
      const permissionCheckQuery = `
        -- Check if user has permission via either RBAC or ABAC
        SELECT 1
        FROM permissions p
        WHERE p.name = $2
          AND (
            -- Option 1: RBAC permission (via role) WITHOUT ABAC denial
            EXISTS (
              SELECT 1
              FROM role_permissions rp
              INNER JOIN users u ON rp.role_id = u.role_id
              WHERE rp.permission_id = p.id
                AND u.id = $1
                AND u.business_id = $3
                -- Check for negative ABAC overrides (denials)
                AND NOT EXISTS (
                  SELECT 1 FROM user_feature_toggles uft
                  WHERE uft.permission_id = p.id
                    AND uft.user_id = u.id
                    AND uft.is_allowed = false
                    AND (uft.expires_at IS NULL OR uft.expires_at > NOW())
                )
            )
            OR
            -- Option 2: ABAC override that POSITIVELY GRANTS permission
            EXISTS (
              SELECT 1
              FROM user_feature_toggles uft
              INNER JOIN users u ON uft.user_id = u.id
              WHERE uft.permission_id = p.id
                AND uft.user_id = $1
                AND uft.is_allowed = true
                AND (uft.expires_at IS NULL OR uft.expires_at > NOW())
                AND u.business_id = $3
            )
          )
        LIMIT 1
      `;

      const result = await query(permissionCheckQuery, [
        req.user.userId,
        permissionName,
        req.user.businessId
      ]);

      if (result.rows.length === 0) {
        log.warn('RBAC permission denied', {
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

      log.debug('RBAC permission granted', {
        userId: req.user.userId,
        permission: permissionName
      });

      next();
    } catch (error) {
      log.error('Enhanced permission check failed', error);

      // On timeout or database error, allow for owner role as fallback
      if (req.user.role === 'owner') {
        log.warn('Database error in enhanced permission check, allowing owner as fallback', {
          userId: req.user.userId,
          permissionName
        });
        return next();
      }

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
