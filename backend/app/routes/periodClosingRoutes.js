// File: backend/app/routes/periodClosingRoutes.js
// Pattern follows: financialStatementRoutes.js
// Purpose: Period closing API routes

import express from 'express';
import { FinancialStatementController } from '../controllers/financialStatementController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { FinancialStatementSchemas } from '../schemas/financialStatementSchemas.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============================================================================
// PERIOD CLOSING ROUTES
// ============================================================================

// List all accounting periods
router.get(
    '/periods',
    requirePermission('accounting:read'),
    (req, res, next) => {
        const validation = FinancialStatementSchemas.validateListPeriodsQuery(req.query);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            });
        }
        next();
    },
    FinancialStatementController.listAccountingPeriods
);

// Get current period status
router.get(
    '/periods/status',
    requirePermission('accounting:read'),
    (req, res, next) => {
        const validation = FinancialStatementSchemas.validatePeriodStatusQuery(req.query);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            });
        }
        next();
    },
    FinancialStatementController.getCurrentPeriodStatus
);

// Close a period
router.post(
    '/periods/close',
    requirePermission('accounting:manage'),
    (req, res, next) => {
        const validation = FinancialStatementSchemas.validateClosePeriodBody(req.body);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            });
        }
        next();
    },
    FinancialStatementController.closeAccountingPeriod
);

// Reopen a period
router.post(
    '/periods/reopen',
    requirePermission('accounting:manage'),
    (req, res, next) => {
        const validation = FinancialStatementSchemas.validateReopenPeriodBody(req.body);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            });
        }
        next();
    },
    FinancialStatementController.reopenAccountingPeriod
);

export default router;
