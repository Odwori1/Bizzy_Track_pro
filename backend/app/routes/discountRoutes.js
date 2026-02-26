// File: backend/app/routes/discountRoutes.js
// PURPOSE: Define all discount-related API routes
// PHASE 10.10: Following patterns from accountingRoutes.js
// USING: validateAccountingRequest middleware for consistency

import express from 'express';
import { DiscountController } from '../controllers/discountController.js';
import { validateAccountingRequest } from '../middleware/accountingValidation.js';
import { DiscountSchemas } from '../schemas/discountSchemas.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * =====================================================
 * DISCOUNT CALCULATION ENDPOINTS
 * =====================================================
 */

/**
 * @route   POST /api/discounts/calculate
 * @desc    Calculate final price with all applicable discounts
 * @access  Private
 */
router.post(
    '/calculate',
    validateAccountingRequest(DiscountSchemas.calculateSchema),
    DiscountController.calculateFinalPrice
);

/**
 * @route   POST /api/discounts/preview
 * @desc    Preview discounts without applying them
 * @access  Private
 */
router.post(
    '/preview',
    validateAccountingRequest(DiscountSchemas.previewSchema),
    DiscountController.previewDiscounts
);

/**
 * @route   GET /api/discounts/available
 * @desc    Get available discounts for current context
 * @access  Private
 */
router.get(
    '/available',
    validateAccountingRequest(DiscountSchemas.availableSchema),
    DiscountController.getAvailableDiscounts
);

/**
 * @route   POST /api/discounts/find-best
 * @desc    Find best combination of discounts
 * @access  Private
 */
router.post(
    '/find-best',
    validateAccountingRequest(DiscountSchemas.previewSchema),
    DiscountController.findBestCombination
);

/**
 * =====================================================
 * PROMOTIONAL DISCOUNTS
 * =====================================================
 */

/**
 * @route   POST /api/discounts/promotions
 * @desc    Create new promotional discount
 * @access  Private
 */
router.post(
    '/promotions',
    validateAccountingRequest(DiscountSchemas.createPromotionSchema),
    DiscountController.createPromotion
);

/**
 * @route   GET /api/discounts/promotions
 * @desc    List all promotions with filters
 * @access  Private
 */
router.get(
    '/promotions',
    validateAccountingRequest(null), // No schema for query params
    DiscountController.getPromotions
);

/**
 * @route   GET /api/discounts/promotions/:id
 * @desc    Get specific promotion details
 * @access  Private
 */
router.get(
    '/promotions/:id',
    validateAccountingRequest(null),
    DiscountController.getPromotionById
);

/**
 * @route   PUT /api/discounts/promotions/:id
 * @desc    Update promotion
 * @access  Private
 */
router.put(
    '/promotions/:id',
    validateAccountingRequest(DiscountSchemas.updatePromotionSchema),
    DiscountController.updatePromotion
);

/**
 * @route   DELETE /api/discounts/promotions/:id
 * @desc    Deactivate promotion (soft delete)
 * @access  Private
 */
router.delete(
    '/promotions/:id',
    validateAccountingRequest(null),
    DiscountController.deactivatePromotion
);

/**
 * @route   POST /api/discounts/promotions/validate
 * @desc    Validate a promo code without applying
 * @access  Private
 */
router.post(
    '/promotions/validate',
    validateAccountingRequest(DiscountSchemas.validatePromoSchema),
    DiscountController.validatePromoCode
);

/**
 * @route   GET /api/discounts/promotions/:id/stats
 * @desc    Get usage statistics for a promotion
 * @access  Private
 */
router.get(
    '/promotions/:id/stats',
    validateAccountingRequest(null),
    DiscountController.getPromotionStats
);

/**
 * @route   GET /api/discounts/promotions/expiring
 * @desc    Get promotions expiring soon
 * @access  Private
 */
router.get(
    '/promotions/expiring',
    validateAccountingRequest(null),
    DiscountController.getExpiringPromotions
);

/**
 * @route   POST /api/discounts/promotions/bulk
 * @desc    Bulk create promotions
 * @access  Private
 */
router.post(
    '/promotions/bulk',
    validateAccountingRequest(null), // Manual validation in controller
    DiscountController.bulkCreatePromotions
);

/**
 * @route   GET /api/discounts/promotions/export
 * @desc    Export promotions to CSV
 * @access  Private
 */
router.get(
    '/promotions/export',
    validateAccountingRequest(null),
    DiscountController.exportPromotions
);

/**
 * =====================================================
 * EARLY PAYMENT TERMS
 * =====================================================
 */

/**
 * @route   POST /api/discounts/early-payment/terms
 * @desc    Create early payment terms
 * @access  Private
 */
router.post(
    '/early-payment/terms',
    validateAccountingRequest(DiscountSchemas.earlyPaymentSchema),
    DiscountController.createEarlyPaymentTerms
);

/**
 * @route   GET /api/discounts/early-payment/terms
 * @desc    List all early payment terms
 * @access  Private
 */
