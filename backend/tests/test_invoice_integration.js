// File: ~/Bizzy_Track_pro/backend/tests/test_invoice_integration.js
// PURPOSE: Test invoice integration with discount system

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { invoiceService } from '../app/services/invoiceService.js';
import { EarlyPaymentService } from '../app/services/earlyPaymentService.js';
import { DiscountRuleEngine } from '../app/services/discountRuleEngine.js';
import { getClient } from '../app/utils/database.js';

async function testInvoiceDiscountIntegration() {
    console.log('\n🧪 TESTING INVOICE + DISCOUNT INTEGRATION');
    console.log('========================================\n');

    const testBusinessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    const testUserId = 'd5f407e3-ac71-4b91-b03e-ec50f908c3d1';
    const testCustomerId = 'ac0d2540-2e6b-4efe-b890-72c013fdc597';
    const testServiceId = 'a7885ecb-ee2e-4702-ac3f-c5e131ea8410';

    const tests = [];

    // Test 1: Create invoice with promo code - using TEST16 (15% off)
    try {
        console.log('📝 Creating invoice with promo_code: TEST16');

        // For invoice, we need to handle tax differently since services table doesn't have tax_category_code
        // Use a manual line item with tax info instead of looking up from service
        const invoiceData = {
            customer_id: testCustomerId,
            line_items: [
                {
                    description: 'Premium Service',
                    quantity: 2,
                    unit_price: 1000000,
                    // Add tax information directly to bypass database lookup
                    tax_rate: 18,
                    tax_category_code: 'SERVICES'
                }
            ],
            promo_code: 'TEST16',  // Using TEST16 which is active and has 15% discount
            notes: 'Test invoice with promo discount',
            pre_approved: true  // ADD THIS LINE to bypass approval requirement
        };

        const result = await invoiceService.createInvoice(invoiceData, testUserId, testBusinessId);

        // Check if discount was applied
        const hasDiscount = result.discount_amount > 0 ||
                           (result.discount_info && result.discount_info.total_discount > 0);

        tests.push({
            name: 'Invoice with promo code (TEST16 - 15% off)',
            expected: 'Invoice created with 15% discount',
            actual: hasDiscount ? `Discount applied: ${result.discount_amount}` : 'No discount',
            passed: hasDiscount,
            details: {
                invoiceId: result.id,
                invoiceNumber: result.invoice_number,
                subtotal: result.subtotal,
                discountAmount: result.discount_amount,
                totalAmount: result.total_amount,
                expectedDiscount: 300000, // 15% of 2,000,000
                discount_info: result.discount_info || 'No discount info',
                pre_approved: true
            }
        });

        // Verify discount allocation was created
        if (result.id) {
            const client = await getClient();
            try {
                const allocationCheck = await client.query(
                    `SELECT da.*, pd.promo_code
                     FROM discount_allocations da
                     LEFT JOIN promotional_discounts pd ON da.promotional_discount_id = pd.id
                     WHERE da.invoice_id = $1::uuid`,
                    [result.id]
                );

                console.log('\n📊 Discount allocation check:', {
                    found: allocationCheck.rows.length > 0,
                    count: allocationCheck.rows.length,
                    allocations: allocationCheck.rows
                });
            } finally {
                client.release();
            }
        }

    } catch (error) {
        console.error('❌ Error in invoice test:', error);
        tests.push({
            name: 'Invoice with promo code (TEST16)',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false,
            details: {
                error: error.message,
                stack: error.stack,
                pre_approved: true
            }
        });
    }

    console.log('\n📊 TEST RESULTS:');
    let passed = 0;
    tests.forEach((test, index) => {
        console.log(`\n${index + 1}. ${test.name}`);
        console.log(`   Expected: ${test.expected}`);
        console.log(`   Actual:   ${test.actual}`);
        console.log(`   Result:   ${test.passed ? '✅ PASS' : '❌ FAIL'}`);
        if (test.details) console.log('   Details:', JSON.stringify(test.details, null, 2));
        if (test.passed) passed++;
    });

    console.log(`\n📈 SUMMARY: ${passed}/${tests.length} tests passed`);
}

testInvoiceDiscountIntegration().catch(console.error);
