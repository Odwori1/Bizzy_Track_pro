import { POSService } from '../services/posService.js';
import { log } from '../utils/logger.js';

export const posController = {
  async createTransaction(req, res, next) {
    try {
      const transactionData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating POS transaction', {
        businessId,
        userId,
        itemCount: transactionData.items?.length || 0
      });

      const newTransaction = await POSService.createTransaction(
        businessId,
        transactionData,
        userId
      );

      res.status(201).json({
        success: true,
        message: 'POS transaction created successfully',
        data: newTransaction
      });

    } catch (error) {
      log.error('POS transaction creation controller error', error);
      next(error);
    }
  },

  async getTransactions(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const {
        customer_id,
        payment_method,
        payment_status,
        status,
        start_date,
        end_date,
        page,
        limit
      } = req.query;

      const filters = {};
      if (customer_id) filters.customer_id = customer_id;
      if (payment_method) filters.payment_method = payment_method;
      if (payment_status) filters.payment_status = payment_status;
      if (status) filters.status = status;
      if (start_date) filters.start_date = start_date;
      if (end_date) filters.end_date = end_date;
      if (page) filters.page = parseInt(page);
      if (limit) filters.limit = parseInt(limit);

      const transactions = await POSService.getTransactions(businessId, filters);

      res.json({
        success: true,
        data: transactions,
        count: transactions.length,
        message: 'POS transactions fetched successfully'
      });

    } catch (error) {
      log.error('POS transactions fetch controller error', error);
      next(error);
    }
  },

  async getTransactionById(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { id } = req.params;

      const transaction = await POSService.getTransactionById(businessId, id);

      res.json({
        success: true,
        data: transaction,
        message: 'POS transaction fetched successfully'
      });

    } catch (error) {
      log.error('POS transaction fetch by ID controller error', error);
      next(error);
    }
  },

  async updateTransaction(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating POS transaction', {
        businessId,
        userId,
        transactionId: id
      });

      const updatedTransaction = await POSService.updateTransaction(
        businessId,
        id,
        updateData,
        userId
      );

      res.json({
        success: true,
        message: 'POS transaction updated successfully',
        data: updatedTransaction
      });

    } catch (error) {
      log.error('POS transaction update controller error', error);
      next(error);
    }
  },

  async deleteTransaction(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Deleting POS transaction', {
        businessId,
        userId,
        transactionId: id
      });

      const result = await POSService.deleteTransaction(businessId, id, userId);

      res.json({
        success: true,
        message: result.message,
        data: result
      });

    } catch (error) {
      log.error('POS transaction deletion controller error', error);
      next(error);
    }
  },

  async getSalesAnalytics(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { start_date, end_date } = req.query;

      const analytics = await POSService.getSalesAnalytics(
        businessId,
        start_date,
        end_date
      );

      res.json({
        success: true,
        data: analytics,
        message: 'Sales analytics fetched successfully'
      });

    } catch (error) {
      log.error('Sales analytics fetch controller error', error);
      next(error);
    }
  },

  async getTodaySales(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const todaySales = await POSService.getTodaySales(businessId);

      res.json({
        success: true,
        data: todaySales,
        message: 'Today sales fetched successfully'
      });

    } catch (error) {
      log.error('Today sales fetch controller error', error);
      next(error);
    }
  }
};