router.get(
    '/early-payment/terms',
    validateAccountingRequest(null),
    DiscountController.getEarlyPaymentTerms
);

/**
 * @route   GET /api/discounts/early-payment/terms/:id
 * @desc    Get specific term
 * @access  Private
 */
router.get(
    '/early-payment/terms/:id',
    validateAccountingRequest(null),
    DiscountController.getEarlyPaymentTermById
);

/**
 * @route   PUT /api/discounts/early-payment/terms/:id
 * @desc    Update terms
 * @access  Private
 */
router.put(
    '/early-payment/terms/:id',
    validateAccountingRequest(DiscountSchemas.earlyPaymentSchema),
    DiscountController.updateEarlyPaymentTerms
);

/**
 * @route   DELETE /api/discounts/early-payment/terms/:id
 * @desc    Soft delete terms
 * @access  Private
 */
router.delete(
    '/early-payment/terms/:id',
    validateAccountingRequest(null),
    DiscountController.deleteEarlyPaymentTerms
);

/**
 * @route   POST /api/discounts/early-payment/assign
 * @desc    Assign terms to a customer
 * @access  Private
 */
router.post(
    '/early-payment/assign',
    validateAccountingRequest(DiscountSchemas.assignTermsSchema),
    DiscountController.assignTermsToCustomer
);

/**
 * @route   GET /api/discounts/early-payment/customer/:customerId
 * @desc    Get terms assigned to a customer
 * @access  Private
 */
router.get(
    '/early-payment/customer/:customerId',
    validateAccountingRequest(null),
    DiscountController.getCustomerPaymentTerms
);

/**
 * @route   POST /api/discounts/early-payment/calculate
 * @desc    Calculate early payment discount for invoice
 * @access  Private
 */
router.post(
    '/early-payment/calculate',
    validateAccountingRequest(DiscountSchemas.calculateEarlyPaymentSchema),
    DiscountController.calculateEarlyPaymentDiscount
);

/**
 * @route   POST /api/discounts/early-payment/bulk
 * @desc    Bulk import early payment terms
 * @access  Private
 */
router.post(
    '/early-payment/bulk',
    validateAccountingRequest(null), // Manual validation in controller
    DiscountController.bulkImportEarlyPaymentTerms
);

/**
 * @route   GET /api/discounts/early-payment/export
 * @desc    Export terms to CSV
 * @access  Private
 */
router.get(
    '/early-payment/export',
    validateAccountingRequest(null),
    DiscountController.exportEarlyPaymentTerms
);

/**
 * @route   GET /api/discounts/early-payment/stats
 * @desc    Get early payment usage statistics
 * @access  Private
 */
router.get(
    '/early-payment/stats',
    validateAccountingRequest(null),
    DiscountController.getEarlyPaymentStats
);

/**
 * =====================================================
 * VOLUME DISCOUNTS
 * =====================================================
 */

/**
 * @route   POST /api/discounts/volume/tiers
 * @desc    Create volume discount tier
 * @access  Private
 */
router.post(
    '/volume/tiers',
    validateAccountingRequest(DiscountSchemas.volumeDiscountSchema),
    DiscountController.createVolumeTier
);

/**
 * @route   GET /api/discounts/volume/tiers
 * @desc    List all volume discount tiers
 * @access  Private
 */
router.get(
    '/volume/tiers',
    validateAccountingRequest(null),
    DiscountController.getVolumeTiers
);

/**
 * @route   GET /api/discounts/volume/tiers/:id
 * @desc    Get specific tier
 * @access  Private
 */
router.get(
    '/volume/tiers/:id',
    validateAccountingRequest(null),
    DiscountController.getVolumeTierById
);

/**
 * @route   PUT /api/discounts/volume/tiers/:id
 * @desc    Update tier
 * @access  Private
 */
router.put(
    '/volume/tiers/:id',
    validateAccountingRequest(DiscountSchemas.volumeDiscountSchema),
    DiscountController.updateVolumeTier
);

/**
 * @route   DELETE /api/discounts/volume/tiers/:id
 * @desc    Soft delete tier
 * @access  Private
 */
router.delete(
    '/volume/tiers/:id',
    validateAccountingRequest(null),
    DiscountController.deleteVolumeTier
);

/**
 * @route   POST /api/discounts/volume/calculate
 * @desc    Calculate volume discount for transaction
 * @access  Private
 */
router.post(
    '/volume/calculate',
    validateAccountingRequest(DiscountSchemas.calculateVolumeSchema),
    DiscountController.calculateVolumeDiscount
);

/**
 * @route   POST /api/discounts/volume/bulk
 * @desc    Bulk import volume tiers
 * @access  Private
 */
router.post(
    '/volume/bulk',
    validateAccountingRequest(null), // Manual validation in controller
    DiscountController.bulkImportVolumeTiers
);

/**
 * @route   GET /api/discounts/volume/export
 * @desc    Export tiers to CSV
 * @access  Private
 */
