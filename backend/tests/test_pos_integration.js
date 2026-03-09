// File: ~/Bizzy_Track_pro/backend/tests/test_pos_integration.js
// PURPOSE: Test POS integration with discount system including approval flow

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { POSService } from '../app/services/posService.js';
import { DiscountRuleEngine } from '../app/services/discountRuleEngine.js';
import { getClient } from '../app/utils/database.js';

async function testPosDiscountIntegration() {
    console.log('\n🧪 TESTING POS + DISCOUNT INTEGRATION WITH APPROVAL FLOW');
    console.log('========================================================\n');

    const testBusinessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    const testUserId = 'd5f407e3-ac71-4b91-b03e-ec50f908c3d1';
    const testCustomerId = 'ac0d2540-2e6b-4efe-b890-72c013fdc597';
    const testServiceId = 'a7885ecb-ee2e-4702-ac3f-c5e131ea8410';

    const tests = [];

    // Test 1: Create POS transaction with promo code that requires approval
    try {
        console.log('📝 Creating POS transaction with promo_code: TEST16 (15% off - requires approval)');

        const transactionData = {
            customer_id: testCustomerId,
            items: [
                {
                    service_id: testServiceId,
                    item_type: 'service',
                    item_name: 'Premium Service',
                    quantity: 2,
                    unit_price: 1000000
                }
            ],
            payment_method: 'cash',
            promo_code: 'TEST16',  // Using TEST16 which triggers approval at 20%
            notes: 'Test transaction with promo discount requiring approval'
        };

        const result = await POSService.createTransaction(testBusinessId, transactionData, testUserId);

        // Check if approval is required
        if (result.requires_approval) {
            console.log('⚠️ Transaction requires approval:', result.approval_id);
            
            tests.push({
                name: 'POS with promo code requiring approval',
                expected: 'Transaction created with pending approval',
                actual: `Approval required, ID: ${result.approval_id}`,
                passed: true,
                details: {
                    transactionId: result.id,
                    transactionNumber: result.transaction_number,
                    subtotal: result.total_amount,
                    discountAmount: result.discount_amount || 0,
                    finalAmount: result.final_amount,
                    requires_approval: result.requires_approval,
                    approval_id: result.approval_id
                }
            });

            // Store the approval ID for the next test
            const approvalId = result.approval_id;

            // Test 2: Approve the discount
            try {
                console.log(`\n📝 Approving discount for approval ID: ${approvalId}`);
                
                const approveResult = await DiscountRuleEngine.processApproval(
                    approvalId,
                    'APPROVE',
                    testUserId,
                    { reason: 'Approved for testing' }
                );

                // Check if approval was successful
                const approved = approveResult && 
                    (approveResult.status === 'approved' || 
                     approveResult.message?.toLowerCase().includes('approved'));

                tests.push({
                    name: 'Approve discount',
                    expected: 'Discount approved successfully',
                    actual: approveResult.status || approveResult.message || 'Approved',
                    passed: approved,
                    details: approveResult
                });

                // Optional: Verify the approval was updated
                if (approved) {
                    console.log('✅ Discount approved successfully');
                    
                    // You could optionally try to create a transaction with this pre-approved discount
                    // But that would be a separate test
                }

            } catch (approveError) {
                console.error('❌ Error approving discount:', approveError);
                tests.push({
                    name: 'Approve discount',
                    expected: 'Success',
                    actual: `Error: ${approveError.message}`,
                    passed: false,
                    details: {
                        error: approveError.message,
                        stack: approveError.stack
                    }
                });
            }
        } else {
            // This shouldn't happen with TEST16
            tests.push({
                name: 'POS with promo code requiring approval',
                expected: 'Approval required',
                actual: 'No approval required',
                passed: false,
                details: result
            });
        }

    } catch (error) {
        console.error('❌ Error in POS test:', error);
        tests.push({
            name: 'POS with promo code (TEST16)',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false,
            details: {
                error: error.message,
                stack: error.stack
            }
        });
    }

    // Test 3: Try to create transaction with pre-approved flag
    try {
        console.log('\n📝 Creating POS transaction with pre_approved=true');

        const preApprovedData = {
            customer_id: testCustomerId,
            items: [
                {
                    service_id: testServiceId,
                    item_type: 'service',
                    item_name: 'Premium Service (Pre-approved)',
                    quantity: 3,
                    unit_price: 1000000
                }
            ],
            payment_method: 'cash',
            promo_code: 'TEST16',
            pre_approved: true,  // Mark as pre-approved
            notes: 'Test transaction with pre-approved discount'
        };

        const result = await POSService.createTransaction(testBusinessId, preApprovedData, testUserId);

        // Check if discount was applied
        const hasDiscount = result.discount_amount > 0 &&
                           parseFloat(result.discount_amount) > 0;

        // Calculate expected discount (should be around 34% from stacking)
        const expectedDiscountMin = 900000; // At least 30% of 3,000,000
        const actualDiscount = parseFloat(result.discount_amount) || 0;

        tests.push({
            name: 'POS with pre-approved discount',
            expected: 'Transaction created with discount (no approval needed)',
            actual: hasDiscount ? `Discount applied: ${result.discount_amount}` : 'No discount',
            passed: hasDiscount && !result.requires_approval && actualDiscount >= expectedDiscountMin,
            details: {
                transactionId: result.id,
                transactionNumber: result.transaction_number,
                subtotal: result.total_amount,
                discountAmount: result.discount_amount,
                finalAmount: result.final_amount,
                requires_approval: result.requires_approval,
                expectedDiscountMin,
                actualDiscount,
                discount_info: result.discount_info || 'No discount info'
            }
        });

        // Verify discount allocation if available
        if (result.id) {
            const client = await getClient();
            try {
                const allocationCheck = await client.query(
                    `SELECT da.*, pd.promo_code
                     FROM discount_allocations da
                     LEFT JOIN promotional_discounts pd ON da.promotional_discount_id = pd.id
                     WHERE da.pos_transaction_id = $1::uuid`,
                    [result.id]
                );

                console.log('\n📊 Discount allocation check:', {
                    found: allocationCheck.rows.length > 0,
                    count: allocationCheck.rows.length,
                    allocations: allocationCheck.rows
                });

                // Note: The allocation might fail due to FK constraint but transaction still succeeds
                // This is expected behavior for now until we fix the allocation service
            } finally {
                client.release();
            }
        }

    } catch (error) {
        console.error('❌ Error in pre-approved POS test:', error);
        tests.push({
            name: 'POS with pre-approved discount',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false,
            details: {
                error: error.message,
                stack: error.stack
            }
        });
    }

    // Print results
    console.log('\n📊 TEST RESULTS:');
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
    
    // Optional: Show next steps
    console.log('\n🔍 NEXT STEPS:');
    console.log('1. Fix discount allocation foreign key constraint');
    console.log('2. Add test for transaction with approved discount');
    console.log('3. Add test for discount rejection');
}

testPosDiscountIntegration().catch(console.error);
