import { query } from './database.js';
import { log } from './logger.js';

export const auditLogger = {
  async logAction({
    businessId,
    userId,
    action,
    resourceType,
    resourceId = null,
    oldValues = null,
    newValues = null,
    ipAddress = null,
    userAgent = null,
    metadata = null
  }) {
    try {
      const auditQuery = `
        INSERT INTO audit_logs (
          business_id, user_id, action, resource_type, resource_id,
          old_values, new_values, ip_address, user_agent, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;

      await query(auditQuery, [
        businessId,
        userId,
        action,
        resourceType,
        resourceId,
        oldValues,
        newValues,
        ipAddress,
        userAgent,
        metadata
      ]);

      log.info('Audit log recorded', { action, resourceType, userId });
    } catch (error) {
      log.error('Audit logging failed', error);
      // Don't throw - audit failures shouldn't break the main functionality
    }
  },

  // Convenience methods for common actions
  async logCreate(req, resourceType, resourceId, newValues) {
    return this.logAction({
      businessId: req.user.businessId,
      userId: req.user.userId,
      action: `${resourceType}.created`,
      resourceType,
      resourceId,
      newValues,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
  },

  async logUpdate(req, resourceType, resourceId, oldValues, newValues) {
    return this.logAction({
      businessId: req.user.businessId,
      userId: req.user.userId,
      action: `${resourceType}.updated`,
      resourceType,
      resourceId,
      oldValues,
      newValues,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
  },

  async logDelete(req, resourceType, resourceId, oldValues) {
    return this.logAction({
      businessId: req.user.businessId,
      userId: req.user.userId,
      action: `${resourceType}.deleted`,
      resourceType,
      resourceId,
      oldValues,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
  }
};
