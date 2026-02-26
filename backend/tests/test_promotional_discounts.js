// File: ~/Bizzy_Track_pro/backend/tests/test_promotional_discounts.js
// PURPOSE: Test promotional discount service - IDEMPOTENT VERSION
// PHASE 10.2: Now cleans up after itself

import { PromotionalDiscountService } from '../app/services/promotionalDiscountService.js';
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

async function cleanupTestPromotions(businessId) {
    const client = await getClient();
    try {
        // Delete test promotions
        await client.query(
            `DELETE FROM promotional_discounts 
             WHERE business_id = $1 
             AND promo_code IN ('TEST20', 'MIN_TEST', 'BULK1', 'BULK2')`,
            [businessId]
        );
        console.log('🧹 Cleaned up test promotions');
    } catch (error) {
        console.log('⚠️ Cleanup warning:', error.message);
    } finally {
        client.release();
    }
}

async function testPromotionalDiscounts() {
    console.log('\n🧪 TESTING PROMOTIONAL DISCOUNT SERVICE');
    console.log('========================================\n');

    const testBusinessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';

    // Get a valid user ID from the database
    const testUserId = await getValidUserId();
    if (!testUserId) {
        console.log('❌ No valid user found in database. Please ensure users exist.');
        return;
    }
    console.log(`Using user ID: ${testUserId}`);

    const testCustomerId = '072d9a90-e358-4e19-89f7-ca9ce7bac5d8';

    // Clean up before running tests
    await cleanupTestPromotions(testBusinessId);

    const tests = [];

    // Test 1: Create a promotion
    try {
        const promoData = {
            promo_code: 'TEST20',
            description: '20% off test promotion',
            discount_type: 'PERCENTAGE',
            discount_value: 20.00,
            min_purchase: 50000,
            max_uses: 100,
            per_customer_limit: 1,
            valid_from: '2026-01-01',
            valid_to: '2026-12-31',
            is_active: true
        };

        const result = await PromotionalDiscountService.createPromotion(
            promoData,
            testUserId,
            testBusinessId
        );

        tests.push({
            name: 'Create promotion',
            expected: 'Promotion created',
            actual: `Created: ${result.promo_code}`,
            passed: result && result.id ? true : false,
            details: result
        });
    } catch (error) {
        tests.push({
            name: 'Create promotion',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 2: Get all promotions
    try {
        const promotions = await PromotionalDiscountService.getPromotions(testBusinessId);

        tests.push({
            name: 'Get all promotions',
            expected: 'Array of promotions',
            actual: `${promotions.length} promotions found`,
            passed: Array.isArray(promotions),
            details: promotions.map(p => ({
                code: p.promo_code,
                value: p.discount_value,
                type: p.discount_type
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Get all promotions',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 3: Validate valid promo code - Use TEST20 explicitly
    try {
        const result = await PromotionalDiscountService.validateAndApplyPromo(
            testBusinessId,
            'TEST20', // Use the code we just created
            100000,
            testCustomerId
        );

        tests.push({
            name: 'Validate valid promo code',
            expected: 'Valid promo',
            actual: result.valid ? 'Valid' : 'Invalid',
            passed: result.valid === true,
            details: {
                discount: result.discountAmount,
                finalAmount: result.finalAmount,
                reason: result.reason
            }
        });
    } catch (error) {
        tests.push({
            name: 'Validate valid promo code',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 4: Validate invalid promo code
    try {
        const result = await PromotionalDiscountService.validateAndApplyPromo(
            testBusinessId,
            'INVALID123',
            100000,
            testCustomerId
        );

        tests.push({
            name: 'Validate invalid promo code',
            expected: 'Invalid promo',
            actual: result.valid ? 'Valid' : 'Invalid (correct)',
            passed: result.valid === false,
            details: { reason: result.reason }
        });
    } catch (error) {
        tests.push({
            name: 'Validate invalid promo code',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 5: Check minimum purchase requirement - Use TEST20 explicitly
    try {
        const result = await PromotionalDiscountService.validateAndApplyPromo(
            testBusinessId,
            'TEST20', // Use the code with min_purchase=50000
            40000, // Below minimum
            testCustomerId
        );

        tests.push({
            name: 'Check minimum purchase requirement',
            expected: 'Rejected - below minimum',
            actual: result.valid ? 'Accepted' : `Rejected: ${result.reason}`,
            passed: result.valid === false && result.reason.includes('Minimum purchase'),
            details: { 
                reason: result.reason
            }
        });
    } catch (error) {
        tests.push({
            name: 'Check minimum purchase requirement',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 6: Get promotion stats
    try {
        // First get the TEST20 promotion ID
        const promotions = await PromotionalDiscountService.getPromotions(testBusinessId);
        const testPromo = promotions.find(p => p.promo_code === 'TEST20');
        
        if (testPromo) {
            const stats = await PromotionalDiscountService.getPromotionStats(
                testPromo.id,
                testBusinessId
            );

            tests.push({
                name: 'Get promotion stats',
                expected: 'Stats object',
                actual: stats ? 'Stats retrieved' : 'No stats',
                passed: stats !== null,
                details: stats?.usage_stats
            });
        } else {
            tests.push({
                name: 'Get promotion stats',
                expected: 'Stats object',
                actual: 'TEST20 not found',
                passed: false
            });
        }
    } catch (error) {
        tests.push({
            name: 'Get promotion stats',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 7: Update promotion - Use TEST20
    try {
        const promotions = await PromotionalDiscountService.getPromotions(testBusinessId);
        const testPromo = promotions.find(p => p.promo_code === 'TEST20');
        
        if (testPromo) {
            const updateData = {
                description: 'Updated description',
                max_uses: 200
            };

            const result = await PromotionalDiscountService.updatePromotion(
                testPromo.id,
                updateData,
                testUserId,
                testBusinessId
            );

            tests.push({
                name: 'Update promotion',
                expected: 'Updated promotion',
                actual: `Description: ${result.description}`,
                passed: result.description === 'Updated description',
                details: { max_uses: result.max_uses }
            });
        } else {
            tests.push({
                name: 'Update promotion',
                expected: 'Updated promotion',
                actual: 'TEST20 not found',
                passed: false
            });
        }
    } catch (error) {
        tests.push({
            name: 'Update promotion',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 8: Deactivate promotion - Use TEST20
    try {
        const promotions = await PromotionalDiscountService.getPromotions(testBusinessId);
        const testPromo = promotions.find(p => p.promo_code === 'TEST20');
        
        if (testPromo) {
            const result = await PromotionalDiscountService.deactivatePromotion(
                testPromo.id,
                testBusinessId,
                testUserId
            );

            tests.push({
                name: 'Deactivate promotion',
                expected: 'Deactivated',
                actual: result.is_active ? 'Still active' : 'Deactivated',
                passed: result.is_active === false,
                details: { is_active: result.is_active }
            });
        } else {
            tests.push({
                name: 'Deactivate promotion',
                expected: 'Deactivated',
                actual: 'TEST20 not found',
                passed: false
            });
        }
    } catch (error) {
        tests.push({
            name: 'Deactivate promotion',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 9: Get expiring promotions
    try {
        const expiring = await PromotionalDiscountService.getExpiringPromotions(
            testBusinessId,
            7
        );

        tests.push({
            name: 'Get expiring promotions',
            expected: 'Array of expiring promotions',
            actual: `${expiring.length} expiring found`,
            passed: Array.isArray(expiring),
            details: expiring.map(e => ({
                code: e.promo_code,
                expires: e.valid_to
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Get expiring promotions',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 10: Bulk create promotions - Use unique codes
    try {
        const timestamp = Date.now();
        const bulkData = [
            {
                promo_code: `BULK1_${timestamp}`,
                description: 'Bulk promo 1',
                discount_type: 'PERCENTAGE',
                discount_value: 5,
                valid_from: '2026-01-01',
                valid_to: '2026-12-31'
            },
            {
                promo_code: `BULK2_${timestamp}`,
                description: 'Bulk promo 2',
                discount_type: 'FIXED',
                discount_value: 10000,
                valid_from: '2026-01-01',
                valid_to: '2026-12-31'
            }
        ];

        const results = await PromotionalDiscountService.bulkCreatePromotions(
            bulkData,
            testUserId,
            testBusinessId
        );

        tests.push({
            name: 'Bulk create promotions',
            expected: 'Bulk results',
            actual: `${results.filter(r => r.success).length} successful, ${results.filter(r => !r.success).length} failed`,
            passed: results.filter(r => r.success).length === 2,
            details: results
        });
    } catch (error) {
        tests.push({
            name: 'Bulk create promotions',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

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
testPromotionalDiscounts().catch(console.error);
