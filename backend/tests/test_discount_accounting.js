// File: ~/Bizzy_Track_pro/backend/tests/test_discount_accounting.js
// PURPOSE: Test discount accounting service
// PHASE 10.7: Complete test suite - FINAL VERSION with proper UUIDs

import { DiscountAccountingService } from '../app/services/discountAccountingService.js';
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

async function cleanupTestJournals(businessId) {
    const client = await getClient();
    try {
        // Delete journal lines first - using journal_entry_lines
        await client.query(
            `DELETE FROM journal_entry_lines
             WHERE journal_entry_id IN (
                 SELECT id FROM journal_entries
                 WHERE business_id = $1 AND reference_number LIKE 'TEST-%'
             )`,
            [businessId]
        );
        // Delete journal entries
        await client.query(
            `DELETE FROM journal_entries
             WHERE business_id = $1 AND reference_number LIKE 'TEST-%'`,
            [businessId]
        );
        console.log('🧹 Cleaned up test journal entries');
    } catch (error) {
        console.log('Note: Cleanup failed -', error.message);
    } finally {
        client.release();
    }
}

async function ensureChartOfAccounts(businessId) {
    const client = await getClient();
    try {
        // Check if chart_of_accounts exists and has records
        const result = await client.query(
            `SELECT COUNT(*) as count FROM chart_of_accounts WHERE business_id = $1`,
            [businessId]
        );
        
        if (parseInt(result.rows[0].count) === 0) {
            console.log('📝 No chart of accounts found, inserting standard accounts...');
            
            // Insert standard discount accounts
            await client.query(
                `INSERT INTO chart_of_accounts (business_id, account_code, account_name, account_type)
                 VALUES 
                    ($1, '4110', 'Sales Discounts - General', 'expense'),
                    ($1, '4111', 'Sales Discounts - Volume', 'expense'),
                    ($1, '4112', 'Sales Discounts - Early Payment', 'expense'),
                    ($1, '4113', 'Sales Discounts - Promotional', 'expense'),
                    ($1, '4100', 'Sales Revenue', 'revenue'),
                    ($1, '2200', 'VAT Payable', 'liability')
                 ON CONFLICT (business_id, account_code) DO NOTHING`,
                [businessId]
            );
            console.log('✅ Standard accounts created');
        }
    } catch (error) {
        console.log('Note: Could not ensure chart of accounts:', error.message);
    } finally {
        client.release();
    }
}

// Helper function to generate UUID-like strings for testing
function generateTestUuid(prefix) {
    // Generate a deterministic UUID-like string for testing
    // Format: 00000000-0000-0000-0000-XXXXXXXXXXXX where X is the prefix padded
    const padded = prefix.padStart(12, '0').slice(0, 12);
    return `00000000-0000-0000-0000-${padded}`;
}

