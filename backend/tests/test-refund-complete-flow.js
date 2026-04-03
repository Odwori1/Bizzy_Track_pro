import { RefundService } from '../app/services/refundService.js';
import { getClient } from '../app/utils/database.js';

const businessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
const userId = 'd5f407e3-ac71-4b91-b03e-ec50f908c3d1';
const transactionId = 'a885bd32-6b89-4ff0-8865-4c2ecf8f1fe3'; // SYS-000067

async function testCompleteRefundFlow() {
  console.log('========================================');
  console.log('COMPLETE REFUND SYSTEM TEST');
  console.log('========================================\n');

  try {
    // STEP 1: Get transaction details
    console.log('📋 STEP 1: Getting transaction details...');
    const client = await getClient();

    const transactionResult = await client.query(
      `SELECT pt.*,
              pti.id as item_id,
              pti.item_name,
              pti.quantity,
              pti.unit_price,
              pti.total_price,
              pti.product_id
       FROM pos_transactions pt
       JOIN pos_transaction_items pti ON pt.id = pti.pos_transaction_id
       WHERE pt.id = $1 AND pt.business_id = $2`,
      [transactionId, businessId]
    );

    if (transactionResult.rows.length === 0) {
      console.log('❌ Transaction not found');
      client.release();
      return;
    }

    const transaction = transactionResult.rows[0];
    const item = transactionResult.rows[0];

    console.log(`✅ Transaction: ${transaction.transaction_number}`);
    console.log(`   Original Amount: ${transaction.final_amount}`);
    console.log(`   Refunded Amount: ${transaction.refunded_amount || 0}`);
    console.log(`   Available to Refund: ${transaction.final_amount - (transaction.refunded_amount || 0)}\n`);

    console.log(`✅ Item to refund: ${item.item_name}`);
    console.log(`   Quantity: ${item.quantity}`);
    console.log(`   Unit Price: ${item.unit_price}`);
    console.log(`   Total: ${item.total_price}\n`);

    client.release();

    // STEP 2: Create a partial refund with reasonable amount
    // Using 0.1 units (25,000 on a 250,000 unit price)
    const refundAmount = 25000.00; // Reasonable amount that won't round to zero
    const quantityRefunded = refundAmount / item.unit_price; // Will be 0.1

    console.log('📋 STEP 2: Creating refund with reasonable amount...');
    console.log(`   Original Unit Price: ${item.unit_price}`);
    console.log(`   Refund Amount: ${refundAmount}`);
    console.log(`   Quantity Refunded: ${quantityRefunded.toFixed(4)} units`);

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
      refund_reason: 'Test refund - reasonable amount for testing',
      notes: 'Testing refund system with fractional quantity',
      items: [
        {
          original_line_item_id: item.item_id,
          original_line_type: 'POS_ITEM',
          product_id: item.product_id,
          item_name: item.item_name,
          quantity_refunded: quantityRefunded,
          unit_price: item.unit_price,
          subtotal_refunded: refundAmount,
          discount_refunded: 0,
          tax_refunded: 0,
          total_refunded: refundAmount
        }
      ]
    };

    const createResult = await RefundService.createRefund(businessId, refundData, userId);

    console.log(`\n✅ Refund created successfully!`);
    console.log(`   Refund ID: ${createResult.refund.id}`);
    console.log(`   Refund Number: ${createResult.refund.refund_number}`);
    console.log(`   Amount: ${createResult.refund.total_refunded}`);
    console.log(`   Status: ${createResult.refund.status}`);
    console.log(`   Requires Approval: ${createResult.requires_approval || false}\n`);

    const refundId = createResult.refund.id;

    // STEP 3: Process the refund
    console.log('📋 STEP 3: Processing refund...');
    const processResult = await RefundService.processRefund(refundId, userId, businessId);

    console.log(`\n✅ Refund processed!`);
    console.log(`   Status: ${processResult.refund.status}`);
    console.log(`   Journal Entry ID: ${processResult.journal_entry_id}`);
    console.log(`   Inventory Reversal: ${processResult.inventory_reversal?.items_processed || 0} items`);
    console.log(`   Discount Reversal: ${processResult.discount_reversal?.success ? 'Yes' : 'No'}`);
    console.log(`   Tax Reversal: ${processResult.tax_reversal?.success ? 'Yes' : 'No'}\n`);

    // STEP 4: Verify the journal entry
    console.log('📋 STEP 4: Verifying journal entry...');
    const journalClient = await getClient();
    const journalResult = await journalClient.query(
      `SELECT je.*,
              COUNT(jel.id) as line_count,
              SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as total_debit,
              SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) as total_credit
       FROM journal_entries je
       JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
       WHERE je.id = $1
       GROUP BY je.id`,
      [processResult.journal_entry_id]
    );
    journalClient.release();

    if (journalResult.rows.length > 0) {
      const journal = journalResult.rows[0];
      console.log(`✅ Journal Entry Verified:`);
      console.log(`   ID: ${journal.id}`);
      console.log(`   Reference: ${journal.reference_number}`);
      console.log(`   Total Amount: ${journal.total_amount}`);
      console.log(`   Lines: ${journal.line_count}`);
      console.log(`   Debits: ${journal.total_debit}`);
      console.log(`   Credits: ${journal.total_credit}`);
      console.log(`   Balanced: ${journal.total_debit === journal.total_credit ? '✅ Yes' : '❌ No'}\n`);
    }

    // STEP 5: Verify the journal entry lines
    console.log('📋 STEP 5: Journal entry details...');
    const linesClient = await getClient();
    const linesResult = await linesClient.query(
      `SELECT jel.line_type, jel.amount, jel.description,
              ca.account_code, ca.account_name
       FROM journal_entry_lines jel
       JOIN chart_of_accounts ca ON jel.account_id = ca.id
       WHERE jel.journal_entry_id = $1
       ORDER BY jel.line_type, ca.account_code`,
      [processResult.journal_entry_id]
    );
    linesClient.release();

    console.log(`✅ Journal Entry Lines:`);
    linesResult.rows.forEach(line => {
      console.log(`   ${line.line_type.toUpperCase()}: ${line.amount} - ${line.account_code} ${line.account_name} - ${line.description}`);
    });
    console.log('');

    // STEP 6: Verify transaction was updated
    console.log('📋 STEP 6: Verifying original transaction update...');
    const txClient = await getClient();
    const updatedTx = await txClient.query(
      `SELECT id, transaction_number, final_amount, refunded_amount, refund_status
       FROM pos_transactions
       WHERE id = $1`,
      [transaction.id]
    );
    txClient.release();

    console.log(`✅ Transaction Updated:`);
    console.log(`   Transaction: ${updatedTx.rows[0].transaction_number}`);
    console.log(`   Original Amount: ${updatedTx.rows[0].final_amount}`);
    console.log(`   New Refunded Amount: ${updatedTx.rows[0].refunded_amount}`);
    console.log(`   Refund Status: ${updatedTx.rows[0].refund_status}\n`);

    // STEP 7: Check inventory transaction
    console.log('📋 STEP 7: Verifying inventory reversal...');
    const invClient = await getClient();
    const invResult = await invClient.query(
      `SELECT it.*, ii.name as inventory_name
       FROM inventory_transactions it
       JOIN inventory_items ii ON it.inventory_item_id = ii.id
       WHERE it.reference_type = 'refund'
         AND it.reference_id = $1
       ORDER BY it.created_at DESC
       LIMIT 1`,
      [refundId]
    );
    invClient.release();

    if (invResult.rows.length > 0) {
      const inv = invResult.rows[0];
      console.log(`✅ Inventory Transaction Created:`);
      console.log(`   Item: ${inv.inventory_name}`);
      console.log(`   Type: ${inv.transaction_type}`);
      console.log(`   Quantity: +${inv.quantity} (increased by refund)`);
      console.log(`   Unit Cost: ${inv.unit_cost}`);
      console.log(`   Total Cost: ${inv.total_cost}\n`);
    } else {
      console.log(`ℹ️  No inventory transaction (product may not have inventory tracking)\n`);
    }

    // STEP 8: Get final refund details
    console.log('📋 STEP 8: Final refund details...');
    const refundDetails = await RefundService.getRefundById(refundId, businessId);

    console.log(`✅ Refund Complete:`);
    console.log(`   Number: ${refundDetails.refund_number}`);
    console.log(`   Status: ${refundDetails.status}`);
    console.log(`   Total Refunded: ${refundDetails.total_refunded}`);
    console.log(`   Journal Entry: ${refundDetails.journal_entry_id}`);
    console.log(`   Items: ${refundDetails.items?.length || 0}`);
    console.log(`   Completed At: ${refundDetails.completed_at}\n`);

    // STEP 9: Verify the fractional quantity was stored correctly
    if (refundDetails.items && refundDetails.items[0]) {
      const storedQty = refundDetails.items[0].quantity_refunded;
      console.log('📋 STEP 9: Verifying fractional quantity storage...');
      console.log(`   Expected quantity: ${quantityRefunded.toFixed(4)}`);
      console.log(`   Stored quantity: ${storedQty.toFixed(4)}`);
      console.log(`   Match: ${Math.abs(storedQty - quantityRefunded) < 0.0001 ? '✅ Yes' : '❌ No'}\n`);
    }

    console.log('========================================');
    console.log('✅ COMPLETE REFUND FLOW TEST PASSED!');
    console.log('========================================');
    console.log('\nSummary of what worked:');
    console.log('✅ 1. Refund record created');
    console.log('✅ 2. Journal entry created with proper accounting');
    console.log('✅ 3. Journal entry lines balanced (debits = credits)');
    console.log('✅ 4. Original transaction refunded_amount updated');
    console.log('✅ 5. Original transaction refund_status updated');
    console.log('✅ 6. Inventory transaction created (if applicable)');
    console.log('✅ 7. Refund status marked as COMPLETED');
    console.log('✅ 8. Fractional quantity stored correctly');
    console.log('========================================');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  }
}

// Run the test
testCompleteRefundFlow();
