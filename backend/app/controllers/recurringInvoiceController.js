import { recurringInvoiceService } from '../services/recurringInvoiceService.js';
import { log } from '../utils/logger.js';

export const recurringInvoiceController = {
  async getAll(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { status } = req.query;

      log.info('Fetching all recurring invoices', {
        businessId,
        statusFilter: status
      });

      const options = {};
      if (status) options.status = status;

      const recurringInvoices = await recurringInvoiceService.getAllRecurringInvoices(businessId, options);

      log.info('Recurring invoices fetched successfully', {
        count: recurringInvoices.length,
        businessId
      });

      res.json({
        success: true,
        data: recurringInvoices,
        count: recurringInvoices.length
      });

    } catch (error) {
      log.error('Recurring invoices fetch controller error', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch recurring invoices'
      });
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      log.info('Fetching recurring invoice by ID', {
        recurringInvoiceId: id,
        businessId
      });

      const recurringInvoice = await recurringInvoiceService.getRecurringInvoiceById(id, businessId);

      if (!recurringInvoice) {
        log.warn('Recurring invoice not found', { recurringInvoiceId: id, businessId });
        return res.status(404).json({
          success: false,
          message: 'Recurring invoice not found'
        });
      }

      log.info('Recurring invoice fetched successfully', {
        recurringInvoiceId: id
      });

      res.json({
        success: true,
        data: recurringInvoice
      });

    } catch (error) {
      log.error('Recurring invoice fetch by ID controller error', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch recurring invoice'
      });
    }
  },

  async create(req, res, next) {
    try {
      const recurringInvoiceData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating recurring invoice', {
        customerId: recurringInvoiceData.customer_id,
        frequency: recurringInvoiceData.frequency,
        userId,
        businessId
      });

      // Validate required fields
      if (!recurringInvoiceData.customer_id) {
        return res.status(400).json({
          success: false,
          error: 'Customer ID is required'
        });
      }

      if (!recurringInvoiceData.frequency) {
        return res.status(400).json({
          success: false,
          error: 'Frequency is required'
        });
      }

      const newRecurringInvoice = await recurringInvoiceService.createRecurringInvoice(
        recurringInvoiceData,
        userId,
        businessId
      );

      log.info('Recurring invoice created successfully', {
        recurringInvoiceId: newRecurringInvoice.id
      });

      res.status(201).json({
        success: true,
        message: 'Recurring invoice created successfully',
        data: newRecurringInvoice
      });

    } catch (error) {
      log.error('Recurring invoice creation controller error', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const recurringInvoiceData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating recurring invoice', {
        recurringInvoiceId: id,
        userId,
        businessId
      });

      const updatedRecurringInvoice = await recurringInvoiceService.updateRecurringInvoice(
        id,
        recurringInvoiceData,
        userId,
        businessId
      );

      log.info('Recurring invoice updated successfully', {
        recurringInvoiceId: id
      });

      res.json({
        success: true,
        message: 'Recurring invoice updated successfully',
        data: updatedRecurringInvoice
      });

    } catch (error) {
      log.error('Recurring invoice update controller error', error);

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

      log.info('Deleting recurring invoice', {
        recurringInvoiceId: id,
        businessId
      });

      await recurringInvoiceService.deleteRecurringInvoice(id, businessId);

      log.info('Recurring invoice deleted successfully', {
        recurringInvoiceId: id
      });

      res.json({
        success: true,
        message: 'Recurring invoice deleted successfully'
      });

    } catch (error) {
      log.error('Recurring invoice deletion controller error', error);

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

  async pause(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      log.info('Pausing recurring invoice', {
        recurringInvoiceId: id,
        businessId
      });

      const updatedRecurringInvoice = await recurringInvoiceService.pauseRecurringInvoice(id, businessId);

      log.info('Recurring invoice paused successfully', {
        recurringInvoiceId: id
      });

      res.json({
        success: true,
        message: 'Recurring invoice paused successfully',
        data: updatedRecurringInvoice
      });

    } catch (error) {
      log.error('Recurring invoice pause controller error', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  async resume(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      log.info('Resuming recurring invoice', {
        recurringInvoiceId: id,
        businessId
      });

      const updatedRecurringInvoice = await recurringInvoiceService.resumeRecurringInvoice(id, businessId);

      log.info('Recurring invoice resumed successfully', {
        recurringInvoiceId: id
      });

      res.json({
        success: true,
        message: 'Recurring invoice resumed successfully',
        data: updatedRecurringInvoice
      });

    } catch (error) {
      log.error('Recurring invoice resume controller error', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};
