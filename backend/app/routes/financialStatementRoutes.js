// File: backend/app/routes/financialStatementRoutes.js
// Pattern follows: openingBalanceRoutes.js, taxRoutes.js
// Purpose: Financial statement API routes

import express from 'express';
import { FinancialStatementController } from '../controllers/financialStatementController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { FinancialStatementSchemas } from '../schemas/financialStatementSchemas.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============================================================================
// FINANCIAL STATEMENT ROUTES
// ============================================================================

// Profit & Loss Statement (Income Statement)
router.get(
    '/profit-loss',
    requirePermission('accounting:read'),
    (req, res, next) => {
        const validation = FinancialStatementSchemas.validateProfitLossQuery(req.query);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            });
        }
        next();
    },
    FinancialStatementController.getProfitLoss
);

// Balance Sheet
router.get(
    '/balance-sheet',
    requirePermission('accounting:read'),
    (req, res, next) => {
        const validation = FinancialStatementSchemas.validateBalanceSheetQuery(req.query);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            });
        }
        next();
    },
    FinancialStatementController.getBalanceSheet
);

// Cash Flow Statement
router.get(
    '/cash-flow',
    requirePermission('accounting:read'),
    (req, res, next) => {
        const validation = FinancialStatementSchemas.validateCashFlowQuery(req.query);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            });
        }
        next();
    },
    FinancialStatementController.getCashFlow
);

// Enhanced Trial Balance
router.get(
    '/trial-balance',
    requirePermission('accounting:read'),
    (req, res, next) => {
        const validation = FinancialStatementSchemas.validateTrialBalanceQuery(req.query);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            });
        }
        next();
    },
    FinancialStatementController.getTrialBalanceEnhanced
);

// Financial Summary Dashboard
router.get(
    '/summary',
    requirePermission('accounting:read'),
    (req, res, next) => {
        const validation = FinancialStatementSchemas.validateSummaryQuery(req.query);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            });
        }
        next();
    },
    FinancialStatementController.getFinancialSummary
);

export default router;
