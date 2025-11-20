import { invoiceTemplateService } from '../services/invoiceTemplateService.js';
import { log } from '../utils/logger.js';

export const invoiceTemplateController = {
  async getAll(req, res, next) {
    try {
      const businessId = req.user.businessId;

      log.info('Fetching all invoice templates', { businessId });

      const templates = await invoiceTemplateService.getAllTemplates(businessId);

      log.info('Invoice templates fetched successfully', {
        count: templates.length,
        businessId
      });

      res.json({
        success: true,
        data: templates,
        count: templates.length
      });

    } catch (error) {
      log.error('Invoice templates fetch controller error', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch invoice templates'
      });
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      log.info('Fetching invoice template by ID', {
        templateId: id,
        businessId
      });

      const template = await invoiceTemplateService.getTemplateById(id, businessId);

      if (!template) {
        log.warn('Invoice template not found', { templateId: id, businessId });
        return res.status(404).json({
          success: false,
          message: 'Invoice template not found'
        });
      }

      log.info('Invoice template fetched successfully', {
        templateId: id,
        templateName: template.name
      });

      res.json({
        success: true,
        data: template
      });

    } catch (error) {
      log.error('Invoice template fetch by ID controller error', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch invoice template'
      });
    }
  },

  async create(req, res, next) {
    try {
      const templateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating invoice template', {
        templateName: templateData.name,
        userId,
        businessId
      });

      // Validate required fields
      if (!templateData.name) {
        return res.status(400).json({
          success: false,
          error: 'Template name is required'
        });
      }

      const newTemplate = await invoiceTemplateService.createTemplate(
        templateData,
        userId,
        businessId
      );

      log.info('Invoice template created successfully', {
        templateId: newTemplate.id,
        templateName: newTemplate.name
      });

      res.status(201).json({
        success: true,
        message: 'Invoice template created successfully',
        data: newTemplate
      });

    } catch (error) {
      log.error('Invoice template creation controller error', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const templateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating invoice template', {
        templateId: id,
        userId,
        businessId
      });

      const updatedTemplate = await invoiceTemplateService.updateTemplate(
        id,
        templateData,
        userId,
        businessId
      );

      log.info('Invoice template updated successfully', {
        templateId: id
      });

      res.json({
        success: true,
        message: 'Invoice template updated successfully',
        data: updatedTemplate
      });

    } catch (error) {
      log.error('Invoice template update controller error', error);

      let errorMessage = error.message;
      let statusCode = 500;

      if (error.message.includes('not found')) {
        statusCode = 404;
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      log.info('Deleting invoice template', {
        templateId: id,
        businessId
      });

      await invoiceTemplateService.deleteTemplate(id, businessId);

      log.info('Invoice template deleted successfully', {
        templateId: id
      });

      res.json({
        success: true,
        message: 'Invoice template deleted successfully'
      });

    } catch (error) {
      log.error('Invoice template deletion controller error', error);

      let errorMessage = error.message;
      let statusCode = 500;

      if (error.message.includes('not found')) {
        statusCode = 404;
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }
};
