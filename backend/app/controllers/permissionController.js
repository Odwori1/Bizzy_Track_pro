import { PermissionService } from '../services/permissionService.js';
import { log } from '../utils/logger.js';

export const permissionController = {
  
  /**
   * Get all permission categories
   */
  async getCategories(req, res, next) {
    try {
      const businessId = req.user.businessId;
      
      log.info('Fetching permission categories', { businessId });
      
      const categories = await PermissionService.getPermissionCategories(businessId);
      
      res.json({
        success: true,
        data: categories,
        count: categories.length,
        message: 'Permission categories fetched successfully'
      });
    } catch (error) {
      log.error('Permission categories fetch error:', error);
      next(error);
    }
  },

  /**
   * Get permissions by category
   */
  async getPermissionsByCategory(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { category } = req.params;
      
      log.info('Fetching permissions by category', { businessId, category });
      
      const permissions = await PermissionService.getPermissionsByCategory(businessId, category);
      
      res.json({
        success: true,
        data: permissions,
        count: permissions.length,
        message: `Permissions for category ${category} fetched successfully`
      });
    } catch (error) {
      log.error('Permissions by category fetch error:', error);
      next(error);
    }
  },

  /**
   * Get role permissions
   */
  async getRolePermissions(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { roleId } = req.params;
      
      log.info('Fetching role permissions', { businessId, roleId });
      
      const permissions = await PermissionService.getRolePermissions(businessId, roleId);
      
      res.json({
        success: true,
        data: permissions,
        count: permissions.length,
        message: 'Role permissions fetched successfully'
      });
    } catch (error) {
      log.error('Role permissions fetch error:', error);
      next(error);
    }
  },

  /**
   * Update role permissions
   */
  async updateRolePermissions(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { roleId } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      
      log.info('Updating role permissions', { 
        businessId, 
        roleId, 
        userId,
        operation: updateData.operation 
      });
      
      const result = await PermissionService.updateRolePermissions(
        businessId, 
        roleId, 
        updateData, 
        userId
      );
      
      res.json({
        success: true,
        data: result,
        message: 'Role permissions updated successfully'
      });
    } catch (error) {
      log.error('Role permissions update error:', error);
      next(error);
    }
  },

  /**
   * Get user permissions (RBAC + ABAC)
   */
  async getUserPermissions(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { userId } = req.params;
      
      log.info('Fetching user permissions', { businessId, targetUserId: userId });
      
      const permissions = await PermissionService.getUserPermissions(businessId, userId);
      
      res.json({
        success: true,
        data: permissions,
        message: 'User permissions fetched successfully'
      });
    } catch (error) {
      log.error('User permissions fetch error:', error);
      next(error);
    }
  },

  /**
   * Add user permission override (ABAC)
   */
  async addUserPermissionOverride(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { userId } = req.params;
      const permissionData = req.body;
      const grantedBy = req.user.userId;
      
      log.info('Adding user permission override', { 
        businessId, 
        targetUserId: userId,
        grantedBy,
        permissionId: permissionData.permission_id
      });
      
      const result = await PermissionService.addUserPermissionOverride(
        businessId, 
        userId, 
        permissionData, 
        grantedBy
      );
      
      res.status(201).json({
        success: true,
        data: result,
        message: 'User permission override added successfully'
      });
    } catch (error) {
      log.error('User permission override add error:', error);
      next(error);
    }
  },

  /**
   * Remove user permission override (ABAC)
   */
  async removeUserPermissionOverride(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { userId, permissionId } = req.params;
      const removedBy = req.user.userId;
      
      log.info('Removing user permission override', { 
        businessId, 
        targetUserId: userId,
        removedBy,
        permissionId
      });
      
      const result = await PermissionService.removeUserPermissionOverride(
        businessId, 
        userId, 
        permissionId, 
        removedBy
      );
      
      res.json({
        success: true,
        data: result,
        message: 'User permission override removed successfully'
      });
    } catch (error) {
      log.error('User permission override remove error:', error);
      next(error);
    }
  },

  /**
   * Evaluate permission for user
   */
  async evaluatePermission(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { userId, permissionName } = req.params;
      const context = req.body.context || {};
      
      log.info('Evaluating permission', { 
        businessId, 
        userId,
        permissionName,
        context
      });
      
      const result = await PermissionService.evaluatePermission(
        businessId, 
        userId, 
        permissionName, 
        context
      );
      
      res.json({
        success: true,
        data: result,
        message: 'Permission evaluation completed'
      });
    } catch (error) {
      log.error('Permission evaluation error:', error);
      next(error);
    }
  },

  /**
   * Get permission audit log
   */
  async getPermissionAuditLog(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;
      
      log.info('Fetching permission audit log', { businessId, filters });
      
      const auditLog = await PermissionService.getPermissionAuditLog(businessId, filters);
      
      res.json({
        success: true,
        data: auditLog,
        count: auditLog.length,
        message: 'Permission audit log fetched successfully'
      });
    } catch (error) {
      log.error('Permission audit log fetch error:', error);
      next(error);
    }
  },

  /**
   * Get all permissions with role info
   */
  async getAllPermissions(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { roleId } = req.query;
      
      log.info('Fetching all permissions with role info', { businessId, roleId });
      
      const permissions = await PermissionService.getAllPermissionsWithRoleInfo(businessId, roleId);
      
      res.json({
        success: true,
        data: permissions,
        count: permissions.length,
        message: 'All permissions fetched successfully'
      });
    } catch (error) {
      log.error('All permissions fetch error:', error);
      next(error);
    }
  },

  /**
   * Get all roles for business
   */
  async getBusinessRoles(req, res, next) {
    try {
      const businessId = req.user.businessId;
      
      log.info('Fetching business roles', { businessId });
      
      const roles = await PermissionService.getBusinessRoles(businessId);
      
      res.json({
        success: true,
        data: roles,
        count: roles.length,
        message: 'Business roles fetched successfully'
      });
    } catch (error) {
      log.error('Business roles fetch error:', error);
      next(error);
    }
  }
};
