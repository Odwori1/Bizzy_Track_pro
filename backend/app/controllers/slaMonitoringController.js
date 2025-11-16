import { SLAMonitoringService } from '../services/slaMonitoringService.js';
import { log } from '../utils/logger.js';

export class SLAMonitoringController {
  
  // Check for SLA violations
  static async checkSLAViolations(req, res) {
    try {
      const businessId = req.user.businessId;
      
      log.info('Checking SLA violations', { businessId });
      
      const violations = await SLAMonitoringService.checkSLAViolations(businessId);
      
      res.json({
        success: true,
        message: `Found ${violations.length} SLA violations`,
        data: violations
      });
      
    } catch (error) {
      log.error('Error checking SLA violations', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to check SLA violations',
        error: error.message
      });
    }
  }
  
  // Get SLA violation statistics
  static async getSLAViolationStats(req, res) {
    try {
      const businessId = req.user.businessId;
      const { period } = req.query;
      
      log.info('Fetching SLA violation statistics', { businessId, period });
      
      const stats = await SLAMonitoringService.getSLAViolationStats(businessId, period);
      
      res.json({
        success: true,
        data: stats,
        count: stats.length
      });
      
    } catch (error) {
      log.error('Error fetching SLA violation statistics', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch SLA violation statistics',
        error: error.message
      });
    }
  }
  
  // Escalate SLA violation
  static async escalateViolation(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { violationId } = req.params;
      const escalationData = req.body;
      
      log.info('Escalating SLA violation', { businessId, userId, violationId, escalationData });
      
      const violation = await SLAMonitoringService.escalateViolation(businessId, violationId, escalationData, userId);
      
      res.json({
        success: true,
        message: 'SLA violation escalated successfully',
        data: violation
      });
      
    } catch (error) {
      log.error('Error escalating SLA violation', { error: error.message, businessId: req.user.businessId, violationId: req.params.violationId });
      res.status(500).json({
        success: false,
        message: 'Failed to escalate SLA violation',
        error: error.message
      });
    }
  }
  
  // Get active SLA violations
  static async getActiveViolations(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;
      
      log.info('Fetching active SLA violations', { businessId, filters });
      
      const violations = await SLAMonitoringService.getActiveViolations(businessId, filters);
      
      res.json({
        success: true,
        data: violations,
        count: violations.length
      });
      
    } catch (error) {
      log.error('Error fetching active SLA violations', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch active SLA violations',
        error: error.message
      });
    }
  }
}
