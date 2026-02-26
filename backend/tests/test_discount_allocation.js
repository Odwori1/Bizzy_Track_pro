// File: ~/Bizzy_Track_pro/backend/tests/test_discount_allocation.js
// PURPOSE: Test discount allocation service with real database operations
// PHASE 10.6: Complete test suite - Creates its own test data

import { DiscountAllocationService } from '../app/services/discountAllocationService.js';
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
        // Create a test POS transaction with discount
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
                440000,  // total_amount (after discount)
                60000,   // discount_amount
                440000,  // final_amount (same as total_amount)
                'cash',  // payment_method
                'completed', // payment_status
                'completed', // status
                userId
            ]
        );
        
        const transaction = result.rows[0];
        
        // Create test line items - include ALL required fields
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
        
        // Get the created line items
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
        // Create a test invoice with discount
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
                750000,  // subtotal
                90000,   // discount_amount
                660000,  // total_amount
                0,       // amount_paid
                'draft', // status
                userId
            ]
        );
        
        const invoice = result.rows[0];
        
        // Create test line items - total_price is GENERATED, so don't insert it
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
        
        // Get the created line items
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
        // Delete allocation lines first (due to foreign key)
        await client.query(
            `DELETE FROM discount_allocation_lines 
             WHERE allocation_id IN (
                 SELECT id FROM discount_allocations 
                 WHERE business_id = $1 
                 AND allocation_number LIKE 'TEST-%'
             )`,
            [businessId]
        );
        
        // Delete test allocations
        await client.query(
            `DELETE FROM discount_allocations 
             WHERE business_id = $1 
             AND allocation_number LIKE 'TEST-%'`,
            [businessId]
        );
        
        // Delete test POS transactions and their items (cascade should handle items)
        await client.query(
            `DELETE FROM pos_transactions 
             WHERE business_id = $1 
             AND transaction_number LIKE 'TEST-POS-%'`,
            [businessId]
        );
        
        // Delete test invoices and their items (cascade should handle items)
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
            name: 'Allocate by line amount (pro-rata)',
            expected: '3 allocations',
            actual: `${allocations.length} allocations`,
            passed: allocations.length === 3,
            details: allocations.map(a => ({
                item: a.line_item_id,
                original: a.original_amount,
                discount: a.allocated_discount,
                percentage: a.allocation_percentage.toFixed(2) + '%'
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
                original: a.original_amount,
                discount: a.allocated_discount,
                quantity: a.quantity,
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
                weight: weights[i],
                discount: a.allocated_discount
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
                original: a.original_amount,
                discount: a.allocated_discount,
                percentage: a.allocation_percentage + '%'
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
            { allocated_discount: 30000 },
            { allocated_discount: 20000 },
            { allocated_discount: 10000 }
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
            { allocated_discount: 30000 },
            { allocated_discount: 20000 },
            { allocated_discount: 15000 }
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
        // Test 7: Create POS allocation record (using volume discount rule)
        try {
            // First, calculate allocations for the POS items using their real IDs
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
                discount_rule_id: DISCOUNT_RULES.volume, // Using volume discount rule
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

            // Store the allocation ID for later tests
            global.testAllocationId = result.id;
            global.testAllocationNumber = result.allocation_number;

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
        // Test 8: Create Invoice allocation record (using promotional discount rule)
        try {
            // Calculate allocations for the invoice items using their real IDs
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
                promotional_discount_id: DISCOUNT_RULES.promotional, // Using promotional discount rule
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

    if (global.testAllocationId) {
        // Test 9: Get allocation by ID with lines
        try {
            const allocation = await DiscountAllocationService.getAllocationWithLines(
                global.testAllocationId,
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
                global.testAllocationId,
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
                global.testAllocationId,
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
                    status: result.status,
                    reason: result.rejection_reason
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
            }))
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

        tests.push({
            name: 'Export allocations to CSV',
            expected: 'CSV string',
            actual: `${csv.split('\n').length - 1} rows exported`,
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
