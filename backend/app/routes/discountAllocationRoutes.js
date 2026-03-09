// File: ~/Bizzy_Track_pro/backend/app/routes/discountAllocationRoutes.js
// PURPOSE: Define all discount allocation routes
// PHASE 10.10: Following patterns from discountRoutes.js
// USING: validateAccountingRequest middleware for consistency

import express from 'express';
import { DiscountAllocationController } from '../controllers/discountAllocationController.js';
import { validateAccountingRequest } from '../middleware/accountingValidation.js';
import { DiscountSchemas } from '../schemas/discountSchemas.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * =====================================================
 * DISCOUNT ALLOCATION ROUTES
 * =====================================================
 */

/**
 * @route   POST /api/discounts/allocations/bulk
 * @desc    Bulk create allocations
 * @access  Private
 */
router.post(
    '/bulk',
    validateAccountingRequest(null),
    DiscountAllocationController.bulkCreateAllocations
);

/**
 * @route   GET /api/discounts/allocations/export
 * @desc    Export allocations to CSV
 * @access  Private
 */
router.get(
    '/export',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountAllocationController.exportAllocations
);

/**
 * @route   GET /api/discounts/allocations/unallocated
 * @desc    Find discounts applied but not allocated
 * @access  Private
 */
router.get(
    '/unallocated',
    validateAccountingRequest(null),
    DiscountAllocationController.getUnallocatedDiscounts
);

/**
 * @route   GET /api/discounts/allocations/report
 * @desc    Generate allocation report for period
 * @access  Private
 */
router.get(
    '/report',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountAllocationController.getAllocationReport
);

/**
 * @route   GET /api/discounts/allocations/transaction/:transactionId
 * @desc    Get allocations for a specific transaction
 * @access  Private
 */
router.get(
    '/transaction/:transactionId',
    validateAccountingRequest(null),
    DiscountAllocationController.getTransactionAllocations
);

/**
 * @route   GET /api/discounts/allocations/voided
 * @desc    Get voided allocations with reasons
 * @access  Private
 */
router.get(
    '/voided',
    validateAccountingRequest(null),
    DiscountAllocationController.getVoidedAllocations
);

/**
 * @route   GET /api/discounts/allocations/voided/stats
 * @desc    Get statistics about void reasons
 * @access  Private
 */
router.get(
    '/voided/stats',
    validateAccountingRequest(null),
    DiscountAllocationController.getVoidReasonStats
);

/**
 * @route   POST /api/discounts/allocations
 * @desc    Create a discount allocation
 * @access  Private
 */
router.post(
    '/',
    validateAccountingRequest(DiscountSchemas.allocationSchema),
    DiscountAllocationController.createAllocation
);

/**
 * @route   GET /api/discounts/allocations
 * @desc    List allocations with filters
 * @access  Private
 */
router.get(
    '/',
    validateAccountingRequest(null),
    DiscountAllocationController.getAllocations
);

/**
 * @route   GET /api/discounts/allocations/:id/apply
 * @desc    Mark allocation as applied
 * @access  Private
 */
router.get(
    '/:id/apply',
    validateAccountingRequest(null),
    DiscountAllocationController.applyAllocation
);

/**
 * @route   POST /api/discounts/allocations/:id/void
 * @desc    Void an allocation (with reason)
 * @access  Private
 */
router.post(
    '/:id/void',
    validateAccountingRequest(DiscountSchemas.voidAllocationSchema),
    DiscountAllocationController.voidAllocation
);

/**
 * @route   GET /api/discounts/allocations/:id/details
 * @desc    Get allocation with complete details (including void info)
 * @access  Private
 */
router.get(
    '/:id/details',
    validateAccountingRequest(null),
    DiscountAllocationController.getAllocationWithDetails
);

/**
 * @route   GET /api/discounts/allocations/:id
 * @desc    Get allocation details with line items
 * @access  Private
 */
router.get(
    '/:id',
    validateAccountingRequest(null),
    DiscountAllocationController.getAllocationById
);

export default router;
