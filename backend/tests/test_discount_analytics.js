// File: ~/Bizzy_Track_pro/backend/tests/test_discount_analytics.js
// PURPOSE: Test discount analytics service
// PHASE 10.8: Complete test suite - FIXED with proper data creation warning

import { DiscountAnalyticsService } from '../app/services/discountAnalyticsService.js';
import { DiscountCore } from '../app/services/discountCore.js';
import { getClient } from '../app/utils/database.js';

async function getValidUserId() {
    const client = await getClient();
    try {
        const result = await client.query('SELECT id FROM users LIMIT 1');
        return result.rows[0]?.id;
    } finally {
        client.release();
    }
}

async function getTestPromoId(businessId) {
    const client = await getClient();
    try {
        const result = await client.query(
            `SELECT id FROM promotional_discounts
             WHERE business_id = $1 LIMIT 1`,
            [businessId]
        );
        return result.rows[0]?.id;
    } finally {
        client.release();
    }
}

async function getTestVolumeTierId(businessId) {
    const client = await getClient();
    try {
        const result = await client.query(
            `SELECT id FROM volume_discount_tiers
             WHERE business_id = $1 LIMIT 1`,
            [businessId]
        );
        return result.rows[0]?.id;
    } finally {
        client.release();
    }
}

async function getTestEarlyPaymentTermId(businessId) {
    const client = await getClient();
    try {
        const result = await client.query(
            `SELECT id FROM early_payment_terms
             WHERE business_id = $1 LIMIT 1`,
            [businessId]
        );
        return result.rows[0]?.id;
    } finally {
        client.release();
    }
}

async function getTestCategoryDiscountId(businessId) {
    const client = await getClient();
    try {
        const result = await client.query(
            `SELECT id FROM category_discount_rules
             WHERE business_id = $1 LIMIT 1`,
            [businessId]
        );
        return result.rows[0]?.id;
    } finally {
        client.release();
    }
}

async function getTestCustomerId(businessId) {
    const client = await getClient();
    try {
        const result = await client.query(
            `SELECT id FROM customers
             WHERE business_id = $1 LIMIT 1`,
            [businessId]
        );
        return result.rows[0]?.id;
    } finally {
        client.release();
    }
}

async function cleanupTestAnalytics(businessId) {
    const client = await getClient();
    try {
        // Delete analytics data for the last 30 days
        await client.query(
            `DELETE FROM discount_analytics
             WHERE business_id = $1
                AND analysis_date >= CURRENT_DATE - INTERVAL '30 days'`,
            [businessId]
        );
        console.log('🧹 Cleaned up recent test analytics');
    } catch (error) {
        console.log('⚠️ Cleanup warning:', error.message);
    } finally {
        client.release();
    }
}

async function checkAnalyticsData(businessId) {
    const client = await getClient();
    try {
        const checkResult = await client.query(
            'SELECT COUNT(*) as count FROM discount_analytics WHERE business_id = $1',
            [businessId]
        );

        if (parseInt(checkResult.rows[0].count) === 0) {
            console.log('\n📊 No analytics data found. Please run the populate script first:');
            console.log('   psql -d bizzytrack_pro -f ~/Bizzy_Track_pro/backend/scripts/populate_test_analytics_fixed.sql\n');
            return false;
        } else {
            console.log(`📊 Found ${checkResult.rows[0].count} analytics records`);
            return true;
        }
    } catch (error) {
        console.log('⚠️ Error checking analytics data:', error.message);
        return false;
    } finally {
        client.release();
    }
}

