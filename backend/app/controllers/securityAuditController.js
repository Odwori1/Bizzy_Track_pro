import { SecurityAuditService } from '../services/securityAuditService.js';
import { log } from '../utils/logger.js';

export class SecurityAuditController {

  static async runPermissionAudit(req, res) {
    try {
      const { businessId, userId } = req.user;

      log.info('Running permission audit', { businessId, userId });

      const audit = await SecurityAuditService.runPermissionAudit(businessId, userId);

      res.json({
        success: true,
        message: 'Permission audit completed successfully',
        data: audit
      });
    } catch (error) {
      log.error('Error running permission audit', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Failed to run security audit: ' + error.message
      });
    }
  }

  static async createComplianceFramework(req, res) {
    try {
      const { businessId, userId } = req.user;
      const frameworkData = req.body;

      log.info('Creating compliance framework', { businessId, frameworkName: frameworkData.framework_name });

      const framework = await SecurityAuditService.createComplianceFramework(businessId, frameworkData, userId);

      res.status(201).json({
        success: true,
        message: 'Compliance framework created successfully',
        data: framework
      });
    } catch (error) {
      log.error('Error creating compliance framework', { error: error.message });
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  static async getSecurityScans(req, res) {
    try {
      const { businessId } = req.user;
      const filters = req.query;

      log.info('Fetching security scans', { businessId, filters });

      const scans = await SecurityAuditService.getSecurityScans(businessId, filters);

      res.json({
        success: true,
        data: scans
      });
    } catch (error) {
      log.error('Error fetching security scans', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch security scans'
      });
    }
  }

  static async getComplianceFrameworks(req, res) {
    try {
      const { businessId } = req.user;

      log.info('Fetching compliance frameworks', { businessId });

      const frameworks = await SecurityAuditService.getComplianceFrameworks(businessId);

      res.json({
        success: true,
        data: frameworks
      });
    } catch (error) {
      log.error('Error fetching compliance frameworks', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch compliance frameworks'
      });
    }
  }

  // NEW CONTROLLER METHODS FOR WEEK 16 COMPLETION
  static async getSecurityMetrics(req, res) {
    try {
      const { businessId } = req.user;

      log.info('Collecting security metrics', { businessId });

      const metrics = await SecurityAuditService.collectSecurityMetrics(businessId);

      res.json({
        success: true,
        message: 'Security metrics retrieved successfully',
        data: metrics
      });
    } catch (error) {
      log.error('Error collecting security metrics', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Failed to collect security metrics: ' + error.message
      });
    }
  }

  static async verifyAuditTrail(req, res) {
    try {
      const { businessId } = req.user;

      log.info('Verifying audit trail', { businessId });

      const verification = await SecurityAuditService.verifyAuditTrail(businessId);

      res.json({
        success: true,
        message: 'Audit trail verification completed',
        data: verification
      });
    } catch (error) {
      log.error('Error verifying audit trail', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Failed to verify audit trail: ' + error.message
      });
    }
  }

  static async logComplianceEvent(req, res) {
    try {
      const { businessId, userId } = req.user;
      const { action, details } = req.body;

      if (!action || !details) {
        return res.status(400).json({
          success: false,
          message: 'Action and details are required'
        });
      }

      log.info('Logging compliance event', { businessId, action });

      const auditLog = await SecurityAuditService.logComplianceAudit(businessId, userId, action, details);

      res.status(201).json({
        success: true,
        message: 'Compliance event logged successfully',
        data: auditLog
      });
    } catch (error) {
      log.error('Error logging compliance event', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Failed to log compliance event: ' + error.message
      });
    }
  }

  static async getSecurityAnalytics(req, res) {
    try {
      const { businessId } = req.user;
      const { period = '7 days' } = req.query;

      log.info('Generating security analytics', { businessId, period });

      const analytics = await SecurityAuditService.getSecurityAnalytics(businessId, period);

      res.json({
        success: true,
        message: 'Security analytics generated successfully',
        data: analytics
      });
    } catch (error) {
      log.error('Error generating security analytics', { error: error.message });
      res.status(500).json({
        success: false,
        message: 'Failed to generate security analytics: ' + error.message
      });
    }
  }
}
