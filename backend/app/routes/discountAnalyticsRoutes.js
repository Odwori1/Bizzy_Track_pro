// File: backend/app/routes/discountAnalyticsRoutes.js
// PURPOSE: Define all discount analytics and reporting routes
// PHASE 10.10: Following patterns from accountingRoutes.js
// USING: validateAccountingRequest middleware for consistency

import express from 'express';
import { DiscountAnalyticsController } from '../controllers/discountAnalyticsController.js';
import { validateAccountingRequest } from '../middleware/accountingValidation.js';
import { DiscountSchemas } from '../schemas/discountSchemas.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * =====================================================
 * USAGE METRICS ENDPOINTS
 * =====================================================
 */

/**
 * @route   GET /api/discounts/analytics/usage
 * @desc    Get usage metrics for a period
 * @access  Private
 */
router.get(
    '/usage',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountAnalyticsController.getUsageMetrics
);

/**
 * @route   GET /api/discounts/analytics/usage-by-type
 * @desc    Get usage breakdown by discount type
 * @access  Private
 */
router.get(
    '/usage-by-type',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountAnalyticsController.getUsageByType
);

/**
 * @route   GET /api/discounts/analytics/usage-by-rule
 * @desc    Get per-rule usage statistics
 * @access  Private
 */
router.get(
    '/usage-by-rule',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountAnalyticsController.getUsageByRule
);

/**
 * @route   GET /api/discounts/analytics/average-percentage
 * @desc    Get average discount percentage over period
 * @access  Private
 */
router.get(
    '/average-percentage',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountAnalyticsController.getAverageDiscountPercentage
);

/**
 * =====================================================
 * FINANCIAL IMPACT ENDPOINTS
 * =====================================================
 */

/**
 * @route   GET /api/discounts/analytics/impact
 * @desc    Get financial impact analysis
 * @access  Private
 */
router.get(
    '/impact',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountAnalyticsController.getFinancialImpact
);

/**
 * @route   GET /api/discounts/analytics/margin
 * @desc    Get margin impact analysis with custom margin
 * @access  Private
 */
router.get(
    '/margin',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountAnalyticsController.getMarginImpact
);

/**
 * @route   GET /api/discounts/analytics/revenue-erosion
 * @desc    Get revenue erosion analysis
 * @access  Private
 */
router.get(
    '/revenue-erosion',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountAnalyticsController.getRevenueErosion
);

/**
 * @route   GET /api/discounts/analytics/impact-by-category
 * @desc    Get impact by product category
 * @access  Private
 */
router.get(
    '/impact-by-category',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountAnalyticsController.getImpactByCategory
);

/**
 * @route   GET /api/discounts/analytics/segments
 * @desc    Analyze discount impact by customer segment
 * @access  Private
 */
router.get(
    '/segments',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountAnalyticsController.getImpactByCustomerSegment
);

/**
 * =====================================================
 * CUSTOMER BEHAVIOR ENDPOINTS
 * =====================================================
 */

/**
 * @route   GET /api/discounts/analytics/customer/:customerId
 * @desc    Get discount behavior for specific customer
 * @access  Private
 */
router.get(
    '/customer/:customerId',
    validateAccountingRequest(null),
    DiscountAnalyticsController.getCustomerDiscountBehavior
);

/**
 * @route   GET /api/discounts/analytics/sensitive-customers
 * @desc    Identify discount-sensitive customers
 * @access  Private
 */
router.get(
    '/sensitive-customers',
    validateAccountingRequest(null),
    DiscountAnalyticsController.getDiscountSensitiveCustomers
);

/**
 * @route   GET /api/discounts/analytics/clv/:customerId
 * @desc    Calculate customer lifetime value with discounts
 * @access  Private
 */
router.get(
    '/clv/:customerId',
    validateAccountingRequest(null),
    DiscountAnalyticsController.calculateCustomerCLV
);

/**
 * =====================================================
 * PROMOTION ROI & EFFECTIVENESS
 * =====================================================
 */

/**
 * @route   GET /api/discounts/analytics/roi/:promoId
 * @desc    Calculate ROI for a specific promotion
 * @access  Private
 */
router.get(
    '/roi/:promoId',
    validateAccountingRequest(null),
    DiscountAnalyticsController.calculatePromotionROI
);

/**
 * @route   GET /api/discounts/analytics/cost-effective
 * @desc    Get most cost-effective discounts
 * @access  Private
 */
router.get(
    '/cost-effective',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountAnalyticsController.getCostEffectiveDiscounts
);

/**
 * @route   GET /api/discounts/analytics/top
 * @desc    Get top performing discounts
 * @access  Private
 */
router.get(
    '/top',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountAnalyticsController.getTopDiscounts
);

/**
 * =====================================================
 * RECOMMENDATIONS & INSIGHTS
 * =====================================================
 */

/**
 * @route   GET /api/discounts/analytics/recommendations
 * @desc    Get intelligent discount recommendations
 * @access  Private
 */
router.get(
    '/recommendations',
    validateAccountingRequest(null),
    DiscountAnalyticsController.getDiscountRecommendations
);

/**
 * =====================================================
 * DATA REFRESH & MAINTENANCE
 * =====================================================
 */

/**
 * @route   POST /api/discounts/analytics/refresh
 * @desc    Manually trigger daily analytics refresh
 * @access  Private (Admin/Owner only)
 */
router.post(
    '/refresh',
    validateAccountingRequest(null),
    DiscountAnalyticsController.refreshAnalytics
);

/**
 * @route   GET /api/discounts/analytics/export
 * @desc    Export analytics data to CSV
 * @access  Private
 */
router.get(
    '/export',
    validateAccountingRequest(DiscountSchemas.dateRangeSchema),
    DiscountAnalyticsController.exportAnalytics
);

/**
 * =====================================================
 * DASHBOARD ENDPOINTS
 * =====================================================
 */

/**
 * @route   GET /api/discounts/analytics/dashboard
 * @desc    Get complete analytics dashboard overview
 * @access  Private
 */
router.get(
    '/dashboard',
    validateAccountingRequest(null),
    DiscountAnalyticsController.getAnalyticsDashboard
);

/**
 * =====================================================
 * TEST ENDPOINT
 * =====================================================
 */

/**
 * @route   GET /api/discounts/analytics/test
 * @desc    Test analytics controller
 * @access  Private
 */
router.get(
    '/test',
    validateAccountingRequest(null),
    DiscountAnalyticsController.testController
);

/**
 * @route   GET /api/discounts/analytics/health
 * @desc    Check analytics system health
 * @access  Private
 */
router.get(
    '/health',
    validateAccountingRequest(null),
    DiscountAnalyticsController.testController
);

export default router;
