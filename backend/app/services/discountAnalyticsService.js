// File: ~/Bizzy_Track_pro/backend/app/services/discountAnalyticsService.js
// PURPOSE: Track discount effectiveness and generate insights
// PHASE 10.8: FINAL VERSION - Fixed GROUP BY issues and added missing methods

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';
import { DiscountCore } from './discountCore.js';

export class DiscountAnalyticsService {

    /**
     * =====================================================
     * SECTION 1: USAGE METRICS
     * =====================================================
     */

    /**
     * Get overall usage metrics for a period
     */
    static async getUsageMetrics(businessId, startDate, endDate) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT
                    COUNT(DISTINCT analysis_date) as days_with_data,
                    COALESCE(SUM(times_used), 0) as total_uses,
                    COALESCE(SUM(total_discount_amount), 0) as total_discounts_given,
                    COALESCE(SUM(total_invoice_amount), 0) as total_invoice_amount,
                    COALESCE(SUM(unique_customers), 0) as total_unique_customers,
                    COALESCE(AVG(times_used), 0) as avg_daily_uses
                 FROM discount_analytics
                 WHERE business_id = $1
                    AND analysis_date BETWEEN $2 AND $3`,
                [businessId, startDate, endDate]
            );

            const stats = result.rows[0] || {
                days_with_data: 0,
                total_uses: 0,
                total_discounts_given: 0,
                total_invoice_amount: 0,
                total_unique_customers: 0,
                avg_daily_uses: 0
            };

            // Calculate derived metrics
            const avgDiscountPercent = stats.total_invoice_amount > 0
                ? (stats.total_discounts_given / stats.total_invoice_amount) * 100
                : 0;

            return {
                period: { startDate, endDate },
                summary: {
                    days_with_data: parseInt(stats.days_with_data) || 0,
                    total_uses: parseFloat(stats.total_uses) || 0,
                    total_discounts_given: parseFloat(stats.total_discounts_given) || 0,
                    total_invoice_amount: parseFloat(stats.total_invoice_amount) || 0,
                    total_unique_customers: parseInt(stats.total_unique_customers) || 0,
                    avg_daily_uses: parseFloat(stats.avg_daily_uses) || 0,
                    avg_discount_percentage: Math.round(avgDiscountPercent * 100) / 100,
                    discount_to_invoice_ratio: stats.total_invoice_amount > 0
                        ? (stats.total_discounts_given / stats.total_invoice_amount).toFixed(4)
                        : 0
                }
            };

        } catch (error) {
            log.error('Error getting usage metrics', { error: error.message, businessId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get usage breakdown by discount type
     */
    static async getUsageByType(businessId, startDate, endDate) {
        const client = await getClient();

        try {
            // Get promotional discounts
            const promoResult = await client.query(
                `SELECT
                    COUNT(*) as usage_count,
                    COALESCE(SUM(total_discount_amount), 0) as total_discount,
                    COALESCE(SUM(unique_customers), 0) as total_customers
                 FROM discount_analytics
                 WHERE business_id = $1
                    AND promotional_discount_id IS NOT NULL
                    AND analysis_date BETWEEN $2 AND $3`,
                [businessId, startDate, endDate]
            );

            // Get volume discounts (via discount_rule_id)
            const volumeResult = await client.query(
                `SELECT
                    COUNT(*) as usage_count,
                    COALESCE(SUM(total_discount_amount), 0) as total_discount,
                    COALESCE(SUM(unique_customers), 0) as total_customers
                 FROM discount_analytics da
                 WHERE da.business_id = $1
                    AND da.discount_rule_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM volume_discount_tiers vdt
                        WHERE vdt.id = da.discount_rule_id
                    )
                    AND da.analysis_date BETWEEN $2 AND $3`,
                [businessId, startDate, endDate]
            );

            // Get early payment discounts (via discount_rule_id)
            const earlyResult = await client.query(
                `SELECT
                    COUNT(*) as usage_count,
                    COALESCE(SUM(total_discount_amount), 0) as total_discount,
                    COALESCE(SUM(unique_customers), 0) as total_customers
                 FROM discount_analytics da
                 WHERE da.business_id = $1
                    AND da.discount_rule_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM early_payment_terms ept
                        WHERE ept.id = da.discount_rule_id
                    )
                    AND da.analysis_date BETWEEN $2 AND $3`,
                [businessId, startDate, endDate]
            );

            // Get category discounts (via discount_rule_id)
            const categoryResult = await client.query(
                `SELECT
                    COUNT(*) as usage_count,
                    COALESCE(SUM(total_discount_amount), 0) as total_discount,
                    COALESCE(SUM(unique_customers), 0) as total_customers
                 FROM discount_analytics da
                 WHERE da.business_id = $1
                    AND da.discount_rule_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM category_discount_rules cdr
                        WHERE cdr.id = da.discount_rule_id
                    )
                    AND da.analysis_date BETWEEN $2 AND $3`,
                [businessId, startDate, endDate]
            );

            // Combine results
            const results = [
                {
                    discount_type: 'PROMOTIONAL',
                    usage_count: parseInt(promoResult.rows[0].usage_count) || 0,
                    total_discount: parseFloat(promoResult.rows[0].total_discount) || 0,
                    total_customers: parseInt(promoResult.rows[0].total_customers) || 0
                },
                {
                    discount_type: 'VOLUME',
                    usage_count: parseInt(volumeResult.rows[0].usage_count) || 0,
                    total_discount: parseFloat(volumeResult.rows[0].total_discount) || 0,
                    total_customers: parseInt(volumeResult.rows[0].total_customers) || 0
                },
                {
                    discount_type: 'EARLY_PAYMENT',
                    usage_count: parseInt(earlyResult.rows[0].usage_count) || 0,
                    total_discount: parseFloat(earlyResult.rows[0].total_discount) || 0,
                    total_customers: parseInt(earlyResult.rows[0].total_customers) || 0
                },
                {
                    discount_type: 'CATEGORY',
                    usage_count: parseInt(categoryResult.rows[0].usage_count) || 0,
                    total_discount: parseFloat(categoryResult.rows[0].total_discount) || 0,
                    total_customers: parseInt(categoryResult.rows[0].total_customers) || 0
                }
            ].filter(r => r.usage_count > 0);

            // Add percentage calculations
            const totalDiscount = results.reduce((sum, r) => sum + r.total_discount, 0);

            return results.map(r => ({
                ...r,
                percentage_of_total: totalDiscount > 0
                    ? Math.round((r.total_discount / totalDiscount) * 100)
                    : 0
            }));

        } catch (error) {
            log.error('Error getting usage by type', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get usage by specific discount rule
     * FIXED: Handle category discount rules without name column
     */
    static async getUsageByRule(businessId, startDate, endDate) {
        const client = await getClient();

        try {
            const result = await client.query(
                `WITH rule_usage AS (
                    SELECT
                        da.discount_rule_id,
                        da.promotional_discount_id,
                        SUM(da.times_used) as total_uses,
                        SUM(da.total_discount_amount) as total_discount,
                        SUM(da.unique_customers) as unique_customers,
                        AVG(da.total_discount_amount / NULLIF(da.total_invoice_amount, 0)) * 100 as avg_discount_percent
                    FROM discount_analytics da
                    WHERE da.business_id = $1
                        AND da.analysis_date BETWEEN $2 AND $3
                        AND (da.discount_rule_id IS NOT NULL OR da.promotional_discount_id IS NOT NULL)
                    GROUP BY da.discount_rule_id, da.promotional_discount_id
                )
                SELECT
                    COALESCE(ru.discount_rule_id, ru.promotional_discount_id) as rule_id,
                    CASE
                        WHEN ru.promotional_discount_id IS NOT NULL THEN pd.promo_code
                        WHEN vdt.id IS NOT NULL THEN vdt.tier_name
                        WHEN ept.id IS NOT NULL THEN ept.term_name
                        WHEN cdr.id IS NOT NULL THEN 'Category Discount'
                    END as rule_name,
                    CASE
                        WHEN ru.promotional_discount_id IS NOT NULL THEN 'PROMOTIONAL'
                        WHEN vdt.id IS NOT NULL THEN 'VOLUME'
                        WHEN ept.id IS NOT NULL THEN 'EARLY_PAYMENT'
                        WHEN cdr.id IS NOT NULL THEN 'CATEGORY'
                    END as rule_type,
                    ru.total_uses,
                    ru.total_discount,
                    ru.unique_customers,
                    ru.avg_discount_percent
                FROM rule_usage ru
                LEFT JOIN promotional_discounts pd ON ru.promotional_discount_id = pd.id
                LEFT JOIN volume_discount_tiers vdt ON ru.discount_rule_id = vdt.id
                LEFT JOIN early_payment_terms ept ON ru.discount_rule_id = ept.id
                LEFT JOIN category_discount_rules cdr ON ru.discount_rule_id = cdr.id
                ORDER BY ru.total_discount DESC NULLS LAST`,
                [businessId, startDate, endDate]
            );

            return result.rows;

        } catch (error) {
            log.error('Error getting usage by rule', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get average discount percentage over period
     */
    static async getAverageDiscountPercentage(businessId, period = 'month') {
        const client = await getClient();

        try {
            const { startDate, endDate } = DiscountCore.getDateRange(period);

            const result = await client.query(
                `SELECT
                    COALESCE(AVG(total_discount_amount / NULLIF(total_invoice_amount, 0)) * 100, 0) as avg_percentage,
                    COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_discount_amount / NULLIF(total_invoice_amount, 0)) * 100, 0) as median_percentage,
                    COALESCE(MIN(total_discount_amount / NULLIF(total_invoice_amount, 0)) * 100, 0) as min_percentage,
                    COALESCE(MAX(total_discount_amount / NULLIF(total_invoice_amount, 0)) * 100, 0) as max_percentage
                 FROM discount_analytics
                 WHERE business_id = $1
                    AND analysis_date BETWEEN $2 AND $3
                    AND total_invoice_amount > 0`,
                [businessId, startDate, endDate]
            );

            return {
                period,
                startDate,
                endDate,
                avg_percentage: parseFloat(result.rows[0].avg_percentage) || 0,
                median_percentage: parseFloat(result.rows[0].median_percentage) || 0,
                min_percentage: parseFloat(result.rows[0].min_percentage) || 0,
                max_percentage: parseFloat(result.rows[0].max_percentage) || 0
            };

        } catch (error) {
            log.error('Error getting average discount percentage', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 2: FINANCIAL IMPACT
     * =====================================================
     */

    /**
     * Calculate margin impact of discounts
     */
    static async calculateMarginImpact(businessId, period = 'month', averageMargin = 30) {
        const client = await getClient();

        try {
            const { startDate, endDate } = DiscountCore.getDateRange(period);

            const result = await client.query(
                `SELECT
                    COALESCE(SUM(total_discount_amount), 0) as total_discounts,
                    COALESCE(SUM(total_invoice_amount), 0) as total_revenue,
                    COUNT(DISTINCT analysis_date) as days
                 FROM discount_analytics
                 WHERE business_id = $1
                    AND analysis_date BETWEEN $2 AND $3`,
                [businessId, startDate, endDate]
            );

            const stats = result.rows[0];
            const totalDiscounts = parseFloat(stats.total_discounts || 0);
            const totalRevenue = parseFloat(stats.total_revenue || 0);

            // Calculate impact
            const revenueWithoutDiscounts = totalRevenue + totalDiscounts;
            const expectedProfit = revenueWithoutDiscounts * (averageMargin / 100);
            const actualProfit = (totalRevenue * (averageMargin / 100));
            const profitLoss = actualProfit - expectedProfit;

            return {
                period: { startDate, endDate },
                average_margin_assumed: averageMargin,
                total_discounts_given: totalDiscounts,
                total_revenue_after_discounts: totalRevenue,
                total_revenue_before_discounts: revenueWithoutDiscounts,
                expected_profit: Math.round(expectedProfit * 100) / 100,
                actual_profit: Math.round(actualProfit * 100) / 100,
                profit_impact: Math.round(profitLoss * 100) / 100,
                margin_erosion_percentage: revenueWithoutDiscounts > 0
                    ? Math.round((totalDiscounts / revenueWithoutDiscounts) * 100 * 100) / 100
                    : 0
            };

        } catch (error) {
            log.error('Error calculating margin impact', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Calculate revenue erosion from discounts
     */
    static async calculateRevenueErosion(businessId, period = 'month') {
        const client = await getClient();

        try {
            const { startDate, endDate } = DiscountCore.getDateRange(period);

            const result = await client.query(
                `SELECT
                    DATE_TRUNC('day', analysis_date) as day,
                    COALESCE(SUM(total_discount_amount), 0) as daily_discounts,
                    COALESCE(SUM(total_invoice_amount), 0) as daily_revenue
                 FROM discount_analytics
                 WHERE business_id = $1
                    AND analysis_date BETWEEN $2 AND $3
                 GROUP BY DATE_TRUNC('day', analysis_date)
                 ORDER BY day`,
                [businessId, startDate, endDate]
            );

            const days = result.rows;
            let cumulativeErosion = 0;

            const dailyBreakdown = days.map(day => {
                cumulativeErosion += parseFloat(day.daily_discounts || 0);
                return {
                    date: day.day,
                    discounts: parseFloat(day.daily_discounts || 0),
                    revenue: parseFloat(day.daily_revenue || 0),
                    erosion_percentage: day.daily_revenue > 0
                        ? (day.daily_discounts / day.daily_revenue) * 100
                        : 0,
                    cumulative_erosion: cumulativeErosion
                };
            });

            const totalDiscounts = dailyBreakdown.reduce((sum, d) => sum + d.discounts, 0);
            const totalRevenue = dailyBreakdown.reduce((sum, d) => sum + d.revenue, 0);

            return {
                period: { startDate, endDate },
                summary: {
                    total_discounts: totalDiscounts,
                    total_revenue: totalRevenue,
                    overall_erosion_percentage: totalRevenue > 0 ? (totalDiscounts / totalRevenue) * 100 : 0,
                    average_daily_discounts: totalDiscounts / (dailyBreakdown.length || 1),
                    days_with_data: dailyBreakdown.length
                },
                daily_breakdown: dailyBreakdown
            };

        } catch (error) {
            log.error('Error calculating revenue erosion', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 3: CUSTOMER BEHAVIOR
     * =====================================================
     */

    /**
     * Get discount behavior for a specific customer
     */
    static async getCustomerDiscountBehavior(customerId, businessId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT
                    COUNT(DISTINCT da.id) as total_discounts_used,
                    COALESCE(SUM(da.total_discount_amount), 0) as total_discount_amount,
                    COALESCE(AVG(da.total_discount_amount), 0) as avg_discount_amount,
                    COUNT(DISTINCT
                        CASE
                            WHEN da.promotional_discount_id IS NOT NULL THEN da.promotional_discount_id
                            WHEN da.discount_rule_id IS NOT NULL THEN da.discount_rule_id
                        END
                    ) as unique_discounts_used,
                    MIN(da.created_at) as first_discount_used,
                    MAX(da.created_at) as last_discount_used,
                    COUNT(DISTINCT DATE(da.created_at)) as days_with_discounts
                 FROM discount_allocations da
                 LEFT JOIN invoices i ON da.invoice_id = i.id
                 LEFT JOIN pos_transactions pt ON da.pos_transaction_id = pt.id
                 WHERE da.business_id = $1
                    AND (i.customer_id = $2 OR pt.customer_id = $2)
                    AND da.status = 'APPLIED'`,
                [businessId, customerId]
            );

            const stats = result.rows[0] || {
                total_discounts_used: 0,
                total_discount_amount: 0,
                avg_discount_amount: 0,
                unique_discounts_used: 0,
                days_with_discounts: 0
            };

            // Get favorite discount types
            const typeResult = await client.query(
                `SELECT
                    CASE
                        WHEN da.promotional_discount_id IS NOT NULL THEN 'PROMOTIONAL'
                        ELSE 'OTHER'
                    END as discount_type,
                    COUNT(*) as usage_count
                 FROM discount_allocations da
                 LEFT JOIN invoices i ON da.invoice_id = i.id
                 LEFT JOIN pos_transactions pt ON da.pos_transaction_id = pt.id
                 WHERE da.business_id = $1
                    AND (i.customer_id = $2 OR pt.customer_id = $2)
                    AND da.status = 'APPLIED'
                 GROUP BY
                    CASE
                        WHEN da.promotional_discount_id IS NOT NULL THEN 'PROMOTIONAL'
                        ELSE 'OTHER'
                    END
                 ORDER BY usage_count DESC`,
                [businessId, customerId]
            );

            return {
                customer_id: customerId,
                summary: {
                    total_discounts_used: parseInt(stats.total_discounts_used) || 0,
                    total_discount_amount: parseFloat(stats.total_discount_amount) || 0,
                    avg_discount_amount: parseFloat(stats.avg_discount_amount) || 0,
                    unique_discounts_used: parseInt(stats.unique_discounts_used) || 0,
                    first_discount_used: stats.first_discount_used,
                    last_discount_used: stats.last_discount_used,
                    days_with_discounts: parseInt(stats.days_with_discounts) || 0
                },
                favorite_discount_types: typeResult.rows,
                discount_frequency: stats.days_with_discounts > 0
                    ? stats.total_discounts_used / stats.days_with_discounts
                    : 0
            };

        } catch (error) {
            log.error('Error getting customer discount behavior', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Identify customers who are sensitive to discounts
     * FIXED: Removed ROUND with two parameters
     */
    static async identifyDiscountSensitiveCustomers(businessId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `WITH all_transactions AS (
                    SELECT
                        id,
                        customer_id,
                        total_amount,
                        'invoice' as source_type
                    FROM invoices
                    WHERE business_id = $1
                    UNION ALL
                    SELECT
                        id,
                        customer_id,
                        total_amount,
                        'pos' as source_type
                    FROM pos_transactions
                    WHERE business_id = $1
                ),
                transaction_discounts AS (
                    SELECT
                        at.customer_id,
                        COUNT(DISTINCT at.id) as total_transactions,
                        COUNT(DISTINCT
                            CASE
                                WHEN da.id IS NOT NULL THEN at.id
                            END
                        ) as transactions_with_discount,
                        COALESCE(SUM(at.total_amount), 0) as total_spent,
                        COALESCE(SUM(da.total_discount_amount), 0) as total_discount_received
                    FROM all_transactions at
                    LEFT JOIN discount_allocations da ON
                        (da.invoice_id = at.id AND at.source_type = 'invoice') OR
                        (da.pos_transaction_id = at.id AND at.source_type = 'pos')
                    GROUP BY at.customer_id
                )
                SELECT
                    td.customer_id,
                    c.first_name || ' ' || c.last_name as customer_name,
                    c.email,
                    td.total_transactions,
                    td.transactions_with_discount,
                    CASE
                        WHEN td.total_transactions > 0
                        THEN (td.transactions_with_discount::float / td.total_transactions::float) * 100
                        ELSE 0
                    END as discount_percentage,
                    td.total_spent,
                    td.total_discount_received,
                    CASE
                        WHEN td.transactions_with_discount = td.total_transactions AND td.total_transactions > 0 THEN 'Always uses discounts'
                        WHEN td.transactions_with_discount > td.total_transactions * 0.8 THEN 'Highly discount sensitive'
                        WHEN td.transactions_with_discount > td.total_transactions * 0.5 THEN 'Moderately discount sensitive'
                        ELSE 'Not discount sensitive'
                    END as sensitivity_level
                FROM transaction_discounts td
                JOIN customers c ON td.customer_id = c.id
                WHERE td.total_transactions >= 3
                ORDER BY discount_percentage DESC`,
                [businessId]
            );

            return result.rows;

        } catch (error) {
            log.error('Error identifying discount sensitive customers', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Calculate Customer Lifetime Value including discount impact
     */
    static async calculateCLVWithDiscounts(customerId, businessId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `WITH all_transactions AS (
                    SELECT
                        id,
                        invoice_date as transaction_date,
                        total_amount,
                        customer_id,
                        'invoice' as source_type
                    FROM invoices
                    WHERE customer_id = $1
                    UNION ALL
                    SELECT
                        id,
                        transaction_date,
                        total_amount,
                        customer_id,
                        'pos' as source_type
                    FROM pos_transactions
                    WHERE customer_id = $1
                )
                SELECT
                    COUNT(*) as total_transactions,
                    COALESCE(SUM(at.total_amount), 0) as gross_revenue,
                    COALESCE(SUM(da.total_discount_amount), 0) as total_discounts,
                    COALESCE(SUM(at.total_amount), 0) - COALESCE(SUM(da.total_discount_amount), 0) as net_revenue,
                    COALESCE(AVG(at.total_amount), 0) as avg_transaction_value,
                    COALESCE(AVG(da.total_discount_amount), 0) as avg_discount_per_transaction,
                    MAX(at.transaction_date) as last_purchase_date,
                    MIN(at.transaction_date) as first_purchase_date,
                    EXTRACT(DAY FROM COALESCE(MAX(at.transaction_date) - MIN(at.transaction_date), INTERVAL '1 day')) as customer_lifetime_days
                FROM all_transactions at
                LEFT JOIN discount_allocations da ON
                    (da.invoice_id = at.id AND at.source_type = 'invoice') OR
                    (da.pos_transaction_id = at.id AND at.source_type = 'pos')`,
                [customerId]
            );

            const stats = result.rows[0];
            const lifetimeDays = parseInt(stats.customer_lifetime_days || 1);

            // Calculate annual projections
            const transactionsPerYear = (stats.total_transactions / lifetimeDays) * 365;
            const annualGrossRevenue = transactionsPerYear * parseFloat(stats.avg_transaction_value || 0);
            const annualNetRevenue = transactionsPerYear * (parseFloat(stats.avg_transaction_value || 0) - parseFloat(stats.avg_discount_per_transaction || 0));

            return {
                customer_id: customerId,
                lifetime_summary: {
                    total_transactions: parseInt(stats.total_transactions) || 0,
                    gross_revenue: parseFloat(stats.gross_revenue) || 0,
                    total_discounts: parseFloat(stats.total_discounts) || 0,
                    net_revenue: parseFloat(stats.net_revenue) || 0,
                    avg_transaction: parseFloat(stats.avg_transaction_value) || 0,
                    avg_discount: parseFloat(stats.avg_discount_per_transaction) || 0,
                    lifetime_days: lifetimeDays,
                    first_purchase: stats.first_purchase_date,
                    last_purchase: stats.last_purchase_date
                },
                annual_projection: {
                    projected_transactions: Math.round(transactionsPerYear) || 0,
                    projected_gross_revenue: Math.round(annualGrossRevenue * 100) / 100 || 0,
                    projected_net_revenue: Math.round(annualNetRevenue * 100) / 100 || 0,
                    projected_discount_erosion: Math.round((annualGrossRevenue - annualNetRevenue) * 100) / 100 || 0
                }
            };

        } catch (error) {
            log.error('Error calculating CLV with discounts', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 4: ROI ANALYSIS
     * =====================================================
     */

    /**
     * Calculate ROI for a specific promotion
     */
    static async calculatePromotionROI(promoId, businessId) {
        const client = await getClient();

        try {
            // Get promotion details
            const promoResult = await client.query(
                `SELECT * FROM promotional_discounts WHERE id = $1 AND business_id = $2`,
                [promoId, businessId]
            );

            if (promoResult.rows.length === 0) {
                throw new Error('Promotion not found');
            }

            const promotion = promoResult.rows[0];

            // Get analytics data for this promotion
            const analyticsResult = await client.query(
                `SELECT
                    COALESCE(SUM(times_used), 0) as total_uses,
                    COALESCE(SUM(total_discount_amount), 0) as total_discount_given,
                    COALESCE(SUM(total_invoice_amount), 0) as total_invoice_amount,
                    COALESCE(SUM(unique_customers), 0) as unique_customers,
                    MIN(analysis_date) as first_use_date,
                    MAX(analysis_date) as last_use_date
                 FROM discount_analytics
                 WHERE business_id = $1
                    AND promotional_discount_id = $2`,
                [businessId, promoId]
            );

            const stats = analyticsResult.rows[0] || {
                total_uses: 0,
                total_discount_given: 0,
                total_invoice_amount: 0,
                unique_customers: 0
            };

            // Calculate ROI metrics
            const totalDiscountGiven = parseFloat(stats.total_discount_given || 0);
            const totalRevenue = parseFloat(stats.total_invoice_amount || 0);
            const incrementalRevenue = totalRevenue * 0.3; // Assume 30% would not have happened without promo
            const roi = totalDiscountGiven > 0 ? ((incrementalRevenue - totalDiscountGiven) / totalDiscountGiven) * 100 : 0;

            return {
                promotion_id: promoId,
                promotion_code: promotion.promo_code,
                promotion_name: promotion.description || promotion.promo_code,
                period: {
                    start: stats.first_use_date,
                    end: stats.last_use_date
                },
                usage_stats: {
                    total_uses: parseInt(stats.total_uses || 0),
                    unique_customers: parseInt(stats.unique_customers || 0),
                    avg_uses_per_customer: stats.unique_customers > 0
                        ? (stats.total_uses / stats.unique_customers).toFixed(2)
                        : 0
                },
                financial_stats: {
                    total_discount_given: totalDiscountGiven,
                    total_revenue_generated: totalRevenue,
                    avg_discount_per_use: stats.total_uses > 0 ? totalDiscountGiven / stats.total_uses : 0,
                    avg_order_value: stats.total_uses > 0 ? totalRevenue / stats.total_uses : 0
                },
                roi_analysis: {
                    assumed_incremental_percentage: 30,
                    estimated_incremental_revenue: incrementalRevenue,
                    net_gain: incrementalRevenue - totalDiscountGiven,
                    roi_percentage: Math.round(roi * 100) / 100,
                    payback_period_days: stats.total_uses > 0 && incrementalRevenue > 0
                        ? (totalDiscountGiven / (incrementalRevenue / 30)).toFixed(1)
                        : null
                }
            };

        } catch (error) {
            log.error('Error calculating promotion ROI', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get most cost-effective discounts
     * FIXED: Proper GROUP BY clause
     */
    static async getCostEffectiveDiscounts(businessId, limit = 10) {
        const client = await getClient();

        try {
            const result = await client.query(
                `WITH discount_performance AS (
                    SELECT 
                        COALESCE(da.discount_rule_id, da.promotional_discount_id) as discount_id,
                        MAX(CASE
                            WHEN da.promotional_discount_id IS NOT NULL THEN pd.promo_code
                            WHEN vdt.id IS NOT NULL THEN vdt.tier_name
                            WHEN ept.id IS NOT NULL THEN ept.term_name
                            WHEN cdr.id IS NOT NULL THEN 'Category Discount'
                        END) as discount_name,
                        MAX(CASE
                            WHEN da.promotional_discount_id IS NOT NULL THEN 'PROMOTIONAL'
                            WHEN vdt.id IS NOT NULL THEN 'VOLUME'
                            WHEN ept.id IS NOT NULL THEN 'EARLY_PAYMENT'
                            WHEN cdr.id IS NOT NULL THEN 'CATEGORY'
                        END) as discount_type,
                        SUM(da.times_used) as total_uses,
                        SUM(da.total_discount_amount) as total_discount_given,
                        SUM(da.total_invoice_amount) as total_revenue,
                        SUM(da.unique_customers) as unique_customers
                    FROM discount_analytics da
                    LEFT JOIN promotional_discounts pd ON da.promotional_discount_id = pd.id
                    LEFT JOIN volume_discount_tiers vdt ON da.discount_rule_id = vdt.id
                    LEFT JOIN early_payment_terms ept ON da.discount_rule_id = ept.id
                    LEFT JOIN category_discount_rules cdr ON da.discount_rule_id = cdr.id
                    WHERE da.business_id = $1
                        AND da.analysis_date >= NOW() - INTERVAL '90 days'
                    GROUP BY COALESCE(da.discount_rule_id, da.promotional_discount_id)
                    HAVING SUM(da.times_used) > 5
                )
                SELECT 
                    *,
                    CASE 
                        WHEN total_discount_given > 0 
                        THEN total_revenue / total_discount_given 
                        ELSE 0 
                    END as revenue_per_dollar_discounted,
                    CASE 
                        WHEN unique_customers > 0 
                        THEN total_revenue / unique_customers 
                        ELSE 0 
                    END as revenue_per_customer
                FROM discount_performance
                WHERE total_discount_given > 0
                ORDER BY revenue_per_dollar_discounted DESC
                LIMIT $2`,
                [businessId, limit]
            );

            return result.rows;

        } catch (error) {
            log.error('Error getting cost-effective discounts', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 5: DAILY AGGREGATION
     * =====================================================
     */

    /**
     * Update daily analytics for a business
     */
    static async updateDailyAnalytics(businessId, analysisDate = new Date()) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            const dateStr = DiscountCore.toDateOnlyString(analysisDate);

            // Delete existing records for this date
            await client.query(
                `DELETE FROM discount_analytics
                 WHERE business_id = $1 AND analysis_date = $2`,
                [businessId, dateStr]
            );

            // Aggregate data for the day
            const aggregated = await this.aggregateDailyDiscounts(businessId, dateStr, client);

            if (aggregated && aggregated.by_rule.length > 0) {
                // Insert new analytics records
                for (const rule of aggregated.by_rule) {
                    await client.query(
                        `INSERT INTO discount_analytics (
                            business_id, analysis_date,
                            discount_rule_id, promotional_discount_id,
                            times_used, total_discount_amount,
                            total_invoice_amount, unique_customers,
                            created_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
                        [
                            businessId,
                            dateStr,
                            rule.discount_rule_id,
                            rule.promotional_discount_id,
                            rule.times_used,
                            rule.total_discount_amount,
                            rule.total_invoice_amount,
                            rule.unique_customers
                        ]
                    );
                }

                log.info('Daily analytics updated', {
                    businessId,
                    date: dateStr,
                    rule_count: aggregated.by_rule.length
                });
            }

            await client.query('COMMIT');

            return {
                business_id: businessId,
                analysis_date: dateStr,
                rules_updated: aggregated.by_rule.length,
                total_uses: aggregated.total_uses,
                total_discount: aggregated.total_discount
            };

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error updating daily analytics', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Aggregate daily discount data
     */
    static async aggregateDailyDiscounts(businessId, dateStr, client) {
        try {
            // Get all allocations for the day
            const result = await client.query(
                `SELECT
                    da.discount_rule_id,
                    da.promotional_discount_id,
                    COUNT(DISTINCT da.id) as times_used,
                    COALESCE(SUM(da.total_discount_amount), 0) as total_discount_amount,
                    COALESCE(SUM(COALESCE(i.total_amount, pt.total_amount)), 0) as total_invoice_amount,
                    COUNT(DISTINCT COALESCE(i.customer_id, pt.customer_id)) as unique_customers
                 FROM discount_allocations da
                 LEFT JOIN invoices i ON da.invoice_id = i.id
                 LEFT JOIN pos_transactions pt ON da.pos_transaction_id = pt.id
                 WHERE da.business_id = $1
                    AND DATE(da.created_at) = $2
                    AND da.status = 'APPLIED'
                 GROUP BY
                    da.discount_rule_id,
                    da.promotional_discount_id`,
                [businessId, dateStr]
            );

            const rows = result.rows;

            // Calculate totals
            let totalUses = 0;
            let totalDiscount = 0;
            let totalInvoice = 0;

            const byRule = rows.map(r => {
                totalUses += parseInt(r.times_used || 0);
                totalDiscount += parseFloat(r.total_discount_amount || 0);
                totalInvoice += parseFloat(r.total_invoice_amount || 0);

                return {
                    discount_rule_id: r.discount_rule_id,
                    promotional_discount_id: r.promotional_discount_id,
                    times_used: parseInt(r.times_used || 0),
                    total_discount_amount: parseFloat(r.total_discount_amount || 0),
                    total_invoice_amount: parseFloat(r.total_invoice_amount || 0),
                    unique_customers: parseInt(r.unique_customers || 0)
                };
            });

            return {
                date: dateStr,
                total_uses: totalUses,
                total_discount: totalDiscount,
                total_invoice: totalInvoice,
                by_rule: byRule
            };

        } catch (error) {
            log.error('Error aggregating daily discounts', { error: error.message });
            throw error;
        }
    }

    /**
     * =====================================================
     * SECTION 6: RECOMMENDATIONS
     * =====================================================
     */

    /**
     * Generate discount recommendations based on analytics
     * FIXED: Proper GROUP BY clause
     */
    static async generateRecommendations(businessId) {
        const client = await getClient();

        try {
            const recommendations = [];

            // 1. Find underutilized discounts
            const underutilized = await client.query(
                `WITH underutilized_data AS (
                    SELECT 
                        COALESCE(da.discount_rule_id, da.promotional_discount_id) as discount_id,
                        MAX(CASE
                            WHEN da.promotional_discount_id IS NOT NULL THEN pd.promo_code
                            WHEN vdt.id IS NOT NULL THEN vdt.tier_name
                            WHEN ept.id IS NOT NULL THEN ept.term_name
                            WHEN cdr.id IS NOT NULL THEN 'Category Discount'
                        END) as discount_name,
                        MAX(CASE
                            WHEN da.promotional_discount_id IS NOT NULL THEN 'PROMOTIONAL'
                            WHEN vdt.id IS NOT NULL THEN 'VOLUME'
                            WHEN ept.id IS NOT NULL THEN 'EARLY_PAYMENT'
                            WHEN cdr.id IS NOT NULL THEN 'CATEGORY'
                        END) as discount_type,
                        SUM(da.times_used) as total_uses,
                        SUM(da.total_discount_amount) as total_discount,
                        AVG(da.total_discount_amount / NULLIF(da.total_invoice_amount, 0)) * 100 as avg_discount_percent
                    FROM discount_analytics da
                    LEFT JOIN promotional_discounts pd ON da.promotional_discount_id = pd.id
                    LEFT JOIN volume_discount_tiers vdt ON da.discount_rule_id = vdt.id
                    LEFT JOIN early_payment_terms ept ON da.discount_rule_id = ept.id
                    LEFT JOIN category_discount_rules cdr ON da.discount_rule_id = cdr.id
                    WHERE da.business_id = $1
                        AND da.analysis_date >= NOW() - INTERVAL '30 days'
                    GROUP BY COALESCE(da.discount_rule_id, da.promotional_discount_id)
                    HAVING SUM(da.times_used) < 5
                    ORDER BY SUM(da.times_used) ASC
                    LIMIT 5
                )
                SELECT * FROM underutilized_data`,
                [businessId]
            );

            underutilized.rows.forEach(d => {
                recommendations.push({
                    type: 'UNDERUTILIZED_DISCOUNT',
                    discount_id: d.discount_id,
                    discount_name: d.discount_name || 'Unknown Discount',
                    discount_type: d.discount_type,
                    message: `${d.discount_name || 'A discount'} (${d.discount_type}) has only been used ${d.total_uses} times in the last 30 days. Consider promoting it more or adjusting the terms.`,
                    suggestion: (d.avg_discount_percent || 0) > 20
                        ? 'Discount might be too high - customers might not trust it. Try lowering to 10-15%.'
                        : 'Add this discount to customer communications and highlight its benefits.',
                    current_usage: d.total_uses,
                    current_discount_percent: Math.round((d.avg_discount_percent || 0) * 100) / 100
                });
            });

            // 2. Find discounts that might be too generous
            const tooGenerous = await client.query(
                `WITH generous_data AS (
                    SELECT 
                        COALESCE(da.discount_rule_id, da.promotional_discount_id) as discount_id,
                        MAX(CASE
                            WHEN da.promotional_discount_id IS NOT NULL THEN pd.promo_code
                            WHEN vdt.id IS NOT NULL THEN vdt.tier_name
                            WHEN ept.id IS NOT NULL THEN ept.term_name
                            WHEN cdr.id IS NOT NULL THEN 'Category Discount'
                        END) as discount_name,
                        MAX(CASE
                            WHEN da.promotional_discount_id IS NOT NULL THEN 'PROMOTIONAL'
                            WHEN vdt.id IS NOT NULL THEN 'VOLUME'
                            WHEN ept.id IS NOT NULL THEN 'EARLY_PAYMENT'
                            WHEN cdr.id IS NOT NULL THEN 'CATEGORY'
                        END) as discount_type,
                        AVG(da.total_discount_amount / NULLIF(da.total_invoice_amount, 0)) * 100 as avg_discount_percent,
                        SUM(da.total_discount_amount) as total_discount_given,
                        SUM(da.total_invoice_amount) as total_revenue
                    FROM discount_analytics da
                    LEFT JOIN promotional_discounts pd ON da.promotional_discount_id = pd.id
                    LEFT JOIN volume_discount_tiers vdt ON da.discount_rule_id = vdt.id
                    LEFT JOIN early_payment_terms ept ON da.discount_rule_id = ept.id
                    LEFT JOIN category_discount_rules cdr ON da.discount_rule_id = cdr.id
                    WHERE da.business_id = $1
                        AND da.analysis_date >= NOW() - INTERVAL '90 days'
                    GROUP BY COALESCE(da.discount_rule_id, da.promotional_discount_id)
                    HAVING AVG(da.total_discount_amount / NULLIF(da.total_invoice_amount, 0)) > 0.25
                    ORDER BY AVG(da.total_discount_amount / NULLIF(da.total_invoice_amount, 0)) DESC
                    LIMIT 3
                )
                SELECT * FROM generous_data`,
                [businessId]
            );

            tooGenerous.rows.forEach(d => {
                recommendations.push({
                    type: 'DISCOUNT_TOO_GENEROUS',
                    discount_id: d.discount_id,
                    discount_name: d.discount_name || 'Unknown Discount',
                    discount_type: d.discount_type,
                    message: `${d.discount_name || 'A discount'} averages ${Math.round(d.avg_discount_percent || 0)}% discount, which is cutting into margins.`,
                    suggestion: 'Consider reducing the discount percentage or adding minimum purchase requirements.',
                    current_discount_percent: Math.round((d.avg_discount_percent || 0) * 100) / 100,
                    total_discount_given: d.total_discount_given,
                    total_revenue: d.total_revenue
                });
            });

            // 3. Find best times for promotions
            const bestDays = await client.query(
                `SELECT
                    EXTRACT(DOW FROM analysis_date) as day_of_week,
                    AVG(times_used) as avg_uses,
                    AVG(total_discount_amount) as avg_discount,
                    AVG(total_invoice_amount) as avg_revenue
                 FROM discount_analytics
                 WHERE business_id = $1
                    AND analysis_date >= NOW() - INTERVAL '90 days'
                 GROUP BY EXTRACT(DOW FROM analysis_date)
                 ORDER BY avg_revenue DESC
                 LIMIT 1`,
                [businessId]
            );

            if (bestDays.rows.length > 0) {
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const bestDay = bestDays.rows[0];

                recommendations.push({
                    type: 'OPTIMAL_PROMOTION_DAY',
                    day_of_week: dayNames[bestDay.day_of_week],
                    message: `${dayNames[bestDay.day_of_week]} shows the highest average revenue with discounts.`,
                    suggestion: `Schedule your best promotions on ${dayNames[bestDay.day_of_week]}s for maximum impact.`,
                    avg_revenue: Math.round(bestDay.avg_revenue * 100) / 100,
                    avg_discount: Math.round(bestDay.avg_discount * 100) / 100,
                    avg_uses: Math.round(bestDay.avg_uses)
                });
            }

            return recommendations;

        } catch (error) {
            log.error('Error generating recommendations', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 7: ADDITIONAL ANALYTICS METHODS
     * =====================================================
     */

    /**
     * Get impact by product category
     */
    static async getImpactByCategory(businessId, startDate, endDate) {
        const client = await getClient();

        try {
            const result = await client.query(
                `WITH discount_items AS (
                    SELECT
                        di.product_id,
                        p.category_id,
                        c.category_name,
                        di.discount_allocation_id,
                        di.discounted_amount
                    FROM discount_items di
                    JOIN products p ON di.product_id = p.id
                    JOIN categories c ON p.category_id = c.id
                    WHERE di.business_id = $1
                        AND di.created_at BETWEEN $2::date AND $3::date + INTERVAL '1 day'
                )
                SELECT
                    di.category_id,
                    di.category_name,
                    COUNT(DISTINCT da.id) as discount_uses,
                    COUNT(DISTINCT COALESCE(i.customer_id, pt.customer_id)) as unique_customers,
                    COALESCE(SUM(di.discounted_amount), 0) as total_discount,
                    COALESCE(AVG(di.discounted_amount), 0) as avg_discount
                FROM discount_items di
                JOIN discount_allocations da ON di.discount_allocation_id = da.id
                LEFT JOIN invoices i ON da.invoice_id = i.id
                LEFT JOIN pos_transactions pt ON da.pos_transaction_id = pt.id
                WHERE da.status = 'APPLIED'
                GROUP BY di.category_id, di.category_name
                ORDER BY total_discount DESC`,
                [businessId, startDate, endDate]
            );

            return result.rows;
        } catch (error) {
            log.error('Error getting impact by category', { error: error.message });
            return [];
        } finally {
            client.release();
        }
    }

    /**
     * Get impact by customer segment
     */
    static async getImpactByCustomerSegment(businessId, startDate, endDate) {
        const client = await getClient();

        try {
            const result = await client.query(
                `WITH segment_data AS (
                    SELECT
                        c.id as customer_id,
                        COALESCE(cs.segment_name, 'Unsegmented') as segment_name,
                        da.id as discount_id,
                        da.total_discount_amount,
                        COALESCE(i.total_amount, pt.total_amount) as invoice_amount
                    FROM discount_allocations da
                    LEFT JOIN invoices i ON da.invoice_id = i.id
                    LEFT JOIN pos_transactions pt ON da.pos_transaction_id = pt.id
                    LEFT JOIN customers c ON COALESCE(i.customer_id, pt.customer_id) = c.id
                    LEFT JOIN customer_segments cs ON c.segment_id = cs.id
                    WHERE da.business_id = $1
                        AND da.status = 'APPLIED'
                        AND DATE(da.created_at) BETWEEN $2 AND $3
                )
                SELECT
                    segment_name,
                    COUNT(DISTINCT discount_id) as discount_uses,
                    COUNT(DISTINCT customer_id) as unique_customers,
                    COALESCE(SUM(total_discount_amount), 0) as total_discount,
                    COALESCE(AVG(total_discount_amount), 0) as avg_discount,
                    COALESCE(SUM(invoice_amount), 0) as total_revenue
                FROM segment_data
                GROUP BY segment_name
                ORDER BY total_discount DESC`,
                [businessId, startDate, endDate]
            );

            return result.rows;
        } catch (error) {
            log.error('Error getting impact by customer segment', { error: error.message });
            return [];
        } finally {
            client.release();
        }
    }
}

export default DiscountAnalyticsService;