router.get(
    '/volume/export',
    validateAccountingRequest(null),
    DiscountController.exportVolumeTiers
);

/**
 * @route   GET /api/discounts/volume/stats
 * @desc    Get volume discount usage statistics
 * @access  Private
 */
router.get(
    '/volume/stats',
    validateAccountingRequest(null),
    DiscountController.getVolumeDiscountStats
);

/**
 * @route   GET /api/discounts/volume/top
 * @desc    Get top volume discount tiers
 * @access  Private
 */
router.get(
    '/volume/top',
    validateAccountingRequest(null),
    DiscountController.getTopVolumeTiers
);

/**
 * =====================================================
 * DISCOUNT ALLOCATIONS
 * =====================================================
 */

/**
 * @route   POST /api/discounts/allocations
 * @desc    Create a discount allocation
 * @access  Private
 */
router.post(
    '/allocations',
    validateAccountingRequest(DiscountSchemas.allocationSchema),
    DiscountController.createAllocation
);

/**
 * @route   GET /api/discounts/allocations
 * @desc    List allocations with filters
 * @access  Private
 */
router.get(
    '/allocations',
    validateAccountingRequest(null),
    DiscountController.getAllocations
);

/**
 * @route   GET /api/discounts/allocations/:id
 * @desc    Get allocation details with line items
 * @access  Private
 */
router.get(
    '/allocations/:id',
    validateAccountingRequest(null),
    DiscountController.getAllocationById
);

/**
 * @route   POST /api/discounts/allocations/:id/apply
 * @desc    Mark allocation as applied
 * @access  Private
 */
router.post(
    '/allocations/:id/apply',
    validateAccountingRequest(null),
    DiscountController.applyAllocation
);

/**
 * @route   POST /api/discounts/allocations/:id/void
 * @desc    Void an allocation (with reason)
 * @access  Private
 */
router.post(
    '/allocations/:id/void',
    validateAccountingRequest(DiscountSchemas.voidAllocationSchema),
    DiscountController.voidAllocation
);

/**
 * @route   GET /api/discounts/allocations/transaction/:transactionId
 * @desc    Get allocations for a specific transaction
 * @access  Private
 */
router.get(
    '/allocations/transaction/:transactionId',
    validateAccountingRequest(null),
    DiscountController.getTransactionAllocations
);

/**
 * @route   GET /api/discounts/allocations/report
 * @desc    Generate allocation report for period
 * @access  Private
 */
router.get(
    '/allocations/report',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountController.getAllocationReport
);

/**
 * @route   GET /api/discounts/allocations/unallocated
 * @desc    Find discounts applied but not allocated
 * @access  Private
 */
router.get(
    '/allocations/unallocated',
    validateAccountingRequest(null),
    DiscountController.getUnallocatedDiscounts
);

/**
 * @route   POST /api/discounts/allocations/bulk
 * @desc    Bulk create allocations
 * @access  Private
 */
router.post(
    '/allocations/bulk',
    validateAccountingRequest(null), // Manual validation in controller
    DiscountController.bulkCreateAllocations
);

/**
 * @route   GET /api/discounts/allocations/export
 * @desc    Export allocations to CSV
 * @access  Private
 */
router.get(
    '/allocations/export',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountController.exportAllocations
);

/**
 * =====================================================
 * DISCOUNT APPROVALS
 * =====================================================
 */

/**
 * @route   GET /api/discounts/approvals/pending
 * @desc    Get pending approvals for a business
 * @access  Private
 */
router.get(
    '/approvals/pending',
    validateAccountingRequest(null),
    DiscountController.getPendingApprovals
);

/**
 * @route   GET /api/discounts/approvals/:id
 * @desc    Get approval details
 * @access  Private
 */
router.get(
    '/approvals/:id',
    validateAccountingRequest(null),
    DiscountController.getApprovalById
);

/**
 * @route   POST /api/discounts/approvals/:id/approve
 * @desc    Approve a discount request
 * @access  Private
 */
router.post(
    '/approvals/:id/approve',
    validateAccountingRequest(DiscountSchemas.approvalDecisionSchema),
    DiscountController.approveDiscount
);

/**
 * @route   POST /api/discounts/approvals/:id/reject
 * @desc    Reject a discount request
 * @access  Private
 */
router.post(
    '/approvals/:id/reject',
    validateAccountingRequest(DiscountSchemas.approvalDecisionSchema),
    DiscountController.rejectDiscount
);

/**
 * =====================================================
 * TEST ENDPOINT
 * =====================================================
 */

/**
 * @route   GET /api/discounts/test
 * @desc    Test discount controller
 * @access  Private
 */
router.get(
    '/test',
    validateAccountingRequest(null),
    DiscountController.testController
);

/**
 * @route   GET /api/discounts/health
 * @desc    Check discount system health
 * @access  Private
 */
router.get(
    '/health',
    validateAccountingRequest(null),
    DiscountController.testController
);

export default router;
