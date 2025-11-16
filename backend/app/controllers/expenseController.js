import { ExpenseService } from '../services/expenseService.js';
import { log } from '../utils/logger.js';

export const expenseController = {
  async createCategory(req, res, next) {
    try {
      const categoryData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating expense category', { businessId, userId, categoryName: categoryData.name });

      const newCategory = await ExpenseService.createCategory(businessId, categoryData, userId);

      res.status(201).json({
        success: true,
        message: 'Expense category created successfully',
        data: newCategory
      });

    } catch (error) {
      log.error('Expense category creation controller error', error);
      next(error);
    }
  },

  async createExpense(req, res, next) {
    try {
      const expenseData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating expense', { businessId, userId, expenseAmount: expenseData.amount });

      const newExpense = await ExpenseService.createExpense(businessId, expenseData, userId);

      res.status(201).json({
        success: true,
        message: 'Expense created successfully',
        data: newExpense
      });

    } catch (error) {
      log.error('Expense creation controller error', error);
      next(error);
    }
  },

  async approveExpense(req, res, next) {
    try {
      const { id } = req.params;
      const approvalData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Approving expense', { businessId, userId, expenseId: id, status: approvalData.status });

      const updatedExpense = await ExpenseService.approveExpense(businessId, id, approvalData, userId);

      res.json({
        success: true,
        message: `Expense ${approvalData.status} successfully`,
        data: updatedExpense
      });

    } catch (error) {
      log.error('Expense approval controller error', error);
      next(error);
    }
  },

  async getCategories(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { is_active } = req.query;

      const filters = {};
      if (is_active !== undefined) filters.is_active = is_active === 'true';

      const categories = await ExpenseService.getCategories(businessId, filters);

      res.json({
        success: true,
        data: categories,
        count: categories.length,
        message: 'Expense categories fetched successfully'
      });

    } catch (error) {
      log.error('Expense categories fetch controller error', error);
      next(error);
    }
  },

  async getExpenses(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { category_id, status, wallet_id, start_date, end_date, page, limit } = req.query;

      const filters = {};
      if (category_id) filters.category_id = category_id;
      if (status) filters.status = status;
      if (wallet_id) filters.wallet_id = wallet_id;
      if (start_date) filters.start_date = start_date;
      if (end_date) filters.end_date = end_date;
      if (page) filters.page = parseInt(page);
      if (limit) filters.limit = parseInt(limit);

      const expenses = await ExpenseService.getExpenses(businessId, filters);

      res.json({
        success: true,
        data: expenses,
        count: expenses.length,
        message: 'Expenses fetched successfully'
      });

    } catch (error) {
      log.error('Expenses fetch controller error', error);
      next(error);
    }
  },

  async getStatistics(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { start_date, end_date } = req.query;

      const statistics = await ExpenseService.getExpenseStatistics(businessId, start_date, end_date);

      res.json({
        success: true,
        data: statistics,
        message: 'Expense statistics fetched successfully'
      });

    } catch (error) {
      log.error('Expense statistics fetch controller error', error);
      next(error);
    }
  }
};
