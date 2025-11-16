import { JobRoutingService } from '../services/jobRoutingService.js';
import { validateRequest } from '../middleware/validation.js';
import { log } from '../utils/logger.js';

export class JobRoutingController {
  
  // Create SLA configuration
  static async createSLAConfiguration(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const slaData = req.body;
      
      log.info('Creating SLA configuration', { businessId, userId, slaData: { name: slaData.name } });
      
      const slaConfig = await JobRoutingService.createSLAConfiguration(businessId, slaData, userId);
      
      res.status(201).json({
        success: true,
        message: 'SLA configuration created successfully',
        data: slaConfig
      });
      
    } catch (error) {
      log.error('Error creating SLA configuration', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to create SLA configuration',
        error: error.message
      });
    }
  }
  
  // Get SLA configurations
  static async getSLAConfigurations(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;
      
      log.info('Fetching SLA configurations', { businessId, filters });
      
      const slaConfigs = await JobRoutingService.getSLAConfigurations(businessId, filters);
      
      res.json({
        success: true,
        data: slaConfigs,
        count: slaConfigs.length
      });
      
    } catch (error) {
      log.error('Error fetching SLA configurations', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch SLA configurations',
        error: error.message
      });
    }
  }
  
  // Create job routing rule
  static async createJobRoutingRule(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const ruleData = req.body;
      
      log.info('Creating job routing rule', { businessId, userId, ruleData: { name: ruleData.name } });
      
      const routingRule = await JobRoutingService.createJobRoutingRule(businessId, ruleData, userId);
      
      res.status(201).json({
        success: true,
        message: 'Job routing rule created successfully',
        data: routingRule
      });
      
    } catch (error) {
      log.error('Error creating job routing rule', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to create job routing rule',
        error: error.message
      });
    }
  }
  
  // Auto-assign job
  static async autoAssignJob(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { jobId } = req.params;
      
      log.info('Auto-assigning job', { businessId, userId, jobId });
      
      const result = await JobRoutingService.autoAssignJob(businessId, jobId, userId);
      
      if (result.assigned) {
        res.json({
          success: true,
          message: 'Job auto-assigned successfully',
          data: result
        });
      } else {
        res.status(404).json({
          success: false,
          message: result.message,
          data: null
        });
      }
      
    } catch (error) {
      log.error('Error auto-assigning job', { error: error.message, businessId: req.user.businessId, jobId: req.params.jobId });
      res.status(500).json({
        success: false,
        message: 'Failed to auto-assign job',
        error: error.message
      });
    }
  }
  
  // Get job routing rules
  static async getJobRoutingRules(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;
      
      log.info('Fetching job routing rules', { businessId, filters });
      
      const routingRules = await JobRoutingService.getJobRoutingRules(businessId, filters);
      
      res.json({
        success: true,
        data: routingRules,
        count: routingRules.length
      });
      
    } catch (error) {
      log.error('Error fetching job routing rules', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch job routing rules',
        error: error.message
      });
    }
  }
}
