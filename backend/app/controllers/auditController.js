import { auditService } from '../services/auditService.js';
import { log } from '../utils/logger.js';

export const auditController = {
  /**
   * Search audit logs with filtering and pagination
   */
  async searchAuditLogs(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const userRole = req.user.role;
      
      // Extract query parameters with defaults
      const {
        page = 1,
        limit = 50,
        action = null,
        resource_type = null,
        user_id = null,
        start_date = null,
        end_date = null,
        search = null
      } = req.query;

      log.info('Searching audit logs', {
        businessId,
        userId,
        userRole,
        filters: { page, limit, action, resource_type, user_id, start_date, end_date, search }
      });

      // Validate user has permission to view audit logs
      if (userRole !== 'owner' && userRole !== 'manager') {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions to view audit logs'
        });
      }

      const searchOptions = {
        page: parseInt(page),
        limit: parseInt(limit),
        action,
        resource_type,
        user_id,
        start_date,
        end_date,
        search
      };

      const auditLogs = await auditService.searchAuditLogs(businessId, searchOptions);

      res.json({
        success: true,
        data: auditLogs.logs,
        pagination: {
          page: auditLogs.page,
          limit: auditLogs.limit,
          total: auditLogs.total,
          totalPages: auditLogs.totalPages
        },
        filters: searchOptions
      });

    } catch (error) {
      log.error('Audit log search controller error', error);
      next(error);
    }
  },

  /**
   * Get audit log summary statistics
   */
  async getAuditSummary(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const { period = '7d' } = req.query; // 7d, 30d, 90d

      log.info('Getting audit summary', {
        businessId,
        userId,
        userRole,
        period
      });

      // Validate user has permission to view audit logs
      if (userRole !== 'owner' && userRole !== 'manager') {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions to view audit logs'
        });
      }

      const summary = await auditService.getAuditSummary(businessId, period);

      res.json({
        success: true,
        data: summary,
        period
      });

    } catch (error) {
      log.error('Audit summary controller error', error);
      next(error);
    }
  },

  /**
   * Get specific audit log by ID
   */
  async getAuditLogById(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const userRole = req.user.role;
      const { id } = req.params;

      log.info('Getting audit log by ID', {
        businessId,
        userId,
        userRole,
        auditLogId: id
      });

      // Validate user has permission to view audit logs
      if (userRole !== 'owner' && userRole !== 'manager') {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions to view audit logs'
        });
      }

      const auditLog = await auditService.getAuditLogById(id, businessId);

      if (!auditLog) {
        return res.status(404).json({
          success: false,
          error: 'Audit log not found'
        });
      }

      res.json({
        success: true,
        data: auditLog
      });

    } catch (error) {
      log.error('Audit log by ID controller error', error);
      next(error);
    }
  },

  /**
   * Get recent audit activity for dashboard
   */
  async getRecentActivity(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { limit = 10 } = req.query;

      log.info('Getting recent audit activity', {
        businessId,
        limit
      });

      const recentActivity = await auditService.getRecentActivity(businessId, parseInt(limit));

      res.json({
        success: true,
        data: recentActivity,
        count: recentActivity.length
      });

    } catch (error) {
      log.error('Recent activity controller error', error);
      next(error);
    }
  }
};
