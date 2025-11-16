import { FieldOperationsService } from '../services/fieldOperationsService.js';
import { log } from '../utils/logger.js';

export class FieldOperationsController {
  
  // Create checklist template
  static async createChecklistTemplate(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const templateData = req.body;
      
      log.info('Creating field checklist template', { businessId, userId, templateData: { name: templateData.name } });
      
      const template = await FieldOperationsService.createChecklistTemplate(businessId, templateData, userId);
      
      res.status(201).json({
        success: true,
        message: 'Field checklist template created successfully',
        data: template
      });
      
    } catch (error) {
      log.error('Error creating field checklist template', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to create field checklist template',
        error: error.message
      });
    }
  }
  
  // Get checklist templates
  static async getChecklistTemplates(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;
      
      log.info('Fetching field checklist templates', { businessId, filters });
      
      const templates = await FieldOperationsService.getChecklistTemplates(businessId, filters);
      
      res.json({
        success: true,
        data: templates,
        count: templates.length
      });
      
    } catch (error) {
      log.error('Error fetching field checklist templates', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch field checklist templates',
        error: error.message
      });
    }
  }
  
  // Assign job to staff
  static async assignJobToStaff(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const assignmentData = req.body;
      
      log.info('Assigning job to staff', { businessId, userId, assignmentData: { job_id: assignmentData.job_id } });
      
      const assignment = await FieldOperationsService.assignJobToStaff(businessId, assignmentData, userId);
      
      res.status(201).json({
        success: true,
        message: 'Job assigned to staff successfully',
        data: assignment
      });
      
    } catch (error) {
      log.error('Error assigning job to staff', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to assign job to staff',
        error: error.message
      });
    }
  }
  
  // Record location
  static async recordLocation(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const locationData = req.body;
      
      log.info('Recording staff location', { businessId, userId, locationData: { staff_profile_id: locationData.staff_profile_id } });
      
      const location = await FieldOperationsService.recordLocation(businessId, locationData, userId);
      
      res.status(201).json({
        success: true,
        message: 'Location recorded successfully',
        data: location
      });
      
    } catch (error) {
      log.error('Error recording location', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to record location',
        error: error.message
      });
    }
  }
  
  // Get field job assignments
  static async getFieldJobAssignments(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;
      
      log.info('Fetching field job assignments', { businessId, filters });
      
      const assignments = await FieldOperationsService.getFieldJobAssignments(businessId, filters);
      
      res.json({
        success: true,
        data: assignments,
        count: assignments.length
      });
      
    } catch (error) {
      log.error('Error fetching field job assignments', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch field job assignments',
        error: error.message
      });
    }
  }
  
  // Update assignment status
  static async updateAssignmentStatus(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const { assignmentId } = req.params;
      const statusData = req.body;
      
      log.info('Updating field job assignment status', { businessId, userId, assignmentId, statusData });
      
      const assignment = await FieldOperationsService.updateAssignmentStatus(businessId, assignmentId, statusData, userId);
      
      res.json({
        success: true,
        message: 'Field job assignment status updated successfully',
        data: assignment
      });
      
    } catch (error) {
      log.error('Error updating field job assignment status', { error: error.message, businessId: req.user.businessId, assignmentId: req.params.assignmentId });
      res.status(500).json({
        success: false,
        message: 'Failed to update field job assignment status',
        error: error.message
      });
    }
  }
  
  // Record digital signature
  static async recordDigitalSignature(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const signatureData = req.body;
      
      log.info('Recording digital signature', { businessId, userId, signatureData: { field_job_assignment_id: signatureData.field_job_assignment_id } });
      
      const signature = await FieldOperationsService.recordDigitalSignature(businessId, signatureData, userId);
      
      res.status(201).json({
        success: true,
        message: 'Digital signature recorded successfully',
        data: signature
      });
      
    } catch (error) {
      log.error('Error recording digital signature', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to record digital signature',
        error: error.message
      });
    }
  }
}
