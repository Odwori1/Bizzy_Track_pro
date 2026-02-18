// File: backend/app/controllers/vendorPaymentController.js
import { VendorPaymentService } from '../services/vendorPaymentService.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

/**
 * VENDOR PAYMENT CONTROLLER
 * API endpoints for supplier payments
 */
export class VendorPaymentController {
  
  /**
   * Create a new vendor payment
   * POST /api/vendor-payments
   */
  static async createPayment(req, res) {
    try {
      const businessId = req.user?.businessId || req.user?.business_id;
      const userId = req.user?.userId || req.user?.id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      const {
        purchase_order_id,
        supplier_id,
        payment_date,
        amount,
        payment_method,
        reference_number,
        notes
      } = req.body;

      // Validate required fields
      if (!purchase_order_id || !supplier_id || !amount || !payment_method) {
        return res.status(400).json({
          success: false,
          message: 'purchase_order_id, supplier_id, amount, and payment_method are required'
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0'
        });
      }

      const payment = await VendorPaymentService.createPayment({
        purchase_order_id,
        supplier_id,
        payment_date,
        amount,
        payment_method,
        reference_number,
        notes
      }, businessId, userId);

      // Log audit trail
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'vendor_payment.created',
        resourceType: 'vendor_payment',
        resourceId: payment.id,
        newValues: {
          amount: payment.amount,
          payment_method: payment.payment_method,
          purchase_order_id: payment.purchase_order_id
        }
      });

      return res.status(201).json({
        success: true,
        data: payment,
        message: 'Payment created successfully'
      });

    } catch (error) {
      log.error('Create vendor payment controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment',
        error: error.message
      });
    }
  }

  /**
   * Get payment by ID
   * GET /api/vendor-payments/:id
   */
  static async getPaymentById(req, res) {
    try {
      const { id } = req.params;
      const businessId = req.user?.businessId || req.user?.business_id;

      const payment = await VendorPaymentService.getPaymentById(id, businessId);

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: payment
      });

    } catch (error) {
      log.error('Get vendor payment controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get payment',
        error: error.message
      });
    }
  }

  /**
   * List payments
   * GET /api/vendor-payments
   */
  static async listPayments(req, res) {
    try {
      const businessId = req.user?.businessId || req.user?.business_id;
      const {
        supplier_id,
        purchase_order_id,
        payment_method,
        reconciliation_status,
        start_date,
        end_date,
        limit
      } = req.query;

      const payments = await VendorPaymentService.listPayments(businessId, {
        supplier_id,
        purchase_order_id,
        payment_method,
        reconciliation_status,
        start_date,
        end_date,
        limit: limit ? parseInt(limit) : null
      });

      return res.status(200).json({
        success: true,
        data: payments,
        count: payments.length
      });

    } catch (error) {
      log.error('List vendor payments controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to list payments',
        error: error.message
      });
    }
  }

  /**
   * Update payment reconciliation
   * PUT /api/vendor-payments/:id/reconcile
   */
  static async updateReconciliation(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const businessId = req.user?.businessId || req.user?.business_id;
      const userId = req.user?.userId || req.user?.id;

      if (!status || !['pending', 'reconciled', 'disputed'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Valid status (pending/reconciled/disputed) is required'
        });
      }

      const payment = await VendorPaymentService.updateReconciliationStatus(
        id, businessId, status, userId
      );

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Log audit trail
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'vendor_payment.reconciled',
        resourceType: 'vendor_payment',
        resourceId: id,
        newValues: { reconciliation_status: status }
      });

      return res.status(200).json({
        success: true,
        data: payment,
        message: 'Payment reconciliation updated successfully'
      });

    } catch (error) {
      log.error('Update payment reconciliation controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update reconciliation',
        error: error.message
      });
    }
  }

  /**
   * Get payment summary
   * GET /api/vendor-payments/summary
   */
  static async getPaymentSummary(req, res) {
    try {
      const businessId = req.user?.businessId || req.user?.business_id;
      const { period = 'month' } = req.query;

      const summary = await VendorPaymentService.getPaymentSummary(businessId, period);

      return res.status(200).json({
        success: true,
        data: summary
      });

    } catch (error) {
      log.error('Get payment summary controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get payment summary',
        error: error.message
      });
    }
  }

  /**
   * Test endpoint
   * GET /api/vendor-payments/test
   */
  static async testController(req, res) {
    try {
      const businessId = req.user?.businessId || req.user?.business_id;

      return res.status(200).json({
        success: true,
        data: {
          businessId,
          timestamp: new Date().toISOString(),
          status: 'Vendor payment controller is operational',
          features: [
            'Create vendor payments',
            'Get payment by ID',
            'List payments with filters',
            'Update reconciliation status',
            'Payment summary statistics'
          ]
        },
        message: 'Vendor payment system is working correctly'
      });

    } catch (error) {
      log.error('Vendor payment controller test failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Controller test failed',
        details: error.message
      });
    }
  }
}

export default VendorPaymentController;
