import express from 'express';
import { expenseController } from '../controllers/expenseController.js';
import { 
  createExpenseCategorySchema, 
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

// Expense Categories
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

// Expense Approval
router.patch(
  '/:id/approve',
  requirePermission('expense:approve'),
  validateRequest(approveExpenseSchema),
  expenseController.approveExpense
);

// Expense Reports
router.get(
  '/statistics',
  requirePermission('expense:read'),
  expenseController.getStatistics
);

export default router;
