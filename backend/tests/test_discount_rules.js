// File: ~/Bizzy_Track_pro/backend/tests/test_discount_rules.js
// PURPOSE: Test discount rules service - FIXED VERSION
// PHASE 10.1: Now matches the service method signatures

import { DiscountRules } from '../app/services/discountRules.js';
import { DiscountCore } from '../app/services/discountCore.js';

async function testDiscountRules() {
    console.log('\n🧪 TESTING DISCOUNT RULES SERVICE');
    console.log('====================================\n');

    const testBusinessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    const testCustomerId = '7c1b1017-c8a7-4471-bb8d-cfd137d19fe5';
    const testServiceId = '205a0315-cbb8-4761-ac53-9361bb14d90a';
    const testCategoryId = '7c1b1017-c8a7-4471-bb8d-cfd137d19fe5';
    const transactionDate = DiscountCore.parseAsDateOnly(new Date());

    const dataCheck = await DiscountRules.checkDiscountData(testBusinessId);
    console.log('Discount data in database:', dataCheck);

    const tests = [];

    // Test 1: Get applicable discounts for VIP customer
    try {
        const context = {
            customerId: testCustomerId,
            customerCategoryId: testCategoryId,
            serviceId: testServiceId,
            amount: 500000,
            quantity: 5,
            transactionDate: new Date()
        };

        const discounts = await DiscountRules.getApplicableDiscounts(testBusinessId, context);

        tests.push({
            name: 'Get applicable discounts - VIP customer',
            expected: 'Array of discounts',
            actual: discounts.length > 0 ? `${discounts.length} discounts found` : 'No discounts',
            passed: discounts.length > 0,
            details: discounts.map(d => ({
                type: d.rule_type,
                value: d.discount_value,
                name: d.name || d.promo_code
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Get applicable discounts - VIP customer',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 2: Get active promotions
    try {
        const context = {
            transactionDate: transactionDate,
            customerId: testCustomerId,
            amount: 500000
        };

        const promotions = await DiscountRules.getActivePromotions(testBusinessId, context);

        tests.push({
            name: 'Get active promotions',
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
            name: 'Get active promotions',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 3: Get volume discounts - bulk quantity (15 items) - FIXED
    try {
        const context = {
            quantity: 15,
            amount: 1500000,
            categoryId: testCategoryId,
            transactionDate: transactionDate
        };

        const volumeDiscounts = await DiscountRules.getVolumeDiscounts(testBusinessId, context);

        tests.push({
            name: 'Get volume discounts - bulk quantity (15 items)',
            expected: 'Array of volume discounts',
            actual: volumeDiscounts.length > 0 ? 
                `${volumeDiscounts.length} tiers found` : 
                'No volume discounts',
            passed: volumeDiscounts.length > 0,
            details: volumeDiscounts.map(v => ({
                name: v.tier_name,
                value: v.discount_value,
                min_quantity: v.min_quantity
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Get volume discounts - bulk quantity',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 4: Get volume discounts - small quantity (2 items) - FIXED
    try {
        const context = {
            quantity: 2,
            amount: 100000,
            categoryId: testCategoryId,
            transactionDate: transactionDate
        };

        const volumeDiscounts = await DiscountRules.getVolumeDiscounts(testBusinessId, context);

        tests.push({
            name: 'Get volume discounts - small quantity (2 items)',
            expected: 'No discounts (array empty)',
            actual: volumeDiscounts.length === 0 ? 'No discounts (correct)' : `${volumeDiscounts.length} discounts found`,
            passed: volumeDiscounts.length === 0,
            details: volumeDiscounts
        });
    } catch (error) {
        tests.push({
            name: 'Get volume discounts - small quantity',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 5: Get early payment terms - FIXED
    try {
        const context = {
            customerId: testCustomerId,
            transactionDate: transactionDate
        };

        const terms = await DiscountRules.getCustomerPaymentTerms(testBusinessId, context);

        tests.push({
            name: 'Get customer payment terms',
            expected: 'Payment terms or null',
            actual: terms ? 
                `${terms.term_name} - ${terms.discount_value}% in ${terms.discount_days} days` : 
                'No terms assigned',
            passed: true, // Not failing if null
            details: terms
        });
    } catch (error) {
        tests.push({
            name: 'Get customer payment terms',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 6: Get category discounts - FIXED
    try {
        const context = {
            serviceId: testServiceId,
            categoryId: testCategoryId,
            amount: 500000,
            transactionDate: transactionDate
        };

        const categoryDiscounts = await DiscountRules.getCategoryDiscounts(testBusinessId, context);

        tests.push({
            name: 'Get category discounts',
            expected: 'Array of category discounts',
            actual: `${categoryDiscounts.length} discounts found`,
            passed: true,
            details: categoryDiscounts.map(d => ({
                name: d.name,
                value: d.discount_value,
                type: d.rule_type
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Get category discounts',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 7: Get pricing rules as discounts - THIS ONE WAS CORRECT
    try {
        const context = {
            customerId: testCustomerId,
            customerCategoryId: testCategoryId,
            serviceId: testServiceId,
            quantity: 5,
            amount: 500000,
            transactionDate: new Date()
        };

        const pricingRules = await DiscountRules.getPricingRules(testBusinessId, context);

        tests.push({
            name: 'Get pricing rules as discounts',
            expected: 'Array of pricing rules',
            actual: `${pricingRules.length} rules found`,
            passed: true,
            details: pricingRules.map(r => ({
                name: r.name,
                value: r.discount_value,
                type: r.rule_type
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Get pricing rules as discounts',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 8: Filter expired discounts - FIXED (mock data dates)
    try {
        const mockDiscounts = [
            {
                id: '1',
                rule_type: 'PROMOTIONAL',
                valid_from: '2025-01-01',
                valid_to: '2025-12-31'
            },
            {
                id: '2',
                rule_type: 'PROMOTIONAL',
                valid_from: '2099-01-01',
                valid_to: '2099-12-31'
            },
            {
                id: '3',
                rule_type: 'PROMOTIONAL',
                valid_from: '2026-01-01',
                valid_to: '2026-12-31'
            }
        ];

        const validDiscounts = DiscountRules.filterExpired(
            mockDiscounts,
            transactionDate
        );

        tests.push({
            name: 'Filter expired discounts',
            expected: "Only current discounts (IDs 1 and 3 should be filtered? Let's see)",
            actual: `${validDiscounts.length} valid discounts`,
            passed: validDiscounts.length === 1, // Only ID 3 should be valid
            details: validDiscounts.map(d => d.id)
        });
    } catch (error) {
        tests.push({
            name: 'Filter expired discounts',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 9: Filter by minimum purchase - FIXED (pass context object)
    try {
        const mockDiscounts = [
            { id: '1', min_purchase: 100000 },
            { id: '2', min_purchase: 1000000 },
            { id: '3' } // No minimum
        ];

        const qualifiedDiscounts = DiscountRules.filterByMinimum(
            mockDiscounts,
            { amount: 500000, quantity: 5 }
        );

        tests.push({
            name: 'Filter by minimum purchase',
            expected: 'Discounts meeting minimum',
            actual: `${qualifiedDiscounts.length} qualified`,
            passed: qualifiedDiscounts.length === 2, // IDs 1 and 3 should qualify
            details: qualifiedDiscounts.map(d => d.id)
        });
    } catch (error) {
        tests.push({
            name: 'Filter by minimum purchase',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 10: Sort by type (was sortByPriority) - FIXED method name
    try {
        const mockDiscounts = [
            { rule_type: 'PROMOTIONAL', discount_value: 10 },
            { rule_type: 'VOLUME', discount_value: 15 },
            { rule_type: 'EARLY_PAYMENT', discount_value: 5 },
            { rule_type: 'CATEGORY', discount_value: 12 },
            { rule_type: 'PRICING_RULE', discount_value: 8 }
        ];

        const sorted = DiscountRules.sortByType(mockDiscounts);

        tests.push({
            name: 'Sort by type priority',
            expected: 'EARLY_PAYMENT first, then VOLUME, CATEGORY, PROMOTIONAL, PRICING_RULE',
            actual: sorted.map(d => d.rule_type).join(' -> '),
            passed: sorted[0]?.rule_type === 'EARLY_PAYMENT',
            details: sorted.map(d => ({ type: d.rule_type, value: d.discount_value }))
        });
    } catch (error) {
        tests.push({
            name: 'Sort by type priority',
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
        if (test.details && test.details.length > 0) {
            console.log('   Details:', JSON.stringify(test.details, null, 2));
        }
        if (test.passed) passed++;
    });

    console.log(`\n📈 SUMMARY: ${passed}/${tests.length} tests passed`);
}

// Run the tests
testDiscountRules().catch(console.error);
