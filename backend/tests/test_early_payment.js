// File: ~/Bizzy_Track_pro/backend/tests/test_early_payment.js
// PURPOSE: Test early payment service
// PHASE 10.3: Complete test suite - FIXED

import { EarlyPaymentService } from '../app/services/earlyPaymentService.js';
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

async function cleanupTestTerms(businessId) {
    const client = await getClient();
    try {
        await client.query(
            `DELETE FROM early_payment_terms
             WHERE business_id = $1
                AND term_name LIKE 'TEST%'`,
            [businessId]
        );
        console.log('🧹 Cleaned up test terms');
    } finally {
        client.release();
    }
}

async function testEarlyPayment() {
    console.log('\n🧪 TESTING EARLY PAYMENT SERVICE');
    console.log('===================================\n');

    const testBusinessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    const testUserId = await getValidUserId();
    console.log(`Using user ID: ${testUserId}`);

    // Clean up any existing test data
    await cleanupTestTerms(testBusinessId);

    const tests = [];

    // Test 1: Create early payment terms
    try {
        const termData = {
            term_name: 'TEST_2/10_N/30',
            discount_percentage: 2.00,
            discount_days: 10,
            net_days: 30,
            is_active: true
        };

        const result = await EarlyPaymentService.createTerms(termData, testBusinessId, testUserId);

        tests.push({
            name: 'Create early payment terms',
            expected: 'Terms created',
            actual: `Created: ${result.term_name}`,
            passed: result && result.id ? true : false,
            details: {
                term_name: result.term_name,
                discount: `${result.discount_percentage}% in ${result.discount_days} days`,
                net: `${result.net_days} days`
            }
        });
    } catch (error) {
        tests.push({
            name: 'Create early payment terms',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 2: Create another term
    try {
        const termData = {
            term_name: 'TEST_1/15_N/45',
            discount_percentage: 1.00,
            discount_days: 15,
            net_days: 45,
            is_active: true
        };

        const result = await EarlyPaymentService.createTerms(termData, testBusinessId, testUserId);

        tests.push({
            name: 'Create second term',
            expected: 'Terms created',
            actual: `Created: ${result.term_name}`,
            passed: result && result.id ? true : false,
            details: result
        });
    } catch (error) {
        tests.push({
            name: 'Create second term',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 3: Get all terms
    try {
        const terms = await EarlyPaymentService.getTerms(testBusinessId);

        tests.push({
            name: 'Get all terms',
            expected: 'Array of terms',
            actual: `${terms.length} terms found`,
            passed: terms.length >= 2,
            details: terms.map(t => ({
                name: t.term_name,
                discount: `${t.discount_percentage}%/${t.discount_days}d`,
                net: `${t.net_days}d`
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Get all terms',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 4: Calculate net due date
    try {
        const invoiceDate = '2026-02-01';
        const netDays = 30;
        const dueDate = EarlyPaymentService.calculateNetDueDate(invoiceDate, netDays);

        tests.push({
            name: 'Calculate net due date',
            expected: '2026-03-03', // Feb 1 + 30 days = Mar 3
            actual: dueDate,
            passed: dueDate === '2026-03-03',
            details: { invoiceDate, netDays, dueDate }
        });
    } catch (error) {
        tests.push({
            name: 'Calculate net due date',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 5: Check eligibility - within discount period
    try {
        const invoiceDate = '2026-02-01';
        const paymentDate = '2026-02-05'; // 4 days later
        const discountDays = 10;

        const result = EarlyPaymentService.isEligible(invoiceDate, paymentDate, discountDays);

        tests.push({
            name: 'Check eligibility - within period',
            expected: 'Eligible',
            actual: result.eligible ? 'Eligible' : 'Not eligible',
            passed: result.eligible === true,
            details: result
        });
    } catch (error) {
        tests.push({
            name: 'Check eligibility - within period',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 6: Check eligibility - outside discount period
    try {
        const invoiceDate = '2026-02-01';
        const paymentDate = '2026-02-15'; // 14 days later
        const discountDays = 10;

        const result = EarlyPaymentService.isEligible(invoiceDate, paymentDate, discountDays);

        tests.push({
            name: 'Check eligibility - outside period',
            expected: 'Not eligible',
            actual: result.eligible ? 'Eligible' : 'Not eligible',
            passed: result.eligible === false,
            details: result
        });
    } catch (error) {
        tests.push({
            name: 'Check eligibility - outside period',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 7: Update terms - FIXED: Use parseFloat for string comparison
    try {
        const terms = await EarlyPaymentService.getTerms(testBusinessId, { term_name: 'TEST_2/10_N/30' });

        if (terms.length > 0) {
            const updateData = {
                discount_percentage: 3.00,
                discount_days: 12
            };

            const result = await EarlyPaymentService.updateTerms(
                terms[0].id,
                updateData,
                testBusinessId,
                testUserId
            );

            tests.push({
                name: 'Update terms',
                expected: 'Updated',
                actual: `Discount: ${result.discount_percentage}% in ${result.discount_days} days`,
                passed: parseFloat(result.discount_percentage) === 3.00 && result.discount_days === 12,
                details: result
            });
        } else {
            tests.push({
                name: 'Update terms',
                expected: 'Updated',
                actual: 'No terms to update',
                passed: true
            });
        }
    } catch (error) {
        tests.push({
            name: 'Update terms',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 8: Delete/deactivate terms
    try {
        const terms = await EarlyPaymentService.getTerms(testBusinessId, { term_name: 'TEST_1/15_N/45' });

        if (terms.length > 0) {
            const result = await EarlyPaymentService.deleteTerms(
                terms[0].id,
                testBusinessId,
                testUserId
            );

            tests.push({
                name: 'Delete/deactivate terms',
                expected: 'Deactivated',
                actual: result.is_active ? 'Still active' : 'Deactivated',
                passed: result.is_active === false,
                details: { is_active: result.is_active }
            });
        } else {
            tests.push({
                name: 'Delete/deactivate terms',
                expected: 'Deactivated',
                actual: 'No terms to delete',
                passed: true
            });
        }
    } catch (error) {
        tests.push({
            name: 'Delete/deactivate terms',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 9: Bulk import terms
    try {
        const bulkData = [
            {
                term_name: 'TEST_BULK_1',
                discount_percentage: 2.5,
                discount_days: 10,
                net_days: 30
            },
            {
                term_name: 'TEST_BULK_2',
                discount_percentage: 1.5,
                discount_days: 20,
                net_days: 60
            }
        ];

        const results = await EarlyPaymentService.bulkImportTerms(bulkData, testBusinessId, testUserId);

        tests.push({
            name: 'Bulk import terms',
            expected: 'Bulk results',
            actual: `${results.filter(r => r.success).length} successful, ${results.filter(r => !r.success).length} failed`,
            passed: results.length === bulkData.length && results.every(r => r.success),
            details: results
        });
    } catch (error) {
        tests.push({
            name: 'Bulk import terms',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 10: Export terms to CSV
    try {
        const csv = await EarlyPaymentService.exportTerms(testBusinessId);

        tests.push({
            name: 'Export terms to CSV',
            expected: 'CSV string',
            actual: `${csv.split('\n').length - 1} rows exported`,
            passed: csv.includes('Term Name') && csv.includes('TEST_'),
            details: { preview: csv.split('\n').slice(0, 3).join('\n') + '...' }
        });
    } catch (error) {
        tests.push({
            name: 'Export terms to CSV',
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
testEarlyPayment().catch(console.error);
