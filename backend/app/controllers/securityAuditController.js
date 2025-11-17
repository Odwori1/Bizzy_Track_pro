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
        message: 'Failed to run security audit'
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
}
