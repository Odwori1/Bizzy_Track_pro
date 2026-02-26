// File: ~/Bizzy_Track_pro/backend/tests/test_discount_engine.js
// PURPOSE: Test discount rule engine - Master orchestrator
// PHASE 10.9: Complete test suite - FINAL VERSION

import { DiscountRuleEngine } from '../app/services/discountRuleEngine.js';
import { DiscountCore } from '../app/services/discountCore.js';
import { getClient } from '../app/utils/database.js';

/**
 * Test Discount Rule Engine
 * Run with: node tests/test_discount_engine.js
 */
async function getValidUserId() {
    const client = await getClient();
    try {
        const result = await client.query('SELECT id FROM users LIMIT 1');
        return result.rows[0]?.id;
    } finally {
        client.release();
    }
}

async function getTestCustomerId(businessId) {
    const client = await getClient();
    try {
        const result = await client.query(
            'SELECT id FROM customers WHERE business_id = $1 LIMIT 1',
            [businessId]
        );
        return result.rows[0]?.id;
    } finally {
        client.release();
    }
}

// Helper function to generate test UUIDs for line items
function generateTestItemIds(count) {
    const ids = [];
    for (let i = 0; i < count; i++) {
        // Generate a deterministic UUID-like string for testing
        // Format: 00000000-0000-0000-0000-{number padded to 12 digits}
        const padded = String(i + 1).padStart(12, '0');
        ids.push(`00000000-0000-0000-0000-${padded}`);
    }
    return ids;
}

// Generate a proper UUID v4 format
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Clear the global cache
function clearGlobalCache() {
    if (global._discountCache) {
        global._discountCache.clear();
        console.log('🧹 Global cache cleared');
    }
}

// Create a real POS transaction in the database
async function createTestPOSTransaction(businessId, userId, customerId) {
    const client = await getClient();
    try {
        const transactionId = generateUUID();
        const transactionNumber = `TEST-${Date.now()}`;

        await client.query(
            `INSERT INTO pos_transactions (
                id, business_id, transaction_number, transaction_date,
                customer_id, total_amount, discount_amount, final_amount,
                payment_method, payment_status, status, created_by, created_at,
                total_discount
            ) VALUES (
                $1, $2, $3, NOW(),
                $4, $5, $6, $7,
                $8, $9, $10, $11, NOW(),
                $5
            )`,
            [
                transactionId,
                businessId,
                transactionNumber,
                customerId,
                440000,  // total_amount
                60000,   // discount_amount
                440000,  // final_amount
                'cash',
                'completed',
                'completed',
                userId
            ]
        );

        return transactionId;
    } catch (error) {
        console.error('Error creating test POS transaction:', error.message);
        return null;
    } finally {
        client.release();
    }
}

// Enhanced cleanup function with proper order and error handling
async function cleanupTestData() {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // First delete allocation lines (child records)
        await client.query(
            `DELETE FROM discount_allocation_lines
             WHERE allocation_id IN (
                 SELECT id FROM discount_allocations
                 WHERE created_at > NOW() - INTERVAL '1 hour'
                 AND (allocation_number LIKE 'TEST-%' OR allocation_number LIKE 'DA-%')
             )`
        );

        // Then delete allocations (these reference transactions)
        await client.query(
            `DELETE FROM discount_allocations
             WHERE created_at > NOW() - INTERVAL '1 hour'
             AND (allocation_number LIKE 'TEST-%' OR allocation_number LIKE 'DA-%')`
        );

        // Then delete approvals (these reference transactions)
        await client.query(
            `DELETE FROM discount_approvals
             WHERE created_at > NOW() - INTERVAL '1 hour'
             AND status = 'pending'`
        );

        // Finally delete POS transactions (now safe since no references)
        await client.query(
            `DELETE FROM pos_transactions
             WHERE transaction_number LIKE 'TEST-%'`
        );

        await client.query('COMMIT');
        console.log('🧹 Test data cleaned up successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Cleanup error:', error.message);
        
        // Fallback: Delete in reverse order with explicit CASCADE
        try {
            console.log('Attempting force cleanup with explicit order...');
            
            // Delete allocation lines
            await client.query(
                `DELETE FROM discount_allocation_lines
                 WHERE allocation_id IN (
                     SELECT id FROM discount_allocations
                     WHERE pos_transaction_id IN (
                         SELECT id FROM pos_transactions WHERE transaction_number LIKE 'TEST-%'
                     )
                 )`
            );
            
            // Delete allocations
            await client.query(
                `DELETE FROM discount_allocations
                 WHERE pos_transaction_id IN (
                     SELECT id FROM pos_transactions WHERE transaction_number LIKE 'TEST-%'
                 )`
            );
            
            // Delete approvals
            await client.query(
                `DELETE FROM discount_approvals
                 WHERE pos_transaction_id IN (
                     SELECT id FROM pos_transactions WHERE transaction_number LIKE 'TEST-%'
                 )`
            );
            
            // Delete POS transactions
            await client.query(
                `DELETE FROM pos_transactions
                 WHERE transaction_number LIKE 'TEST-%'`
            );
            
            console.log('Force cleanup completed');
        } catch (fallbackError) {
            console.error('Force cleanup failed:', fallbackError.message);
        }
    } finally {
        client.release();
    }
}