async function testDiscountAnalytics() {
    console.log('\n🧪 TESTING DISCOUNT ANALYTICS SERVICE');
    console.log('========================================\n');

    const testBusinessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    const testUserId = await getValidUserId();
    const testPromoId = await getTestPromoId(testBusinessId);
    const testVolumeTierId = await getTestVolumeTierId(testBusinessId);
    const testEarlyPaymentId = await getTestEarlyPaymentTermId(testBusinessId);
    const testCategoryDiscountId = await getTestCategoryDiscountId(testBusinessId);
    const testCustomerId = await getTestCustomerId(testBusinessId);

    console.log(`Using user ID: ${testUserId}`);
    console.log(`Using promo ID: ${testPromoId || 'None found'}`);
    console.log(`Using volume tier ID: ${testVolumeTierId || 'None found'}`);
    console.log(`Using early payment ID: ${testEarlyPaymentId || 'None found'}`);
    console.log(`Using category discount ID: ${testCategoryDiscountId || 'None found'}`);
    console.log(`Using customer ID: ${testCustomerId || 'None found'}`);

    // Check if analytics data exists
    const hasData = await checkAnalyticsData(testBusinessId);
    
    // Clean up old test data
    await cleanupTestAnalytics(testBusinessId);

    const tests = [];

    // Test 1: Update daily analytics
    try {
        const result = await DiscountAnalyticsService.updateDailyAnalytics(
            testBusinessId,
            new Date()
        );

        tests.push({
            name: 'Update daily analytics',
            expected: 'Analytics updated',
            actual: result ? `Updated ${result.rules_updated} rules` : 'No data to update',
            passed: result !== null,
            details: {
                date: result?.analysis_date,
                rules_updated: result?.rules_updated,
                total_uses: result?.total_uses,
                total_discount: result?.total_discount
            }
        });
    } catch (error) {
        tests.push({
            name: 'Update daily analytics',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 2: Get usage metrics
    try {
        const startDate = DiscountCore.toDateOnlyString(new Date(new Date().setDate(new Date().getDate() - 30)));
        const endDate = DiscountCore.toDateOnlyString(new Date());

        const result = await DiscountAnalyticsService.getUsageMetrics(
            testBusinessId,
            startDate,
            endDate
        );

        tests.push({
            name: 'Get usage metrics',
            expected: 'Usage metrics object',
            actual: result ? 'Metrics retrieved' : 'No metrics',
            passed: result !== null,
            details: {
                total_uses: result.summary?.total_uses,
                total_discounts: result.summary?.total_discounts_given,
                avg_discount_percent: result.summary?.avg_discount_percentage
            }
        });
    } catch (error) {
        tests.push({
            name: 'Get usage metrics',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 3: Get usage by type
    try {
        const startDate = DiscountCore.toDateOnlyString(new Date(new Date().setDate(new Date().getDate() - 30)));
        const endDate = DiscountCore.toDateOnlyString(new Date());

        const result = await DiscountAnalyticsService.getUsageByType(
            testBusinessId,
            startDate,
            endDate
        );

        tests.push({
            name: 'Get usage by type',
            expected: 'Array of discount types',
            actual: `${result.length} types found`,
            passed: Array.isArray(result),
            details: result.map(r => ({
                type: r.discount_type,
                uses: r.usage_count,
                total_discount: r.total_discount,
                percentage: r.percentage_of_total
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Get usage by type',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 4: Get usage by rule
    try {
        const startDate = DiscountCore.toDateOnlyString(new Date(new Date().setDate(new Date().getDate() - 30)));
        const endDate = DiscountCore.toDateOnlyString(new Date());

        const result = await DiscountAnalyticsService.getUsageByRule(
            testBusinessId,
            startDate,
            endDate
        );

        tests.push({
            name: 'Get usage by rule',
            expected: 'Array of rule usage',
            actual: `${result.length} rules found`,
            passed: Array.isArray(result),
            details: result.map(r => ({
                rule: r.rule_name,
                type: r.rule_type,
                uses: r.total_uses,
                discount: r.total_discount
            })).slice(0, 3)
        });
    } catch (error) {
        tests.push({
            name: 'Get usage by rule',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 5: Get average discount percentage
    try {
        const result = await DiscountAnalyticsService.getAverageDiscountPercentage(
            testBusinessId,
            'month'
        );

        tests.push({
            name: 'Get average discount percentage',
            expected: 'Average percentage',
            actual: result ? `Avg: ${result.avg_percentage}%` : 'No data',
            passed: result !== null,
            details: {
                avg: result.avg_percentage,
                median: result.median_percentage,
                min: result.min_percentage,
                max: result.max_percentage
            }
        });
    } catch (error) {
        tests.push({
            name: 'Get average discount percentage',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 6: Calculate margin impact
    try {
        const result = await DiscountAnalyticsService.calculateMarginImpact(
            testBusinessId,
            'month',
            30
        );

        tests.push({
            name: 'Calculate margin impact',
            expected: 'Margin impact object',
            actual: result ? 'Calculated' : 'No data',
            passed: result !== null,
            details: {
                total_discounts: result.total_discounts_given,
                profit_impact: result.profit_impact,
                margin_erosion: result.margin_erosion_percentage
            }
        });
    } catch (error) {
        tests.push({
            name: 'Calculate margin impact',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 7: Calculate revenue erosion
    try {
        const result = await DiscountAnalyticsService.calculateRevenueErosion(
            testBusinessId,
            'month'
        );

        tests.push({
            name: 'Calculate revenue erosion',
            expected: 'Revenue erosion object',
            actual: result ? 'Calculated' : 'No data',
            passed: result !== null,
            details: {
                total_discounts: result.summary?.total_discounts,
                total_revenue: result.summary?.total_revenue,
                erosion_percentage: result.summary?.overall_erosion_percentage
            }
        });
    } catch (error) {
        tests.push({
            name: 'Calculate revenue erosion',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 8: Get impact by category
    try {
        const startDate = DiscountCore.toDateOnlyString(new Date(new Date().setDate(new Date().getDate() - 30)));
        const endDate = DiscountCore.toDateOnlyString(new Date());

        const result = await DiscountAnalyticsService.getImpactByCategory(
            testBusinessId,
            startDate,
            endDate
        );

        tests.push({
            name: 'Get impact by category',
            expected: 'Array of category impacts',
            actual: `${result.length} categories found`,
            passed: Array.isArray(result),
            details: result.map(r => ({
                category: r.category_name,
                uses: r.discount_uses,
                discount: r.total_discount,
                customers: r.unique_customers
            })).slice(0, 3)
        });
    } catch (error) {
        tests.push({
            name: 'Get impact by category',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 9: Get impact by customer segment
    try {
        const startDate = DiscountCore.toDateOnlyString(new Date(new Date().setDate(new Date().getDate() - 30)));
        const endDate = DiscountCore.toDateOnlyString(new Date());

        const result = await DiscountAnalyticsService.getImpactByCustomerSegment(
            testBusinessId,
            startDate,
            endDate
        );

        tests.push({
            name: 'Get impact by customer segment',
            expected: 'Array of segment impacts',
            actual: `${result.length} segments found`,
            passed: Array.isArray(result),
            details: result.map(r => ({
                segment: r.segment_name,
                uses: r.discount_uses,
                discount: r.total_discount,
                customers: r.unique_customers
            })).slice(0, 3)
        });
    } catch (error) {
        tests.push({
            name: 'Get impact by customer segment',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 10: Get customer discount behavior
    try {
        if (!testCustomerId) {
            tests.push({
                name: 'Get customer discount behavior',
                expected: 'Customer behavior',
                actual: 'Skipped - no customer found',
                passed: true
            });
        } else {
            const result = await DiscountAnalyticsService.getCustomerDiscountBehavior(
                testCustomerId,
                testBusinessId
            );

            tests.push({
                name: 'Get customer discount behavior',
                expected: 'Customer behavior object',
                actual: result ? 'Retrieved' : 'No data',
                passed: result !== null,
                details: {
                    total_discounts: result.summary?.total_discounts_used,
                    total_amount: result.summary?.total_discount_amount,
                    avg_amount: result.summary?.avg_discount_amount,
                    favorite_types: result.favorite_discount_types
                }
            });
        }
    } catch (error) {
        tests.push({
            name: 'Get customer discount behavior',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 11: Identify discount sensitive customers
    try {
        const result = await DiscountAnalyticsService.identifyDiscountSensitiveCustomers(
            testBusinessId
        );

        tests.push({
            name: 'Identify discount sensitive customers',
            expected: 'Array of customers',
            actual: `${result.length} customers found`,
            passed: Array.isArray(result),
            details: result.map(r => ({
                name: r.customer_name,
                discount_percentage: r.discount_percentage,
                sensitivity: r.sensitivity_level
            })).slice(0, 3)
        });
    } catch (error) {
        tests.push({
            name: 'Identify discount sensitive customers',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 12: Calculate CLV with discounts
    try {
        if (!testCustomerId) {
            tests.push({
                name: 'Calculate CLV with discounts',
                expected: 'CLV object',
                actual: 'Skipped - no customer found',
                passed: true
            });
        } else {
            const result = await DiscountAnalyticsService.calculateCLVWithDiscounts(
                testCustomerId,
                testBusinessId
            );

            tests.push({
                name: 'Calculate CLV with discounts',
                expected: 'CLV object',
                actual: result ? 'Calculated' : 'No data',
                passed: result !== null,
                details: {
                    gross_revenue: result.lifetime_summary?.gross_revenue,
                    net_revenue: result.lifetime_summary?.net_revenue,
                    total_discounts: result.lifetime_summary?.total_discounts,
                    projected_annual: result.annual_projection?.projected_net_revenue
                }
            });
        }
    } catch (error) {
        tests.push({
            name: 'Calculate CLV with discounts',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 13: Calculate promotion ROI
    try {
        if (!testPromoId) {
            tests.push({
                name: 'Calculate promotion ROI',
                expected: 'ROI object',
                actual: 'Skipped - no promotion found',
                passed: true
            });
        } else {
            const result = await DiscountAnalyticsService.calculatePromotionROI(
                testPromoId,
                testBusinessId
            );

            tests.push({
                name: 'Calculate promotion ROI',
                expected: 'ROI object',
                actual: result ? 'Calculated' : 'No data',
                passed: result !== null,
                details: {
                    promotion: result.promotion_code,
                    uses: result.usage_stats?.total_uses,
                    discount_given: result.financial_stats?.total_discount_given,
                    revenue: result.financial_stats?.total_revenue_generated,
                    roi: result.roi_analysis?.roi_percentage
                }
            });
        }
    } catch (error) {
        tests.push({
            name: 'Calculate promotion ROI',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 14: Get cost-effective discounts
    try {
        const result = await DiscountAnalyticsService.getCostEffectiveDiscounts(
            testBusinessId,
            5
        );

        tests.push({
            name: 'Get cost-effective discounts',
            expected: 'Array of discounts',
            actual: `${result.length} discounts found`,
            passed: Array.isArray(result),
            details: result.map(r => ({
                name: r.discount_name,
                type: r.discount_type,
                revenue_per_dollar: r.revenue_per_dollar_discounted,
                total_revenue: r.total_revenue
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Get cost-effective discounts',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 15: Generate recommendations
    try {
        const result = await DiscountAnalyticsService.generateRecommendations(
            testBusinessId
        );

        tests.push({
            name: 'Generate recommendations',
            expected: 'Array of recommendations',
            actual: `${result.length} recommendations generated`,
            passed: Array.isArray(result),
            details: result.map(r => ({
                type: r.type,
                message: r.message,
                suggestion: r.suggestion
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Generate recommendations',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Final cleanup
    await cleanupTestAnalytics(testBusinessId);

    // Print results
    console.log('\n📊 TEST RESULTS:');
    console.log('=================');

    let passed = 0;
    tests.forEach((test, index) => {
        console.log(`\n${index + 1}. ${test.name}`);
        console.log(`   Expected: ${test.expected}`);
        console.log(`   Actual:   ${test.actual}`);
        console.log(`   Result:   ${test.passed ? '✅ PASS' : '❌ FAIL'}`);
        if (test.details) {
            console.log('   Details:', JSON.stringify(test.details, null, 2));
        }
        if (test.passed) passed++;
    });

    console.log(`\n📈 SUMMARY: ${passed}/${tests.length} tests passed`);
}

// Run the tests
testDiscountAnalytics().catch(console.error);
