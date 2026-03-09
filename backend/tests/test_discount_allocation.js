// File: ~/Bizzy_Track_pro/backend/tests/test_discount_allocation.js
// PURPOSE: Test discount allocation service with real database operations
// FIXED: Properly passes allocation ID between tests and matches schema
// UPDATED: Added void reason tracking tests

import { DiscountAllocationService } from '../app/services/discountAllocationService.js';
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

async function getValidCustomerId(businessId) {
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

// Hardcoded discount rule IDs from your database
const DISCOUNT_RULES = {
    volume: 'e652faad-bab7-4a08-8c25-27d9b5cc951c',
    promotional: '86ed6b3e-fd3d-426b-afd8-94217f943d35'
};

async function createTestPOSTransaction(businessId, userId, customerId) {
    const client = await getClient();
    try {
        const result = await client.query(
            `INSERT INTO pos_transactions (
                business_id, transaction_number, transaction_date,
                customer_id, total_amount, discount_amount, final_amount,
                payment_method, payment_status, status, created_by, created_at,
                total_discount
            ) VALUES (
                $1, $2, NOW(),
                $3, $4, $5, $6,
                $7, $8, $9, $10, NOW(),
                $5
            ) RETURNING id, transaction_number`,
            [
                businessId,
                `TEST-POS-${Date.now()}`,
                customerId,
                440000,
                60000,
                440000,
                'cash',
                'completed',
                'completed',
                userId
            ]
        );

        const transaction = result.rows[0];

        await client.query(
            `INSERT INTO pos_transaction_items (
                business_id, pos_transaction_id, item_type, item_name,
                quantity, unit_price, total_price, discount_amount,
                created_at
            ) VALUES
            ($1, $2, 'service', 'Test Service 1', 1, 300000, 300000, 0, NOW()),
            ($1, $2, 'product', 'Test Product 1', 2, 200000, 400000, 0, NOW()),
            ($1, $2, 'service', 'Test Service 2', 1, 100000, 100000, 0, NOW())`,
            [businessId, transaction.id]
        );

        const itemsResult = await client.query(
            `SELECT id FROM pos_transaction_items
             WHERE pos_transaction_id = $1
             ORDER BY created_at ASC`,
            [transaction.id]
        );

        return {
            id: transaction.id,
            number: transaction.transaction_number,
            lineItemIds: itemsResult.rows.map(r => r.id)
        };
    } catch (error) {
        console.error('POS transaction creation error details:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

async function createTestInvoice(businessId, userId, customerId) {
    const client = await getClient();
    try {
        const result = await client.query(
            `INSERT INTO invoices (
                business_id, invoice_number, invoice_date,
                customer_id, subtotal, discount_amount, total_amount,
                amount_paid, status, created_by, created_at,
                total_discount
            ) VALUES (
                $1, $2, NOW(),
                $3, $4, $5, $6,
                $7, $8, $9, NOW(),
                $5
            ) RETURNING id, invoice_number`,
            [
                businessId,
                `TEST-INV-${Date.now()}`,
                customerId,
                750000,
                90000,
                660000,
                0,
                'draft',
                userId
            ]
        );

        const invoice = result.rows[0];

        await client.query(
            `INSERT INTO invoice_line_items (
                invoice_id, description, quantity, unit_price,
                tax_category_code, discount_amount, created_at
            ) VALUES
            ($1, 'Test Item 1', 2, 200000, 'STANDARD_GOODS', 0, NOW()),
            ($1, 'Test Item 2', 1, 150000, 'STANDARD_GOODS', 0, NOW()),
            ($1, 'Test Item 3', 1, 200000, 'STANDARD_GOODS', 0, NOW())`,
            [invoice.id]
        );

        const itemsResult = await client.query(
            `SELECT id FROM invoice_line_items
             WHERE invoice_id = $1
             ORDER BY created_at ASC`,
            [invoice.id]
        );

        return {
            id: invoice.id,
            number: invoice.invoice_number,
            lineItemIds: itemsResult.rows.map(r => r.id)
        };
    } catch (error) {
        console.error('Invoice creation error details:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

async function cleanupTestData(businessId) {
    const client = await getClient();
    try {
        // First delete allocation lines
        await client.query(
            `DELETE FROM discount_allocation_lines
             WHERE allocation_id IN (
                 SELECT id FROM discount_allocations
                 WHERE business_id = $1
                 AND (allocation_number LIKE 'DA-2026-03-%')
             )`,
            [businessId]
        );

        // Then delete allocations
        await client.query(
            `DELETE FROM discount_allocations
             WHERE business_id = $1
             AND (allocation_number LIKE 'DA-2026-03-%')`,
            [businessId]
        );

        // Then delete POS transactions
        await client.query(
            `DELETE FROM pos_transactions
             WHERE business_id = $1
             AND transaction_number LIKE 'TEST-POS-%'`,
            [businessId]
        );

        // Then delete invoices
        await client.query(
            `DELETE FROM invoices
             WHERE business_id = $1
             AND invoice_number LIKE 'TEST-INV-%'`,
            [businessId]
        );

        console.log('🧹 Test data cleaned up');
    } catch (error) {
        console.error('Cleanup error:', error.message);
    } finally {
        client.release();
    }
}

async function testDiscountAllocation() {
    console.log('\n🧪 TESTING DISCOUNT ALLOCATION SERVICE');
    console.log('========================================\n');

    const testBusinessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    const testUserId = await getValidUserId();
    const testCustomerId = await getValidCustomerId(testBusinessId);

    console.log(`Using user ID: ${testUserId}`);
    console.log(`Using customer ID: ${testCustomerId}`);
    console.log(`Using volume discount rule ID: ${DISCOUNT_RULES.volume}`);
    console.log(`Using promotional discount rule ID: ${DISCOUNT_RULES.promotional}`);

    // Clean up any existing test data
    await cleanupTestData(testBusinessId);

    // Create test transactions
    console.log('\n📝 Creating test transactions...');
    let testPOS, testInvoice;
    let posAllocationId = null;
    let invoiceAllocationId = null;

    try {
        testPOS = await createTestPOSTransaction(testBusinessId, testUserId, testCustomerId);
        console.log(`✅ Created POS transaction: ${testPOS.number} with ${testPOS.lineItemIds.length} items`);
        console.log(`   Line item IDs: ${testPOS.lineItemIds.join(', ')}`);
    } catch (error) {
        console.error('❌ Failed to create POS transaction:', error.message);
        testPOS = null;
    }

    try {
        testInvoice = await createTestInvoice(testBusinessId, testUserId, testCustomerId);
        console.log(`✅ Created Invoice: ${testInvoice.number} with ${testInvoice.lineItemIds.length} items`);
        console.log(`   Line item IDs: ${testInvoice.lineItemIds.join(', ')}`);
    } catch (error) {
        console.error('❌ Failed to create Invoice:', error.message);
        testInvoice = null;
    }

    const tests = [];

    // Test 1: Allocate by line amount (pro-rata)
    try {
        const lineItems = [
            { id: 'item1', type: 'service', amount: 300000, quantity: 1 },
            { id: 'item2', type: 'product', amount: 200000, quantity: 2 },
            { id: 'item3', type: 'service', amount: 100000, quantity: 1 }
        ];
        const totalDiscount = 60000;

        const allocations = DiscountAllocationService.allocateByLineAmount(lineItems, totalDiscount);

        tests.push({
            name: 'Allocate by line amount',
            expected: '3 allocations',
            actual: `${allocations.length} allocations`,
            passed: allocations.length === 3,
            details: allocations.map(a => ({
                item: a.line_item_id,
                line_amount: a.line_amount,
                discount_amount: a.discount_amount,
                allocation_weight: a.allocation_weight
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Allocate by line amount',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 2: Allocate by quantity
    try {
        const lineItems = [
            { id: 'item1', type: 'service', amount: 300000, quantity: 1 },
            { id: 'item2', type: 'product', amount: 200000, quantity: 2 },
            { id: 'item3', type: 'service', amount: 100000, quantity: 1 }
        ];
        const totalDiscount = 60000;

        const allocations = DiscountAllocationService.allocateByQuantity(lineItems, totalDiscount);

        tests.push({
            name: 'Allocate by quantity',
            expected: '3 allocations',
            actual: `${allocations.length} allocations`,
            passed: allocations.length === 3,
            details: allocations.map(a => ({
                item: a.line_item_id,
                quantity: a.quantity,
                discount_amount: a.discount_amount,
                discount_per_unit: a.discount_per_unit
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Allocate by quantity',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 3: Allocate by custom weights
    try {
        const lineItems = [
            { id: 'item1', type: 'service', amount: 300000, quantity: 1 },
            { id: 'item2', type: 'product', amount: 200000, quantity: 2 },
            { id: 'item3', type: 'service', amount: 100000, quantity: 1 }
        ];
        const weights = [0.5, 0.3, 0.2];
        const totalDiscount = 60000;

        const allocations = DiscountAllocationService.allocateByCustomWeights(
            lineItems,
            weights,
            totalDiscount
        );

        tests.push({
            name: 'Allocate by custom weights',
            expected: '3 allocations',
            actual: `${allocations.length} allocations`,
            passed: allocations.length === 3,
            details: allocations.map((a, i) => ({
                item: a.line_item_id,
                weight: a.allocation_weight,
                discount_amount: a.discount_amount
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Allocate by custom weights',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 4: Allocate by fixed percentage
    try {
        const lineItems = [
            { id: 'item1', type: 'service', amount: 300000, quantity: 1 },
            { id: 'item2', type: 'product', amount: 200000, quantity: 2 },
            { id: 'item3', type: 'service', amount: 100000, quantity: 1 }
        ];
        const discountPercentage = 10;

        const allocations = DiscountAllocationService.allocateByPercentage(
            lineItems,
            discountPercentage
        );

        tests.push({
            name: 'Allocate by fixed percentage',
            expected: '3 allocations',
            actual: `${allocations.length} allocations`,
            passed: allocations.length === 3,
            details: allocations.map(a => ({
                item: a.line_item_id,
                line_amount: a.line_amount,
                discount_amount: a.discount_amount,
                allocation_weight: a.allocation_weight
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Allocate by fixed percentage',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 5: Validate allocation total - correct
    try {
        const allocations = [
            { discount_amount: 30000 },
            { discount_amount: 20000 },
            { discount_amount: 10000 }
        ];
        const expectedTotal = 60000;

        const result = DiscountAllocationService.validateAllocationTotal(allocations, expectedTotal);

        tests.push({
            name: 'Validate allocation total - correct',
            expected: 'Valid',
            actual: result.valid ? 'Valid' : 'Invalid',
            passed: result.valid === true,
            details: {
                actual: result.actual,
                expected: result.expected,
                difference: result.difference
            }
        });
    } catch (error) {
        tests.push({
            name: 'Validate allocation total - correct',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 6: Validate allocation total - incorrect
    try {
        const allocations = [
            { discount_amount: 30000 },
            { discount_amount: 20000 },
            { discount_amount: 15000 }
        ];
        const expectedTotal = 60000;

        const result = DiscountAllocationService.validateAllocationTotal(allocations, expectedTotal);

        tests.push({
            name: 'Validate allocation total - incorrect',
            expected: 'Invalid',
            actual: result.valid ? 'Valid' : 'Invalid',
            passed: result.valid === false,
            details: {
                actual: result.actual,
                expected: result.expected,
                difference: result.difference
            }
        });
    } catch (error) {
        tests.push({
            name: 'Validate allocation total - incorrect',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Only run database tests if we successfully created test transactions
    if (testPOS) {
        // Test 7: Create POS allocation record
        try {
            const lineItems = [
                { id: testPOS.lineItemIds[0], amount: 300000, quantity: 1 },
                { id: testPOS.lineItemIds[1], amount: 200000, quantity: 2 },
                { id: testPOS.lineItemIds[2], amount: 100000, quantity: 1 }
            ];

            const allocations = DiscountAllocationService.allocateByLineAmount(lineItems, 60000);
            console.log('POS Allocations calculated:', JSON.stringify(allocations, null, 2));

            const allocationData = {
                pos_transaction_id: testPOS.id,
                invoice_id: null,
                discount_rule_id: DISCOUNT_RULES.volume,
                promotional_discount_id: null,
                total_discount_amount: 60000,
                allocation_method: 'PRO_RATA_AMOUNT',
                status: 'APPLIED',
                applied_at: new Date(),
                lines: allocations
            };

            const result = await DiscountAllocationService.createAllocation(
                allocationData,
                testUserId,
                testBusinessId
            );

            posAllocationId = result.id;

            tests.push({
                name: 'Create POS allocation record',
                expected: 'Allocation created',
                actual: `Created: ${result.allocation_number}`,
                passed: result && result.id ? true : false,
                details: {
                    id: result.id,
                    number: result.allocation_number,
                    total: result.total_discount_amount,
                    method: result.allocation_method,
                    status: result.status
                }
            });

        } catch (error) {
            tests.push({
                name: 'Create POS allocation record',
                expected: 'Success',
                actual: `Error: ${error.message}`,
                passed: false
            });
        }
    }

    if (testInvoice) {
        // Test 8: Create Invoice allocation record
        try {
            const lineItems = [
                { id: testInvoice.lineItemIds[0], amount: 200000, quantity: 2 },
                { id: testInvoice.lineItemIds[1], amount: 150000, quantity: 1 },
                { id: testInvoice.lineItemIds[2], amount: 200000, quantity: 1 }
            ];

            const allocations = DiscountAllocationService.allocateByQuantity(lineItems, 90000);
            console.log('Invoice Allocations calculated:', JSON.stringify(allocations, null, 2));

            const allocationData = {
                pos_transaction_id: null,
                invoice_id: testInvoice.id,
                discount_rule_id: null,
                promotional_discount_id: DISCOUNT_RULES.promotional,
                total_discount_amount: 90000,
                allocation_method: 'PRO_RATA_QUANTITY',
                status: 'APPLIED',
                applied_at: new Date(),
                lines: allocations
            };

            const result = await DiscountAllocationService.createAllocation(
                allocationData,
                testUserId,
                testBusinessId
            );

            invoiceAllocationId = result.id;

            tests.push({
                name: 'Create Invoice allocation record',
                expected: 'Allocation created',
                actual: `Created: ${result.allocation_number}`,
                passed: result && result.id ? true : false,
                details: {
                    id: result.id,
                    number: result.allocation_number,
                    total: result.total_discount_amount,
                    method: result.allocation_method,
                    status: result.status
                }
            });

        } catch (error) {
            tests.push({
                name: 'Create Invoice allocation record',
                expected: 'Success',
                actual: `Error: ${error.message}`,
                passed: false
            });
        }
    }

    // Test 9: Get allocation by ID with lines (using POS allocation)
    if (posAllocationId) {
        try {
            const allocation = await DiscountAllocationService.getAllocationWithLines(
                posAllocationId,
                testBusinessId
            );

            tests.push({
                name: 'Get allocation by ID with lines',
                expected: 'Allocation with lines',
                actual: `Allocation ${allocation.allocation_number} with ${allocation.lines?.length || 0} lines`,
                passed: allocation && allocation.lines && allocation.lines.length > 0,
                details: {
                    number: allocation.allocation_number,
                    line_count: allocation.lines?.length,
                    first_line: allocation.lines?.[0]
                }
            });
        } catch (error) {
            tests.push({
                name: 'Get allocation by ID with lines',
                expected: 'Success',
                actual: `Error: ${error.message}`,
                passed: false
            });
        }

        // Test 10: Get transaction allocations
        try {
            const allocations = await DiscountAllocationService.getTransactionAllocations(
                testPOS.id,
                'POS',
                testBusinessId
            );

            tests.push({
                name: 'Get transaction allocations',
                expected: 'At least 1 allocation',
                actual: `${allocations.length} allocations found`,
                passed: allocations.length >= 1,
                details: allocations.map(a => ({
                    number: a.allocation_number,
                    total: a.total_discount_amount,
                    status: a.status
                }))
            });
        } catch (error) {
            tests.push({
                name: 'Get transaction allocations',
                expected: 'Success',
                actual: `Error: ${error.message}`,
                passed: false
            });
        }

        // Test 11: Check if allocation can be voided
        try {
            const canVoid = await DiscountAllocationService.canVoidAllocation(
                posAllocationId,
                testBusinessId
            );

            tests.push({
                name: 'Check if allocation can be voided',
                expected: 'Boolean',
                actual: canVoid ? 'Can void' : 'Cannot void',
                passed: typeof canVoid === 'boolean',
                details: { can_void: canVoid }
            });
        } catch (error) {
            tests.push({
                name: 'Check if allocation can be voided',
                expected: 'Success',
                actual: `Error: ${error.message}`,
                passed: false
            });
        }

        // Test 12: Void allocation
        try {
            const result = await DiscountAllocationService.voidAllocation(
                posAllocationId,
                'Test void reason',
                testUserId,
                testBusinessId
            );

            tests.push({
                name: 'Void allocation',
                expected: 'VOID',
                actual: result.status,
                passed: result.status === 'VOID',
                details: {
                    id: result.id,
                    status: result.status
                    // rejection_reason doesn't exist in schema
                }
            });
        } catch (error) {
            tests.push({
                name: 'Void allocation',
                expected: 'Success',
                actual: `Error: ${error.message}`,
                passed: false
            });
        }
    }

    // Test 13: Get unallocated discounts
    try {
        const unallocated = await DiscountAllocationService.getUnallocatedDiscounts(testBusinessId);

        tests.push({
            name: 'Get unallocated discounts',
            expected: 'Array of unallocated discounts',
            actual: `${unallocated.length} unallocated found`,
            passed: Array.isArray(unallocated),
            details: unallocated.map(u => ({
                transaction: u.transaction_number,
                type: u.transaction_type,
                discount: u.total_discount
            })).slice(0, 3)
        });
    } catch (error) {
        tests.push({
            name: 'Get unallocated discounts',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 14: Get allocation report
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 1);

        const report = await DiscountAllocationService.getAllocationReport(
            testBusinessId,
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
        );

        tests.push({
            name: 'Get allocation report',
            expected: 'Report object',
            actual: report ? 'Report generated' : 'No report',
            passed: report !== null,
            details: {
                total_allocations: report.summary?.total_allocations || 0,
                total_discount: report.summary?.grand_total_discount || 0,
                applied: report.summary?.applied_count || 0,
                pending: report.summary?.pending_count || 0,
                void: report.summary?.void_count || 0
            }
        });
    } catch (error) {
        tests.push({
            name: 'Get allocation report',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 15: Export allocations to CSV
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 1);

        const csv = await DiscountAllocationService.exportAllocations(
            testBusinessId,
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
        );

        const rowCount = csv.split('\n').length - 1;

        tests.push({
            name: 'Export allocations to CSV',
            expected: 'CSV string',
            actual: `${rowCount} rows exported`,
            passed: csv.includes('Allocation Number'),
            details: { preview: csv.split('\n').slice(0, 3).join('\n') + '...' }
        });
    } catch (error) {
        tests.push({
            name: 'Export allocations to CSV',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 16: Get voided allocations report
    try {
        const voidedAllocations = await DiscountAllocationService.getVoidedAllocations(
            testBusinessId
        );

        tests.push({
            name: 'Get voided allocations report',
            expected: 'Array of voided allocations',
            actual: `${voidedAllocations.length} voided allocations found`,
            passed: Array.isArray(voidedAllocations),
            details: voidedAllocations.map(v => ({
                number: v.allocation_number,
                reason: v.void_reason,
                voided_at: v.voided_at,
                voided_by: v.voided_by_email
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Get voided allocations report',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 17: Get void reason statistics
    try {
        const stats = await DiscountAllocationService.getVoidReasonStats(testBusinessId);

        tests.push({
            name: 'Get void reason statistics',
            expected: 'Array of statistics',
            actual: `${stats.length} reasons found`,
            passed: Array.isArray(stats),
            details: stats.map(s => ({
                reason: s.void_reason,
                count: s.void_count,
                total_amount: s.total_discount_voided
            }))
        });
    } catch (error) {
        tests.push({
            name: 'Get void reason statistics',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }

    // Test 18: Get allocation with details
    if (posAllocationId) {
        try {
            const allocation = await DiscountAllocationService.getAllocationWithDetails(
                posAllocationId,
                testBusinessId
            );

            tests.push({
                name: 'Get allocation with details',
                expected: 'Allocation object with void info',
                actual: allocation ? 'Details retrieved' : 'No allocation',
                passed: allocation && allocation.void_reason !== undefined,
                details: {
                    id: allocation?.id,
                    status: allocation?.status,
                    void_reason: allocation?.void_reason,
                    voided_by: allocation?.voided_by_email,
                    line_count: allocation?.lines?.length
                }
            });
        } catch (error) {
            tests.push({
                name: 'Get allocation with details',
                expected: 'Success',
                actual: `Error: ${error.message}`,
                passed: false
            });
        }
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

    // Clean up test data
    await cleanupTestData(testBusinessId);
}

// Run the tests
testDiscountAllocation().catch(console.error);