async function testDiscountAccounting() {
    console.log('\n🧪 TESTING DISCOUNT ACCOUNTING SERVICE');
    console.log('========================================\n');

    const testBusinessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    const testUserId = await getValidUserId();
    console.log(`Using user ID: ${testUserId}`);

    // Generate test UUIDs
    const testAllocationId1 = generateTestUuid('001');
    const testAllocationId2 = generateTestUuid('002');
    const testAllocationId3 = generateTestUuid('003');
    const testAllocationId4 = generateTestUuid('004');

    console.log(`Using test allocation IDs: ${testAllocationId1}, ${testAllocationId2}, ${testAllocationId3}, ${testAllocationId4}`);

    // Ensure chart of accounts exists
    await ensureChartOfAccounts(testBusinessId);

    // Clean up any existing test data
    await cleanupTestJournals(testBusinessId);

    const tests = [];

    // Test 1: Get discount account by type
    try {
        const testCases = [
            { type: 'PROMOTIONAL', expected: '4113' },
            { type: 'VOLUME', expected: '4111' },
            { type: 'EARLY_PAYMENT', expected: '4112' },
            { type: 'CATEGORY', expected: '4110' },
            { type: 'PRICING_RULE', expected: '4110' },
            { type: 'UNKNOWN', expected: '4110' }
        ];

        const results = testCases.map(t => ({
            type: t.type,
            actual: DiscountAccountingService.getDiscountAccountByType(t.type),
            expected: t.expected,
            passed: DiscountAccountingService.getDiscountAccountByType(t.type) === t.expected
        }));

        tests.push({
            name: 'Get discount account by type',
            expected: 'Correct account codes',
            actual: `${results.filter(r => r.passed).length}/${results.length} correct`,
            passed: results.every(r => r.passed),
            details: results
        });
    } catch (error) {
        tests.push({
            name: 'Get discount account by type',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 2: Calculate tax impact
    try {
        const result = await DiscountAccountingService.calculateTaxImpact(100000, 18);

        tests.push({
            name: 'Calculate tax impact',
            expected: 'Tax impact: 18000',
            actual: `Tax impact: ${result.taxImpact}`,
            passed: result.taxImpact === 18000,
            details: result
        });
    } catch (error) {
        tests.push({
            name: 'Calculate tax impact',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 3: Calculate tax impact - zero discount
    try {
        const result = await DiscountAccountingService.calculateTaxImpact(0, 18);

        tests.push({
            name: 'Calculate tax impact - zero discount',
            expected: 'No impact',
            actual: `Tax impact: ${result.taxImpact}`,
            passed: result.taxImpact === 0,
            details: result
        });
    } catch (error) {
        tests.push({
            name: 'Calculate tax impact - zero discount',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 4: Create single discount journal entry - FIXED with proper UUID
    try {
        const transaction = {
            business_id: testBusinessId,
            id: generateTestUuid('trans001'),
            type: 'POS'
        };

        const discountInfo = {
            rule_type: 'PROMOTIONAL',
            name: 'WELCOME10',
            code: 'WELCOME10',
            discount_amount: 50000,
            allocation_id: testAllocationId1
        };

        const result = await DiscountAccountingService.createDiscountJournalEntry(
            transaction,
            discountInfo,
            testUserId
        );

        tests.push({
            name: 'Create single discount journal entry',
            expected: 'Journal entry created',
            actual: `Created: ${result.reference_number}`,
            passed: result && result.journal_id ? true : false,
            details: {
                reference_number: result.reference_number,
                amount: result.discount_amount,
                account: result.account_code,
                lines: result.lines
            }
        });
    } catch (error) {
        tests.push({
            name: 'Create single discount journal entry',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 5: Create bulk discount journal entries - FIXED with proper UUIDs
    try {
        const transaction = {
            business_id: testBusinessId,
            id: generateTestUuid('trans002'),
            type: 'INVOICE'
        };

        const discounts = [
            {
                rule_type: 'PROMOTIONAL',
                discount_amount: 30000,
                allocation_id: testAllocationId2
            },
            {
                rule_type: 'VOLUME',
                discount_amount: 20000,
                allocation_id: testAllocationId3
            },
            {
                rule_type: 'EARLY_PAYMENT',
                discount_amount: 15000,
                allocation_id: testAllocationId4
            }
        ];

        const result = await DiscountAccountingService.createBulkDiscountJournalEntries(
            transaction,
            discounts,
            testUserId
        );

        tests.push({
            name: 'Create bulk discount journal entries',
            expected: 'Bulk journal created',
            actual: `Created: ${result.reference_number} with ${result.discount_count} discounts`,
            passed: result && result.journal_id ? true : false,
            details: {
                reference_number: result.reference_number,
                total_discount: result.total_discount,
                discount_count: result.discount_count,
                accounts: result.accounts
            }
        });
    } catch (error) {
        tests.push({
            name: 'Create bulk discount journal entries',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 6: Reconcile discounts
    try {
        const result = await DiscountAccountingService.reconcileDiscounts(
            testBusinessId,
            new Date()
        );

        tests.push({
            name: 'Reconcile discounts',
            expected: 'Reconciliation object',
            actual: result.is_reconciled ? 'Reconciled' : 'Has discrepancies',
            passed: result && result.summary ? true : false,
            details: {
                total_allocations: result.summary?.total_allocations,
                linked: result.summary?.linked_allocations,
                unlinked: result.summary?.unlinked_allocations,
                is_reconciled: result.is_reconciled
            }
        });
    } catch (error) {
        tests.push({
            name: 'Reconcile discounts',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 7: Find unaccounted discounts
    try {
        const startDate = '2026-02-01';
        const endDate = '2026-02-28';

        const result = await DiscountAccountingService.findUnaccountedDiscounts(
            testBusinessId,
            startDate,
            endDate
        );

        tests.push({
            name: 'Find unaccounted discounts',
            expected: 'Array of unaccounted discounts',
            actual: `${result.length} unaccounted found`,
            passed: Array.isArray(result),
            details: result.map(r => ({
                number: r.allocation_number,
                amount: r.total_discount_amount,
                source: r.source_type,
                source_number: r.source_number
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Find unaccounted discounts',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 8: Generate reconciliation report
    try {
        const result = await DiscountAccountingService.generateReconciliationReport(
            testBusinessId,
            new Date().toISOString().split('T')[0]
        );

        tests.push({
            name: 'Generate reconciliation report',
            expected: 'Report object',
            actual: result ? 'Report generated' : 'No report',
            passed: result && result.report_date ? true : false,
            details: {
                report_date: result.report_date,
                total_allocations: result.reconciliation_summary?.total_allocations,
                is_reconciled: result.is_reconciled,
                daily_totals_count: result.daily_totals?.length
            }
        });
    } catch (error) {
        tests.push({
            name: 'Generate reconciliation report',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 9: Get discount journal entries
    try {
        const startDate = '2026-02-01';
        const endDate = '2026-02-28';

        const result = await DiscountAccountingService.getDiscountJournalEntries(
            testBusinessId,
            startDate,
            endDate
        );

        tests.push({
            name: 'Get discount journal entries',
            expected: 'Array of journal entries',
            actual: `${result.length} entries found`,
            passed: Array.isArray(result),
            details: result.map(e => ({
                reference_number: e.reference_number,
                date: e.journal_date,
                description: e.description,
                total: e.total_debit
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Get discount journal entries',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 10: Export discount journal entries to CSV
    try {
        const startDate = '2026-02-01';
        const endDate = '2026-02-28';

        const csv = await DiscountAccountingService.exportDiscountJournalEntries(
            testBusinessId,
            startDate,
            endDate
        );

        tests.push({
            name: 'Export discount journal entries to CSV',
            expected: 'CSV string',
            actual: `${csv.split('\n').length - 1} rows exported`,
            passed: csv.includes('Reference Number') && csv.includes('Total Debit'),
            details: { preview: csv.split('\n').slice(0, 3).join('\n') + '...' }
        });
    } catch (error) {
        tests.push({
            name: 'Export discount journal entries to CSV',
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
testDiscountAccounting().catch(console.error);
