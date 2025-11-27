import express from 'express';
import { financialReportController } from '../controllers/financialReportController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Financial Reports
router.get(
  '/financial-report',
  requirePermission('financial:reports:view'),
  financialReportController.getFinancialReport
);

router.get(
  '/cash-flow',
  requirePermission('financial:reports:view'),
  financialReportController.getCashFlowReport
);

router.get(
  '/profit-loss',
  requirePermission('financial:reports:view'),
  financialReportController.getProfitAndLoss
);

// NEW: Balance Sheet Report
router.get(
  '/balance-sheet',
  requirePermission('financial:reports:view'),
  financialReportController.getBalanceSheet
);

// NEW: Quick Reports
router.get(
  '/monthly-summary',
  requirePermission('financial:reports:view'),
  financialReportController.getMonthlySummary
);

router.get(
  '/expense-analysis',
  requirePermission('financial:reports:view'),
  financialReportController.getExpenseAnalysis
);

router.get(
  '/revenue-report',
  requirePermission('financial:reports:view'),
  financialReportController.getRevenueReport
);

// NEW: Export Routes
router.post(
  '/export/pdf',
  requirePermission('financial:reports:export'),
  financialReportController.exportPDF
);

router.post(
  '/export/excel',
  requirePermission('financial:reports:export'),
  financialReportController.exportExcel
);

// Tithe Calculation (Optional Feature)
router.get(
  '/tithe-calculation',
  requirePermission('tithe:manage'),
  financialReportController.calculateTithe
);

export default router;
