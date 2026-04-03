// test-refund-flow.js - Direct Node.js test for refund system
import { RefundService } from '../app/services/refundService.js';
import { getClient } from '../app/utils/database.js';

const businessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
const userId = 'd5f407e3-ac71-4b91-b03e-ec50f908c3d1';

async function testRefundFlow() {
  console.log('========================================');
  console.log('REFUND SYSTEM TEST - NODE.JS DIRECT');
  console.log('========================================\n');

  try {
    // STEP 1: Get a valid POS transaction with items
    console.log('📋 STEP 1: Finding a valid POS transaction...');
    const client = await getClient();
    
    const transactionResult = await client.query(
      `SELECT pt.*, 
              COUNT(pti.id) as item_count,
              COALESCE(pt.refunded_amount, 0) as refunded_amount,
              (pt.final_amount - COALESCE(pt.refunded_amount, 0)) as available_refund
       FROM pos_transactions pt
       LEFT JOIN pos_transaction_items pti ON pt.id = pti.pos_transaction_id
       WHERE pt.business_id = $1 
         AND pt.status = 'completed'
         AND (pt.refund_status IS NULL OR pt.refund_status != 'FULL')
         AND (pt.final_amount - COALESCE(pt.refunded_amount, 0)) > 0
       GROUP BY pt.id
       ORDER BY pt.created_at DESC
       LIMIT 1`,
      [businessId]
    );
    
    client.release();
    
    if (transactionResult.rows.length === 0) {
      console.log('❌ No eligible POS transactions found for testing');
      return;
    }
    
    const transaction = transactionResult.rows[0];
    console.log(`✅ Found transaction: ${transaction.transaction_number}`);
    console.log(`   Original Amount: ${transaction.final_amount}`);
    console.log(`   Already Refunded: ${transaction.refunded_amount}`);
    console.log(`   Available to Refund: ${transaction.available_refund}\n`);
    
    // STEP 2: Get transaction items with available quantities
    console.log('📋 STEP 2: Getting transaction items...');
    const itemsClient = await getClient();
    const itemsResult = await itemsClient.query(
      `SELECT pti.*,
              COALESCE(SUM(ri.quantity_refunded), 0) as already_refunded_qty
       FROM pos_transaction_items pti
       LEFT JOIN refund_items ri ON ri.original_line_item_id = pti.id 
          AND ri.original_line_type = 'POS_ITEM'
       WHERE pti.pos_transaction_id = $1 
         AND pti.business_id = $2
       GROUP BY pti.id
       HAVING (pti.quantity - COALESCE(SUM(ri.quantity_refunded), 0)) > 0
       LIMIT 1`,
      [transaction.id, businessId]
    );
    itemsClient.release();
    
    if (itemsResult.rows.length === 0) {
      console.log('❌ No refundable items found for this transaction');
      return;
    }
    
    const item = itemsResult.rows[0];
    const availableQty = item.quantity - (item.already_refunded_qty || 0);
    const refundAmount = Math.min(item.unit_price, transaction.available_refund);
    
    console.log(`✅ Found refundable item: ${item.item_name}`);
    console.log(`   Original Quantity: ${item.quantity}`);
    console.log(`   Already Refunded: ${item.already_refunded_qty || 0}`);
    console.log(`   Available Quantity: ${availableQty}`);
    console.log(`   Unit Price: ${item.unit_price}`);
    console.log(`   Will refund: ${refundAmount} (1 unit)\n`);
    
    // STEP 3: Create a partial refund
    console.log('📋 STEP 3: Creating partial refund...');
    const refundData = {
      business_id: businessId,
      original_transaction_id: transaction.id,
      original_transaction_type: 'POS',
      refund_type: 'PARTIAL',
      refund_method: 'CASH',
      subtotal_refunded: refundAmount,
      discount_refunded: 0,
      tax_refunded: 0,
      total_refunded: refundAmount,
      refund_reason: 'Test refund - customer returned item',
      items: [
        {
          original_line_item_id: item.id,
          original_line_type: 'POS_ITEM',
          product_id: item.product_id,
          service_id: item.service_id,
          item_name: item.item_name,
          quantity_refunded: 1,
          unit_price: item.unit_price,
          subtotal_refunded: refundAmount,
          discount_refunded: 0,
          tax_refunded: 0,
          total_refunded: refundAmount
        }
      ]
    };
    
    const createResult = await RefundService.createRefund(businessId, refundData, userId);
    console.log(`✅ Refund created:`);
    console.log(`   ID: ${createResult.refund.id}`);
    console.log(`   Number: ${createResult.refund.refund_number}`);
    console.log(`   Amount: ${createResult.refund.total_refunded}`);
    console.log(`   Status: ${createResult.refund.status}`);
    console.log(`   Requires approval: ${createResult.requires_approval || false}\n`);
    
    const refundId = createResult.refund.id;
    
    // STEP 4: Process the refund
    console.log('📋 STEP 4: Processing refund...');
    const processResult = await RefundService.processRefund(refundId, userId, businessId);
    
    console.log(`✅ Refund processed:`);
    console.log(`   Status: ${processResult.refund.status}`);
    console.log(`   Journal Entry ID: ${processResult.journal_entry_id}`);
    console.log(`   Inventory reversal: ${processResult.inventory_reversal?.items_processed || 0} items`);
    console.log(`   Discount reversal: ${processResult.discount_reversal?.success ? 'Yes' : 'No'}`);
    console.log(`   Tax reversal: ${processResult.tax_reversal?.success ? 'Yes' : 'No'}\n`);
    
    // STEP 5: Verify the refund details
    console.log('📋 STEP 5: Fetching refund details...');
    const refundDetails = await RefundService.getRefundById(refundId, businessId);
    
    console.log(`✅ Refund details:`);
    console.log(`   Number: ${refundDetails.refund_number}`);
    console.log(`   Status: ${refundDetails.status}`);
    console.log(`   Total: ${refundDetails.total_refunded}`);
    console.log(`   Items count: ${refundDetails.items?.length || 0}`);
    console.log(`   Inventory transactions: ${refundDetails.inventory_transactions?.length || 0}`);
    console.log(`   Discount reversals: ${refundDetails.discount_reversals?.length || 0}`);
    console.log(`   Tax reversals: ${refundDetails.tax_reversals?.length || 0}\n`);
    
    // STEP 6: Check original transaction update
    console.log('📋 STEP 6: Checking original transaction...');
    const txClient = await getClient();
    const updatedTx = await txClient.query(
      `SELECT refunded_amount, refund_status FROM pos_transactions WHERE id = $1`,
      [transaction.id]
    );
    txClient.release();
    
    console.log(`✅ Original transaction updated:`);
    console.log(`   New refunded_amount: ${updatedTx.rows[0].refunded_amount}`);
    console.log(`   New refund_status: ${updatedTx.rows[0].refund_status}\n`);
    
    // STEP 7: List all refunds
    console.log('📋 STEP 7: Listing all refunds...');
    const listResult = await RefundService.listRefunds(businessId, { limit: 5 });
    
    console.log(`✅ Found ${listResult.refunds.length} refunds:`);
    listResult.refunds.forEach((ref, idx) => {
      console.log(`   ${idx + 1}. ${ref.refund_number} - ${ref.status} - ${ref.total_refunded}`);
    });
    console.log(`   Total pages: ${listResult.pagination.pages}\n`);
    
    console.log('========================================');
    console.log('✅ TEST COMPLETED SUCCESSFULLY!');
    console.log('========================================');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  }
}

// Run the test
testRefundFlow();
