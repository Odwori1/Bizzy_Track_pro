// File: backend/app/routes/openingBalanceRoutes.js
// Pattern follows: refundRoutes.js, refundApprovalRoutes.js

import express from 'express';
import { OpeningBalanceController } from '../controllers/openingBalanceController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import { OpeningBalanceSchemas } from '../schemas/openingBalanceSchemas.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============================================================================
// STATUS & INITIALIZATION ROUTES
// ============================================================================

// Get opening balance status (read permission)
router.get(
    '/status',
    requirePermission('accounting:read'),
    OpeningBalanceController.getStatus
);

// Initialize business accounting (write permission)
router.post(
    '/initialize',
    requirePermission('accounting:write'),
    validateRequest(OpeningBalanceSchemas.initializeBusinessSchema),
    OpeningBalanceController.initializeBusiness
);

// Get available accounts (read permission)
router.get(
    '/accounts',
    requirePermission('accounting:read'),
    OpeningBalanceController.getAvailableAccounts
);

// ============================================================================
// OPENING BALANCE CRUD OPERATIONS
// ============================================================================

// Get all opening balances (read permission)
router.get(
    '/',
    requirePermission('accounting:read'),
    OpeningBalanceController.getOpeningBalances
);

// Set opening balance (write permission)
router.post(
    '/',
    requirePermission('accounting:write'),
    validateRequest(OpeningBalanceSchemas.setBalanceSchema),
    OpeningBalanceController.setOpeningBalance
);

// Delete opening balance (write permission)
router.delete(
    '/:accountCode',
    requirePermission('accounting:write'),
    validateRequest(OpeningBalanceSchemas.deleteBalanceSchema),
    OpeningBalanceController.deleteOpeningBalance
);

// ============================================================================
// VALIDATION & POSTING ROUTES
// ============================================================================

// Validate opening balances (read permission)
router.post(
    '/validate',
    requirePermission('accounting:read'),
    validateRequest(OpeningBalanceSchemas.validateBalancesSchema),
    OpeningBalanceController.validateBalances
);

// Post opening balances to journal (write permission)
router.post(
    '/post',
    requirePermission('accounting:write'),
    validateRequest(OpeningBalanceSchemas.postBalancesSchema),
    OpeningBalanceController.postOpeningBalances
);

export default router;