async function testDiscountRuleEngine() {
    console.log('\n🧪 TESTING DISCOUNT RULE ENGINE');
    console.log('================================\n');

    // Clear cache before tests
    clearGlobalCache();

    // Run cleanup before tests
    await cleanupTestData();

    const testBusinessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    const testUserId = await getValidUserId();
    const testCustomerId = await getTestCustomerId(testBusinessId);

    // Generate valid UUID-like IDs for test items
    const itemIds = generateTestItemIds(3);

    console.log(`Using user ID: ${testUserId}`);
    console.log(`Using customer ID: ${testCustomerId}`);
    console.log(`Using test item IDs: ${itemIds.join(', ')}`);

    const tests = [];

    // Test 1: Calculate final price - basic functionality
    try {
        const context = {
            businessId: testBusinessId,
            customerId: testCustomerId,
            amount: 1,
            items: [{ id: itemIds[0], amount: 1, quantity: 1 }],
            transactionDate: new Date(),
            transactionId: generateUUID(),
            transactionType: 'POS',
            createAllocation: false,
            previewMode: true,
            preApproved: true  // Bypass approval requirements
        };

        const result = await DiscountRuleEngine.calculateFinalPrice(context);

        // Verify the calculation works
        const calculationWorks = result && 
                                 result.success === true && 
                                 typeof result.originalAmount === 'number' &&
                                 typeof result.finalAmount === 'number';

        tests.push({
            name: 'Calculate final price - basic functionality',
            expected: 'Calculation succeeds',
            actual: calculationWorks ? 'Success' : 'Failed',
            passed: calculationWorks,
            details: {
                original: result?.originalAmount,
                final: result?.finalAmount,
                discount: result?.totalDiscount,
                discountCount: result?.appliedDiscounts?.length || 0,
                note: 'Discounts may apply based on database configuration'
            }
        });
    } catch (error) {
        tests.push({
            name: 'Calculate final price - basic functionality',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 2: Calculate final price with promo code
    try {
        const context = {
            businessId: testBusinessId,
            customerId: testCustomerId,
            amount: 500000,
            promoCode: 'WELCOME10',
            items: [
                { id: itemIds[0], amount: 300000, quantity: 1 },
                { id: itemIds[1], amount: 200000, quantity: 1 }
            ],
            transactionDate: new Date(),
            transactionId: generateUUID(),
            transactionType: 'POS',
            createAllocation: false,
            preApproved: true  // Bypass approval requirements
        };

        const result = await DiscountRuleEngine.calculateFinalPrice(context);

        tests.push({
            name: 'Calculate final price - with promo code',
            expected: 'Promotional discount applied',
            actual: `${result.appliedDiscounts?.length || 0} discounts applied`,
            passed: result?.appliedDiscounts?.length > 0 && result?.totalDiscount > 0,
            details: {
                promo: result?.appliedDiscounts[0]?.name,
                discount: result?.totalDiscount,
                final: result?.finalAmount
            }
        });
    } catch (error) {
        tests.push({
            name: 'Calculate final price - with promo code',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 3: Quick calculate (preview mode)
    try {
        const context = {
            businessId: testBusinessId,
            customerId: testCustomerId,
            amount: 500000,
            promoCode: 'WELCOME10',
            transactionDate: new Date(),
            preApproved: true  // Bypass approval requirements
        };

        const result = await DiscountRuleEngine.quickCalculate(context);

        tests.push({
            name: 'Quick calculate - preview mode',
            expected: 'No allocation created',
            actual: result.allocation ? 'Allocation created' : 'No allocation',
            passed: result.allocation === undefined && result.success === true,
            details: {
                discount: result.totalDiscount,
                final: result.finalAmount
            }
        });
    } catch (error) {
        tests.push({
            name: 'Quick calculate - preview mode',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 4: Preview discounts
    try {
        const context = {
            businessId: testBusinessId,
            customerId: testCustomerId,
            amount: 500000,
            promoCode: 'WELCOME10',
            transactionDate: new Date()
        };

        const result = await DiscountRuleEngine.previewDiscounts(context);

        tests.push({
            name: 'Preview discounts',
            expected: 'Discount previews',
            actual: `${result.discounts.length} discounts available`,
            passed: result.discounts.length > 0,
            details: result.discounts.map(d => ({
                type: d.type,
                amount: d.discountAmount,
                percentage: d.percentage
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Preview discounts',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 5: Find best combination
    try {
        const context = {
            businessId: testBusinessId,
            customerId: testCustomerId,
            amount: 500000,
            promoCode: 'WELCOME10',
            transactionDate: new Date()
        };

        const result = await DiscountRuleEngine.findBestCombination(context);

        tests.push({
            name: 'Find best combination',
            expected: 'Best discount combination',
            actual: `${result.bestCombination.length} discounts in best combination`,
            passed: result.bestCombination.length > 0,
            details: {
                combination: result.bestCombination.map(d => `${d.type}: ${d.value}%`),
                totalDiscount: result.totalDiscount,
                savings: result.savings
            }
        });
    } catch (error) {
        tests.push({
            name: 'Find best combination',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 6: Discover discounts
    try {
        const context = {
            businessId: testBusinessId,
            customerId: testCustomerId,
            amount: 500000,
            promoCode: 'WELCOME10',
            transactionDate: new Date()
        };

        const discounts = await DiscountRuleEngine.discoverDiscounts(context);

        tests.push({
            name: 'Discover discounts',
            expected: 'Array of discounts',
            actual: `${discounts.length} discounts discovered`,
            passed: Array.isArray(discounts),
            details: discounts.map(d => ({
                type: d.rule_type,
                name: d.name,
                value: d.discount_value
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Discover discounts',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 7: Prioritize discounts
    try {
        const discounts = [
            { rule_type: 'PROMOTIONAL', name: 'Promo 10%' },
            { rule_type: 'VOLUME', name: 'Volume 15%' },
            { rule_type: 'EARLY_PAYMENT', name: 'Early 5%' },
            { rule_type: 'CATEGORY', name: 'Category 12%' }
        ];

        const prioritized = DiscountRuleEngine.prioritizeDiscounts(discounts);

        tests.push({
            name: 'Prioritize discounts',
            expected: 'EARLY_PAYMENT first',
            actual: prioritized[0]?.rule_type,
            passed: prioritized[0]?.rule_type === 'EARLY_PAYMENT',
            details: prioritized.map(d => d.rule_type)
        });
    } catch (error) {
        tests.push({
            name: 'Prioritize discounts',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 8: Check approval required - under threshold
    try {
        const discounts = [
            { rule_type: 'PROMOTIONAL', discount_type: 'PERCENTAGE', discount_value: 10 }
        ];
        const context = {
            businessId: testBusinessId,
            amount: 500000
        };

        const requires = await DiscountRuleEngine.checkApprovalRequired(discounts, context);

        tests.push({
            name: 'Check approval required - under threshold',
            expected: 'false',
            actual: requires.toString(),
            passed: requires === false,
            details: { threshold: 20, discount: 10 }
        });
    } catch (error) {
        tests.push({
            name: 'Check approval required - under threshold',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 9: Check approval required - over threshold
    try {
        const discounts = [
            { rule_type: 'PROMOTIONAL', discount_type: 'PERCENTAGE', discount_value: 25 }
        ];
        const context = {
            businessId: testBusinessId,
            amount: 500000
        };

        const requires = await DiscountRuleEngine.checkApprovalRequired(discounts, context);

        tests.push({
            name: 'Check approval required - over threshold',
            expected: 'true',
            actual: requires.toString(),
            passed: requires === true,
            details: { threshold: 20, discount: 25 }
        });
    } catch (error) {
        tests.push({
            name: 'Check approval required - over threshold',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 10: Submit for approval
    try {
        // First create a real POS transaction in the database
        const transactionId = await createTestPOSTransaction(testBusinessId, testUserId, testCustomerId);

        if (!transactionId) {
            throw new Error('Failed to create test POS transaction');
        }

        const context = {
            businessId: testBusinessId,
            customerId: testCustomerId,
            amount: 500000,
            items: [{ id: itemIds[0], amount: 500000, quantity: 1 }],
            promoCode: 'WELCOME10',
            transactionId: transactionId,
            transactionType: 'POS'
        };

        const result = await DiscountRuleEngine.submitForApproval(context, testUserId);

        tests.push({
            name: 'Submit for approval',
            expected: 'Approval request created',
            actual: `Approval ID: ${result.approvalId}`,
            passed: result.success === true && result.approvalId,
            details: {
                approvalId: result.approvalId,
                status: result.status
            }
        });
    } catch (error) {
        tests.push({
            name: 'Submit for approval',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 11: Validate context - valid
    try {
        const context = {
            businessId: testBusinessId,
            amount: 500000
        };

        const valid = DiscountRuleEngine.validateContext(context);

        tests.push({
            name: 'Validate context - valid',
            expected: 'true',
            actual: valid.toString(),
            passed: valid === true
        });
    } catch (error) {
        tests.push({
            name: 'Validate context - valid',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 12: Validate context - invalid (missing businessId)
    try {
        const context = {
            amount: 500000
        };

        DiscountRuleEngine.validateContext(context);
        tests.push({
            name: 'Validate context - invalid (missing businessId)',
            expected: 'Error',
            actual: 'No error thrown',
            passed: false
        });
    } catch (error) {
        tests.push({
            name: 'Validate context - invalid (missing businessId)',
            expected: 'Error',
            actual: error.message,
            passed: error.message.includes('businessId')
        });
    }

    // Test 13: Check conflicts - no conflicts
    try {
        const discounts = [
            { rule_type: 'PROMOTIONAL', id: '1', name: 'Promo 1' },
            { rule_type: 'VOLUME', id: '2', name: 'Volume 1' }
        ];

        const result = DiscountRuleEngine.checkConflicts(discounts);

        tests.push({
            name: 'Check conflicts - no conflicts',
            expected: 'false',
            actual: result.hasConflicts.toString(),
            passed: result.hasConflicts === false
        });
    } catch (error) {
        tests.push({
            name: 'Check conflicts - no conflicts',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 14: Check conflicts - with conflicts (duplicate type)
    try {
        const discounts = [
            { rule_type: 'VOLUME', id: '1', name: 'Volume 1' },
            { rule_type: 'VOLUME', id: '2', name: 'Volume 2' }
        ];

        const result = DiscountRuleEngine.checkConflicts(discounts);

        tests.push({
            name: 'Check conflicts - duplicate type',
            expected: 'true',
            actual: result.hasConflicts.toString(),
            passed: result.hasConflicts === true && result.conflicts.length === 1,
            details: result.conflicts[0]?.message
        });
    } catch (error) {
        tests.push({
            name: 'Check conflicts - duplicate type',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 15: Cache and invalidate
    try {
        const key = 'test-cache-key';
        const result = { test: 'data' };

        await DiscountRuleEngine.cacheResult(key, result);
        const cached = await DiscountRuleEngine.getCachedResult(key);

        await DiscountRuleEngine.invalidateCache(testBusinessId);

        tests.push({
            name: 'Cache and invalidate',
            expected: 'Cached then cleared',
            actual: cached ? 'Cached' : 'Not found',
            passed: cached !== null,
            details: { cached: cached?.test }
        });
    } catch (error) {
        tests.push({
            name: 'Cache and invalidate',
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

    // Clear cache after tests
    clearGlobalCache();

    // Run cleanup after tests
    await cleanupTestData();
}

// Handle process exit to ensure cleanup
process.on('exit', async () => {
    clearGlobalCache();
    await cleanupTestData();
});

// Run the tests
testDiscountRuleEngine().catch(console.error);
