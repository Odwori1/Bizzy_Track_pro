// File: ~/Bizzy_Track_pro/backend/app/routes/posDiscountRoutes.js
// PURPOSE: POS discount API routes

import express from 'express';
import { POSDiscountController } from '../controllers/posDiscountController.js';
import { validateAccountingRequest } from '../middleware/accountingValidation.js';
import { posDiscountSchemas } from '../schemas/posDiscountSchemas.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/pos/transactions-with-discount
 * @desc    Create POS transaction with discount calculation
 * @access  Private
 */
router.post(
    '/transactions-with-discount',
    validateAccountingRequest(posDiscountSchemas.createTransactionSchema),
    POSDiscountController.createTransactionWithDiscount
);

/**
 * @route   POST /api/pos/transactions/:id/apply-discount
 * @desc    Apply discount to existing transaction
 * @access  Private
 */
router.post(
    '/transactions/:id/apply-discount',
    validateAccountingRequest(posDiscountSchemas.applyDiscountSchema),
    POSDiscountController.applyDiscountToTransaction
);

/**
 * @route   GET /api/pos/transactions/:id/discount-status
 * @desc    Get discount status for transaction
 * @access  Private
 */
router.get(
    '/transactions/:id/discount-status',
    validateAccountingRequest(null),
    POSDiscountController.getDiscountStatus
);

export default router;
