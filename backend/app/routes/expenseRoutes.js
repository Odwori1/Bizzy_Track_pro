import express from 'express';
import { expenseController } from '../controllers/expenseController.js';
import {
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
  createExpenseSchema,
  updateExpenseSchema,
  approveExpenseSchema,
  expenseQuerySchema
} from '../schemas/expenseSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Expense Categories - ADDING MISSING ROUTES
router.post(
  '/categories',
  requirePermission('expense:create'),
  validateRequest(createExpenseCategorySchema),
  expenseController.createCategory
);

router.get(
  '/categories',
  requirePermission('expense:read'),
  expenseController.getCategories
);

// NEW: Category Update Route
router.put(
  '/categories/:id',
  requirePermission('expense:update'),
  validateRequest(updateExpenseCategorySchema),
  expenseController.updateCategory
);

// NEW: Category Delete Route
router.delete(
  '/categories/:id',
  requirePermission('expense:delete'),
  expenseController.deleteCategory
);

// Expense Management
router.post(
  '/',
  requirePermission('expense:create'),
  validateRequest(createExpenseSchema),
  expenseController.createExpense
);

router.get(
  '/',
  requirePermission('expense:read'),
  validateRequest(expenseQuerySchema, 'query'),
  expenseController.getExpenses
);

// ✅ EXPENSE REPORTS - MOVED ABOVE PARAMETER ROUTES
router.get(
  '/statistics',
  requirePermission('expense:read'),
  expenseController.getStatistics
);

// ✅ PARAMETER ROUTES - MOVED BELOW SPECIFIC ROUTES

// Get and Update Individual Expenses
router.get(
  '/:id',
  requirePermission('expense:read'),
  expenseController.getExpenseById
);

router.put(
  '/:id',
  requirePermission('expense:update'),
  validateRequest(updateExpenseSchema),
  expenseController.updateExpense
);

// Expense Approval
router.patch(
  '/:id/approve',
  requirePermission('expense:approve'),
  validateRequest(approveExpenseSchema),
  expenseController.approveExpense
);

// ✅ DELETE ROUTE - ADD THIS
router.delete(
  '/:id',
  requirePermission('expense:delete'),
  expenseController.deleteExpense
);

export default router;
