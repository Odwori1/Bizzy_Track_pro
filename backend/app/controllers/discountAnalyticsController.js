// File: backend/app/controllers/discountAnalyticsController.js
// PURPOSE: Handle all discount analytics and reporting HTTP requests
// PHASE 10.10: Following patterns from accountingController.js

import { DiscountAnalyticsService } from '../services/discountAnalyticsService.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

/**
 * DISCOUNT ANALYTICS CONTROLLER
 * Following patterns from accountingController.js
 * All methods are static - no instance state
 */
export class DiscountAnalyticsController {

    // =====================================================
    // SECTION 1: USAGE METRICS
    // =====================================================

    /**
     * GET /api/discounts/analytics/usage
     * Get usage metrics for a period
     */
    static async getUsageMetrics(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Both startDate and endDate are required'
                });
            }

            log.info('Getting discount usage metrics', {
                businessId,
                startDate,
                endDate
            });

            const metrics = await DiscountAnalyticsService.getUsageMetrics(
                businessId,
                new Date(startDate),
                new Date(endDate)
            );

            return res.json({
                success: true,
                data: metrics,
                message: 'Usage metrics retrieved successfully'
            });

        } catch (error) {
            log.error('Error getting usage metrics:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get usage metrics',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/analytics/usage-by-type
     * Get usage breakdown by discount type
     */
    static async getUsageByType(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Both startDate and endDate are required'
                });
            }

            log.info('Getting usage by type', {
                businessId,
                startDate,
                endDate
            });

            const usageByType = await DiscountAnalyticsService.getUsageByType(
                businessId,
                new Date(startDate),
                new Date(endDate)
            );

            return res.json({
                success: true,
                data: usageByType,
                message: 'Usage by type retrieved successfully'
            });

        } catch (error) {
            log.error('Error getting usage by type:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get usage by type',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/analytics/usage-by-rule
     * Get per-rule usage statistics
     */
    static async getUsageByRule(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate, limit = 20 } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Both startDate and endDate are required'
                });
            }

            log.info('Getting usage by rule', {
                businessId,
                startDate,
                endDate,
                limit: parseInt(limit)
            });

            const usageByRule = await DiscountAnalyticsService.getUsageByRule(
                businessId,
                new Date(startDate),
                new Date(endDate),
                parseInt(limit)
            );

            return res.json({
                success: true,
                data: usageByRule,
                message: 'Usage by rule retrieved successfully'
            });

        } catch (error) {
            log.error('Error getting usage by rule:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get usage by rule',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/analytics/average-percentage
     * Get average discount percentage over period
     */
    static async getAverageDiscountPercentage(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Both startDate and endDate are required'
                });
            }

            log.info('Getting average discount percentage', {
                businessId,
                startDate,
                endDate
            });

            const average = await DiscountAnalyticsService.getAverageDiscountPercentage(
                businessId,
                new Date(startDate),
                new Date(endDate)
            );

            return res.json({
                success: true,
                data: { averageDiscountPercentage: average },
                message: 'Average discount percentage retrieved'
            });

        } catch (error) {
            log.error('Error getting average discount percentage:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get average discount percentage',
                details: error.message
            });
        }
    }

    // =====================================================
    // SECTION 2: FINANCIAL IMPACT
    // =====================================================

    /**
     * GET /api/discounts/analytics/impact
     * Get financial impact analysis
     */
    static async getFinancialImpact(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Both startDate and endDate are required'
                });
            }

            log.info('Getting financial impact analysis', {
                businessId,
                startDate,
                endDate
            });

            // Calculate revenue erosion
            const revenueErosion = await DiscountAnalyticsService.calculateRevenueErosion(
                businessId,
                new Date(startDate),
                new Date(endDate)
            );

            // Calculate margin impact with default margin of 30%
            const marginImpact = await DiscountAnalyticsService.calculateMarginImpact(
                businessId,
                new Date(startDate),
                new Date(endDate),
                30
            );

            return res.json({
                success: true,
                data: {
                    period: { startDate, endDate },
                    revenueErosion,
                    marginImpact
                },
                message: 'Financial impact analysis retrieved'
            });

        } catch (error) {
            log.error('Error getting financial impact:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get financial impact analysis',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/analytics/margin
     * Get margin impact analysis with custom margin
     */
    static async getMarginImpact(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate, averageMargin = 30 } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Both startDate and endDate are required'
                });
            }

            log.info('Getting margin impact analysis', {
                businessId,
                startDate,
                endDate,
                averageMargin: parseFloat(averageMargin)
            });

            const marginImpact = await DiscountAnalyticsService.calculateMarginImpact(
                businessId,
                new Date(startDate),
                new Date(endDate),
                parseFloat(averageMargin)
            );

            return res.json({
                success: true,
                data: marginImpact,
                message: 'Margin impact analysis retrieved'
            });

        } catch (error) {
            log.error('Error getting margin impact:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get margin impact analysis',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/analytics/revenue-erosion
     * Get revenue erosion analysis
     */
    static async getRevenueErosion(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Both startDate and endDate are required'
                });
            }

            log.info('Getting revenue erosion analysis', {
                businessId,
                startDate,
                endDate
            });

            const revenueErosion = await DiscountAnalyticsService.calculateRevenueErosion(
                businessId,
                new Date(startDate),
                new Date(endDate)
            );

            return res.json({
                success: true,
                data: revenueErosion,
                message: 'Revenue erosion analysis retrieved'
            });

        } catch (error) {
            log.error('Error getting revenue erosion:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get revenue erosion analysis',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/analytics/impact-by-category
     * Get impact by product category
     */
    static async getImpactByCategory(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Both startDate and endDate are required'
                });
            }

            log.info('Getting impact by category', {
                businessId,
                startDate,
                endDate
            });

            const impactByCategory = await DiscountAnalyticsService.getImpactByCategory(
                businessId,
                new Date(startDate),
                new Date(endDate)
            );

            return res.json({
                success: true,
                data: impactByCategory,
                message: 'Impact by category retrieved'
            });

        } catch (error) {
            log.error('Error getting impact by category:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get impact by category',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/analytics/segments
     * Analyze discount impact by customer segment
     */
    static async getImpactByCustomerSegment(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Both startDate and endDate are required'
                });
            }

            log.info('Getting impact by customer segment', {
                businessId,
                startDate,
                endDate
            });

            const impactBySegment = await DiscountAnalyticsService.getImpactByCustomerSegment(
                businessId,
                new Date(startDate),
                new Date(endDate)
            );

            return res.json({
                success: true,
                data: impactBySegment,
                message: 'Impact by customer segment retrieved'
            });

        } catch (error) {
            log.error('Error getting impact by segment:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get impact by customer segment',
                details: error.message
            });
        }
    }

    // =====================================================
    // SECTION 3: CUSTOMER BEHAVIOR ANALYSIS
    // =====================================================

    /**
     * GET /api/discounts/analytics/customer/:customerId
     * Get discount behavior for specific customer
     */
    static async getCustomerDiscountBehavior(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { customerId } = req.params;
            const { startDate, endDate } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!customerId) {
                return res.status(400).json({
                    success: false,
                    message: 'Customer ID is required'
                });
            }

            log.info('Getting customer discount behavior', {
                businessId,
                customerId,
                startDate,
                endDate
            });

            const behavior = await DiscountAnalyticsService.getCustomerDiscountBehavior(
                businessId,
                customerId,
                startDate && endDate ? {
                    startDate: new Date(startDate),
                    endDate: new Date(endDate)
                } : undefined
            );

            return res.json({
                success: true,
                data: behavior,
                message: 'Customer discount behavior retrieved'
            });

        } catch (error) {
            log.error('Error getting customer behavior:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get customer discount behavior',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/analytics/sensitive-customers
     * Identify discount-sensitive customers
     */
    static async getDiscountSensitiveCustomers(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { minTransactions = 3, threshold = 50 } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Identifying discount-sensitive customers', {
                businessId,
                minTransactions: parseInt(minTransactions),
                threshold: parseInt(threshold)
            });

            const sensitiveCustomers = await DiscountAnalyticsService.identifyDiscountSensitiveCustomers(
                businessId,
                parseInt(minTransactions),
                parseInt(threshold)
            );

            return res.json({
                success: true,
                data: sensitiveCustomers,
                message: 'Discount-sensitive customers identified'
            });

        } catch (error) {
            log.error('Error identifying sensitive customers:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to identify discount-sensitive customers',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/analytics/clv/:customerId
     * Calculate customer lifetime value with discounts
     */
    static async calculateCustomerCLV(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { customerId } = req.params;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!customerId) {
                return res.status(400).json({
                    success: false,
                    message: 'Customer ID is required'
                });
            }

            log.info('Calculating customer CLV with discounts', {
                businessId,
                customerId
            });

            const clv = await DiscountAnalyticsService.calculateCLVWithDiscounts(
                businessId,
                customerId
            );

            return res.json({
                success: true,
                data: clv,
                message: 'Customer lifetime value calculated'
            });

        } catch (error) {
            log.error('Error calculating CLV:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to calculate customer lifetime value',
                details: error.message
            });
        }
    }

    // =====================================================
    // SECTION 4: PROMOTION ROI & EFFECTIVENESS
    // =====================================================

    /**
     * GET /api/discounts/analytics/roi/:promoId
     * Calculate ROI for a specific promotion
     */
    static async calculatePromotionROI(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { promoId } = req.params;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!promoId) {
                return res.status(400).json({
                    success: false,
                    message: 'Promotion ID is required'
                });
            }

            log.info('Calculating promotion ROI', {
                businessId,
                promoId
            });

            const roi = await DiscountAnalyticsService.calculatePromotionROI(
                businessId,
                promoId
            );

            return res.json({
                success: true,
                data: roi,
                message: 'Promotion ROI calculated'
            });

        } catch (error) {
            log.error('Error calculating promotion ROI:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to calculate promotion ROI',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/analytics/cost-effective
     * Get most cost-effective discounts
     */
    static async getCostEffectiveDiscounts(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate, limit = 10 } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Both startDate and endDate are required'
                });
            }

            log.info('Getting cost-effective discounts', {
                businessId,
                startDate,
                endDate,
                limit: parseInt(limit)
            });

            const costEffective = await DiscountAnalyticsService.getCostEffectiveDiscounts(
                businessId,
                new Date(startDate),
                new Date(endDate),
                parseInt(limit)
            );

            return res.json({
                success: true,
                data: costEffective,
                message: 'Cost-effective discounts retrieved'
            });

        } catch (error) {
            log.error('Error getting cost-effective discounts:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get cost-effective discounts',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/analytics/top
     * Get top performing discounts
     */
    static async getTopDiscounts(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate, limit = 10 } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Both startDate and endDate are required'
                });
            }

            log.info('Getting top performing discounts', {
                businessId,
                startDate,
                endDate,
                limit: parseInt(limit)
            });

            // This would need a dedicated service method
            // For now, we can use getUsageByRule with sorting
            const usageByRule = await DiscountAnalyticsService.getUsageByRule(
                businessId,
                new Date(startDate),
                new Date(endDate),
                parseInt(limit)
            );

            return res.json({
                success: true,
                data: usageByRule,
                message: 'Top performing discounts retrieved'
            });

        } catch (error) {
            log.error('Error getting top discounts:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get top discounts',
                details: error.message
            });
        }
    }

    // =====================================================
    // SECTION 5: RECOMMENDATIONS & INSIGHTS
    // =====================================================

    /**
     * GET /api/discounts/analytics/recommendations
     * Get intelligent discount recommendations
     */
    static async getDiscountRecommendations(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Generating discount recommendations', { businessId });

            const recommendations = await DiscountAnalyticsService.generateRecommendations(
                businessId
            );

            return res.json({
                success: true,
                data: recommendations,
                message: 'Discount recommendations generated'
            });

        } catch (error) {
            log.error('Error generating recommendations:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate discount recommendations',
                details: error.message
            });
        }
    }

    // =====================================================
    // SECTION 6: DATA REFRESH & MAINTENANCE
    // =====================================================

    /**
     * POST /api/discounts/analytics/refresh
     * Manually trigger daily analytics refresh
     */
    static async refreshAnalytics(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { date } = req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            const refreshDate = date ? new Date(date) : new Date();

            log.info('Refreshing discount analytics', {
                businessId,
                userId,
                date: refreshDate.toISOString().split('T')[0]
            });

            // Check permissions - only admin/owner can refresh
            if (!['owner', 'admin'].includes(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Permission denied. Only owners and admins can refresh analytics.'
                });
            }

            const result = await DiscountAnalyticsService.updateDailyAnalytics(
                businessId,
                refreshDate
            );

            // Log audit trail
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'discount_analytics.refreshed',
                resourceType: 'discount_analytics',
                resourceId: null,
                newValues: {
                    date: refreshDate.toISOString().split('T')[0],
                    success: result
                }
            });

            return res.json({
                success: true,
                data: { refreshed: result, date: refreshDate },
                message: result ?
                    'Analytics refreshed successfully' :
                    'No data available for the specified date'
            });

        } catch (error) {
            log.error('Error refreshing analytics:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to refresh analytics',
                details: error.message
            });
        }
    }

    // =====================================================
    // SECTION 7: DASHBOARD OVERVIEW
    // =====================================================

    /**
     * GET /api/discounts/analytics/dashboard
     * Get complete analytics dashboard overview
     */
    static async getAnalyticsDashboard(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { period = 'month' } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            // Calculate date range based on period
            const endDate = new Date();
            const startDate = new Date();

            switch (period) {
                case 'week':
                    startDate.setDate(startDate.getDate() - 7);
                    break;
                case 'month':
                    startDate.setMonth(startDate.getMonth() - 1);
                    break;
                case 'quarter':
                    startDate.setMonth(startDate.getMonth() - 3);
                    break;
                case 'year':
                    startDate.setFullYear(startDate.getFullYear() - 1);
                    break;
                default:
                    startDate.setMonth(startDate.getMonth() - 1);
            }

            log.info('Getting analytics dashboard', {
                businessId,
                period,
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0]
            });

            // Gather all dashboard data in parallel
            const [
                usageMetrics,
                usageByType,
                topDiscounts,
                revenueErosion,
                marginImpact,
                sensitiveCustomers
            ] = await Promise.all([
                DiscountAnalyticsService.getUsageMetrics(businessId, startDate, endDate),
                DiscountAnalyticsService.getUsageByType(businessId, startDate, endDate),
                DiscountAnalyticsService.getUsageByRule(businessId, startDate, endDate, 5),
                DiscountAnalyticsService.calculateRevenueErosion(businessId, startDate, endDate),
                DiscountAnalyticsService.calculateMarginImpact(businessId, startDate, endDate, 30),
                DiscountAnalyticsService.identifyDiscountSensitiveCustomers(businessId, 3, 50)
            ]);

            const dashboard = {
                period: {
                    type: period,
                    startDate: startDate.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0]
                },
                summary: usageMetrics,
                breakdownByType: usageByType,
                topDiscounts: topDiscounts.slice(0, 5),
                financialImpact: {
                    revenueErosion,
                    marginImpact
                },
                customerInsights: {
                    sensitiveCustomers: sensitiveCustomers.slice(0, 5),
                    totalSensitiveCustomers: sensitiveCustomers.length
                }
            };

            return res.json({
                success: true,
                data: dashboard,
                message: 'Analytics dashboard retrieved'
            });

        } catch (error) {
            log.error('Error getting analytics dashboard:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get analytics dashboard',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/analytics/export
     * Export analytics data to CSV
     */
    static async exportAnalytics(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate, type = 'usage' } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Both startDate and endDate are required'
                });
            }

            log.info('Exporting analytics', {
                businessId,
                startDate,
                endDate,
                type
            });

            let data;
            let filename;

            switch (type) {
                case 'usage':
                    data = await DiscountAnalyticsService.getUsageByRule(
                        businessId,
                        new Date(startDate),
                        new Date(endDate),
                        1000
                    );
                    filename = `discount_usage_${startDate}_to_${endDate}`;
                    break;

                case 'customers':
                    data = await DiscountAnalyticsService.identifyDiscountSensitiveCustomers(
                        businessId,
                        1,
                        0
                    );
                    filename = `discount_sensitive_customers_${startDate}_to_${endDate}`;
                    break;

                default:
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid export type. Must be "usage" or "customers"'
                    });
            }

            // Convert to CSV
            if (!data || data.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No data found for the specified period'
                });
            }

            const headers = Object.keys(data[0]).join(',');
            const rows = data.map(row => Object.values(row).join(','));
            const csv = [headers, ...rows].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${filename}_${businessId}.csv"`
            );

            return res.send(csv);

        } catch (error) {
            log.error('Error exporting analytics:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to export analytics',
                details: error.message
            });
        }
    }

    // =====================================================
    // SECTION 8: TEST ENDPOINT
    // =====================================================

    /**
     * GET /api/discounts/analytics/test
     * Test analytics controller
     */
    static async testController(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            return res.json({
                success: true,
                data: {
                    businessId,
                    timestamp: new Date().toISOString(),
                    status: 'Discount analytics controller is operational',
                    features: [
                        'Usage metrics',
                        'Financial impact analysis',
                        'Customer behavior analysis',
                        'Promotion ROI calculation',
                        'Discount recommendations',
                        'Analytics dashboard',
                        'Data export'
                    ],
                    availableEndpoints: [
                        'GET /api/discounts/analytics/usage',
                        'GET /api/discounts/analytics/usage-by-type',
                        'GET /api/discounts/analytics/impact',
                        'GET /api/discounts/analytics/margin',
                        'GET /api/discounts/analytics/customer/:customerId',
                        'GET /api/discounts/analytics/sensitive-customers',
                        'GET /api/discounts/analytics/roi/:promoId',
                        'GET /api/discounts/analytics/cost-effective',
                        'GET /api/discounts/analytics/recommendations',
                        'GET /api/discounts/analytics/dashboard',
                        'POST /api/discounts/analytics/refresh'
                    ]
                },
                message: 'Discount analytics system is working correctly'
            });

        } catch (error) {
            log.error('Analytics controller test failed:', error);
            return res.status(500).json({
                success: false,
                error: 'Analytics controller test failed',
                details: error.message
            });
        }
    }
}

export default DiscountAnalyticsController;
