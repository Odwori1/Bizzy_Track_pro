import { PurchaseOrderService } from '../services/purchaseOrderService.js';
import { log } from '../utils/logger.js';

export const purchaseOrderController = {
  async createPurchaseOrder(req, res, next) {
    try {
      const orderData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating purchase order', { businessId, userId });

      const newOrder = await PurchaseOrderService.createPurchaseOrder(businessId, orderData, userId);

      res.status(201).json({
        success: true,
        message: 'Purchase order created successfully',
        data: newOrder
      });
    } catch (error) {
      log.error('Purchase order creation controller error', error);
      next(error);
    }
  },

  async getPurchaseOrders(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { supplier_id, status, payment_status, start_date, end_date, page, limit } = req.query;

      const filters = {};
      if (supplier_id) filters.supplier_id = supplier_id;
      if (status) filters.status = status;
      if (payment_status) filters.payment_status = payment_status;
      if (start_date) filters.start_date = start_date;
      if (end_date) filters.end_date = end_date;
      if (page) filters.page = parseInt(page);
      if (limit) filters.limit = parseInt(limit);

      const orders = await PurchaseOrderService.getPurchaseOrders(businessId, filters);

      res.json({
        success: true,
        data: orders,
        count: orders.length,
        message: 'Purchase orders fetched successfully'
      });
    } catch (error) {
      log.error('Purchase orders fetch controller error', error);
      next(error);
    }
  },

  async getPurchaseOrderById(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { id } = req.params;

      const order = await PurchaseOrderService.getPurchaseOrderById(businessId, id);

      res.json({
        success: true,
        data: order,
        message: 'Purchase order fetched successfully'
      });
    } catch (error) {
      log.error('Purchase order fetch by ID controller error', error);
      next(error);
    }
  },

  async approvePurchaseOrder(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Approving purchase order', { businessId, orderId: id, userId });

      const updatedOrder = await PurchaseOrderService.approvePurchaseOrder(businessId, id, userId);

      res.json({
        success: true,
        message: 'Purchase order approved successfully',
        data: updatedOrder
      });
    } catch (error) {
      log.error('Purchase order approval controller error', error);
      next(error);
    }
  },

  async receivePurchaseOrder(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Receiving purchase order', { businessId, orderId: id, userId });

      const updatedOrder = await PurchaseOrderService.receivePurchaseOrder(businessId, id, userId);

      res.json({
        success: true,
        message: 'Purchase order marked as received',
        data: updatedOrder
      });
    } catch (error) {
      log.error('Purchase order receive controller error', error);
      next(error);
    }
  },

  async payPurchaseOrder(req, res, next) {
    try {
      const { id } = req.params;
      const paymentData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Paying purchase order', { businessId, orderId: id, userId, paymentData });

      const paymentResult = await PurchaseOrderService.payPurchaseOrder(businessId, id, paymentData, userId);

      res.json({
        success: true,
        message: 'Payment recorded successfully',
        data: paymentResult
      });
    } catch (error) {
      log.error('Purchase order payment controller error', error);
      next(error);
    }
  },

  async getPurchaseOrderPayments(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      const payments = await PurchaseOrderService.getPurchaseOrderPayments(businessId, id);

      res.json({
        success: true,
        data: payments,
        message: 'Payment history retrieved successfully'
      });
    } catch (error) {
      log.error('Purchase order payments fetch controller error', error);
      next(error);
    }
  },

  async getApAgingReport(req, res, next) {
    try {
      const businessId = req.user.businessId;

      log.info('Generating AP aging report', { businessId });

      const agingReport = await PurchaseOrderService.getApAgingReport(businessId);

      res.json({
        success: true,
        data: agingReport,
        message: 'AP aging report generated successfully'
      });
    } catch (error) {
      log.error('AP aging report controller error', error);
      next(error);
    }
  }
};
