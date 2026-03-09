// File: ~/Bizzy_Track_pro/backend/tests/test_approval_flow.js
// PURPOSE: Test discount approval flow

import { DiscountRuleEngine } from '../app/services/discountRuleEngine.js';
import { POSService } from '../app/services/posService.js';
import { getClient } from '../app/utils/database.js';

async function testApprovalFlow() {
    console.log('\n🧪 TESTING DISCOUNT APPROVAL FLOW');
    console.log('==================================\n');

    const testBusinessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    const testUserId = 'd5f407e3-ac71-4b91-b03e-ec50f908c3d1';
    const testCustomerId = 'ac0d2540-2e6b-4efe-b890-72c013fdc597';
    const testServiceId = 'a7885ecb-ee2e-4702-ac3f-c5e131ea8410';

    // Test 1: Submit for approval
    console.log('\n📝 Test 1: Submit discount for approval');
    const approvalRequest = await DiscountRuleEngine.submitForApproval({
        businessId: testBusinessId,
        customerId: testCustomerId,
        amount: 2000000,
        items: [{ id: testServiceId, amount: 1000000, quantity: 2, type: 'service' }],
        promoCode: 'BULK20', // 20% discount
        transactionType: 'POS'
    }, testUserId);

    console.log('Approval request:', approvalRequest);

    // Test 2: Check pending approvals
    console.log('\n📝 Test 2: Check pending approvals');
    const client = await getClient();
    const pending = await client.query(
        `SELECT * FROM discount_approvals
         WHERE business_id = $1 AND status = 'pending'`,
        [testBusinessId]
    );
    console.log('Pending approvals:', pending.rows.length);

    // Test 3: Approve the discount
    console.log('\n📝 Test 3: Approve discount');
    const approveResult = await DiscountRuleEngine.processApproval(
        approvalRequest.approvalId,
        'APPROVE',
        testUserId
    );
    console.log('Approve result:', approveResult);

    // Test 4: Create transaction with pre-approved flag
    console.log('\n📝 Test 4: Create POS transaction with pre-approved discount');
    const transactionData = {
        customer_id: testCustomerId,
        items: [{
            service_id: testServiceId,
            item_type: 'service',
            item_name: 'Premium Service',
            quantity: 2,
            unit_price: 1000000
        }],
        payment_method: 'cash',
        promo_code: 'BULK20',
        pre_approved: true,
        notes: 'Test transaction with pre-approved discount'
    };

    // FIX: Pass businessId as first parameter, then transactionData
    const result = await POSService.createTransaction(testBusinessId, transactionData, testUserId);

    console.log('\n📊 Final Result:');
    console.log('Transaction ID:', result.id);
    console.log('Transaction Number:', result.transaction_number);
    console.log('Subtotal:', result.total_amount);
    console.log('Discount applied:', result.discount_amount);
    console.log('Final amount:', result.final_amount);
    console.log('Requires approval:', result.requires_approval);
    
    if (result.discount_info) {
        console.log('Discount info:', JSON.stringify(result.discount_info, null, 2));
    }

    client.release();
}

testApprovalFlow().catch(console.error);
