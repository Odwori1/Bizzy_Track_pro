import { invoiceService } from '../services/invoiceService.js';
import { businessService } from '../services/businessService.js';
import { log } from '../utils/logger.js';

/**
 * PRODUCTION-READY INVOICE CONTROLLER
 * 
 * Features:
 * - ✅ Enhanced error handling for tax calculation failures
 * - ✅ Clear error messages for debugging
 * - ✅ Proper validation feedback
 * - ✅ Comprehensive logging
 */
export const invoiceController = {
  async create(req, res, next) {
    try {
      const invoiceData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating invoice', {
        customerId: invoiceData.customer_id,
        jobId: invoiceData.job_id,
        userId,
        businessId,
        lineItemsCount: invoiceData.line_items?.length || 0
      });

      // Validate required fields
      if (!invoiceData.customer_id) {
        return res.status(400).json({
          success: false,
          error: 'Customer ID is required'
        });
      }

      if (!invoiceData.line_items || invoiceData.line_items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one line item is required'
        });
      }

      // ✅ ENHANCED: Validate line items have proper references
      for (let i = 0; i < invoiceData.line_items.length; i++) {
        const item = invoiceData.line_items[i];
        if (!item.product_id && !item.service_id && !item.tax_category_code && item.tax_rate === undefined) {
          return res.status(400).json({
            success: false,
            error: `Line item ${i + 1}: Must have either product_id, service_id, tax_category_code, or tax_rate`
          });
        }
      }

      const newInvoice = await invoiceService.createInvoice(
        invoiceData,
        userId,
        businessId
      );

      // Get business info for currency formatting
      const business = await businessService.getBusinessProfile(businessId);
      if (!business) {
        log.error('Business not found for formatting', { businessId });
        return res.status(500).json({
          success: false,
          error: 'Business profile not found'
        });
      }

      const formattedInvoice = await invoiceService.formatInvoiceForDisplay(newInvoice, business);

      log.info('Invoice creation completed successfully', {
        invoiceId: newInvoice.id,
        invoiceNumber: formattedInvoice.invoice_number,
        totalAmount: formattedInvoice.total_amount,
        taxAmount: formattedInvoice.tax_amount
      });

      res.status(201).json({
        success: true,
        message: 'Invoice created successfully',
        data: formattedInvoice
      });

    } catch (error) {
      log.error('Invoice creation controller error', {
        error: error.message,
        stack: error.stack,
        businessId: req.user?.businessId
      });

      // ✅ ENHANCED: Provide specific error messages for tax calculation failures
      let errorMessage = error.message;
      let statusCode = 500;

      // Tax calculation errors
      if (error.message.includes('Tax calculation failed')) {
        errorMessage = error.message;
        statusCode = 400;
        log.error('Tax calculation error details', {
          error: errorMessage,
          businessId: req.user?.businessId,
          hint: 'Check if business has country set and product/service exists'
        });
      }
      // Product/Service not found
      else if (error.message.includes('not found for this business')) {
        errorMessage = error.message;
        statusCode = 404;
      }
      // Foreign key constraint violations
      else if (error.message.includes('violates foreign key constraint')) {
        errorMessage = 'Invalid customer, job, product, or service reference';
        statusCode = 400;
      }
      // Validation errors
      else if (error.message.includes('required')) {
        errorMessage = error.message;
        statusCode = 400;
      }
      // Business not found
      else if (error.message.includes('Business not found')) {
        errorMessage = 'Business account not found. Please check your business settings.';
        statusCode = 404;
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage,
        ...(process.env.NODE_ENV === 'development' && {
          details: error.stack
        })
      });
    }
  },

  async getAll(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { status, customer_id } = req.query;

      log.info('Fetching all invoices', {
        businessId,
        filters: { status, customer_id }
      });

      const options = {};
      if (status) options.status = status;
      if (customer_id) options.customer_id = customer_id;

      const invoices = await invoiceService.getAllInvoices(businessId, options);

      // Format currencies for display
      const business = await businessService.getBusinessProfile(businessId);
      if (!business) {
        log.error('Business not found for invoice formatting', { businessId });
        return res.status(500).json({
          success: false,
          error: 'Business profile not found'
        });
      }

      const formattedInvoices = await Promise.all(
        invoices.map(invoice => invoiceService.formatInvoiceForDisplay(invoice, business))
      );

      log.info('Invoices fetched successfully', {
        count: formattedInvoices.length,
        businessId
      });

      res.json({
        success: true,
        data: formattedInvoices,
        count: formattedInvoices.length
      });

    } catch (error) {
      log.error('Invoices fetch controller error', {
        error: error.message,
        stack: error.stack,
        businessId: req.user?.businessId
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch invoices'
      });
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      log.info('Fetching invoice by ID', {
        invoiceId: id,
        businessId
      });

      const invoice = await invoiceService.getInvoiceById(id, businessId);

      if (!invoice) {
        log.warn('Invoice not found', { invoiceId: id, businessId });
        return res.status(404).json({
          success: false,
          message: 'Invoice not found'
        });
      }

      // Format currency for display
      const business = await businessService.getBusinessProfile(businessId);
      if (!business) {
        log.error('Business not found for invoice formatting', { businessId });
        return res.status(500).json({
          success: false,
          error: 'Business profile not found'
        });
      }

      const formattedInvoice = await invoiceService.formatInvoiceForDisplay(invoice, business);

      log.info('Invoice fetched successfully', {
        invoiceId: id,
        invoiceNumber: formattedInvoice.invoice_number
      });

      res.json({
        success: true,
        data: formattedInvoice
      });

    } catch (error) {
      log.error('Invoice fetch by ID controller error', {
        error: error.message,
        stack: error.stack,
        invoiceId: req.params?.id,
        businessId: req.user?.businessId
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch invoice'
      });
    }
  },

  async recordPayment(req, res, next) {
    try {
      const { id } = req.params;
      const paymentData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Recording invoice payment', {
        invoiceId: id,
        amount: paymentData.amount,
        paymentMethod: paymentData.payment_method,
        userId,
        businessId
      });

      // Validate required fields
      if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid payment amount is required'
        });
      }

      if (!paymentData.payment_method) {
        return res.status(400).json({
          success: false,
          error: 'Payment method is required'
        });
      }

      const updatedInvoice = await invoiceService.recordPayment(
        id,
        paymentData,
        userId,
        businessId
      );

      // Format currency for display
      const business = await businessService.getBusinessProfile(businessId);
      if (!business) {
        log.error('Business not found for payment formatting', { businessId });
        return res.status(500).json({
          success: false,
          error: 'Business profile not found'
        });
      }

      const formattedInvoice = await invoiceService.formatInvoiceForDisplay(updatedInvoice, business);

      log.info('Payment recorded successfully', {
        invoiceId: id,
        amountPaid: paymentData.amount,
        newBalance: formattedInvoice.balance_due
      });

      res.json({
        success: true,
        message: 'Payment recorded successfully',
        data: formattedInvoice
      });

    } catch (error) {
      log.error('Invoice payment recording controller error', {
        error: error.message,
        stack: error.stack,
        invoiceId: req.params?.id,
        businessId: req.user?.businessId
      });

      let errorMessage = error.message;
      let statusCode = 500;

      if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('amount') || error.message.includes('payment method')) {
        statusCode = 400;
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  },

  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating invoice status', {
        invoiceId: id,
        newStatus: status,
        userId,
        businessId
      });

      // Validate status
      const validStatuses = ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      const updatedInvoice = await invoiceService.updateInvoiceStatus(
        id,
        status,
        userId,
        businessId
      );

      // ✅ ADDED: Format invoice for display
      const business = await businessService.getBusinessProfile(businessId);
      if (!business) {
        log.error('Business not found for status update formatting', { businessId });
        return res.status(500).json({
          success: false,
          error: 'Business profile not found'
        });
      }

      const formattedInvoice = await invoiceService.formatInvoiceForDisplay(updatedInvoice, business);

      log.info('Invoice status updated successfully', {
        invoiceId: id,
        newStatus: status
      });

      res.json({
        success: true,
        message: 'Invoice status updated successfully',
        data: formattedInvoice
      });

    } catch (error) {
      log.error('Invoice status update controller error', {
        error: error.message,
        stack: error.stack,
        invoiceId: req.params?.id,
        businessId: req.user?.businessId
      });

      let errorMessage = error.message;
      let statusCode = 500;

      if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('Invalid status')) {
        statusCode = 400;
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }
};
