// File: backend/app/services/refundService.js
// Complete Refund Service with full integration

import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { InventoryAccountingService } from './inventoryAccountingService.js';
import { AccountingService } from './accountingService.js';
import { TaxService } from './taxService.js';
import { DiscountRuleEngine } from './discountRuleEngine.js';
import { DiscountAllocationService } from './discountAllocationService.js';
import { DiscountAccountingService } from './discountAccountingService.js';

export class RefundService {

  /**
   * Create a new refund request
   * @param {string} businessId - Business ID
   * @param {Object} refundData - Refund details
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Created refund
   */
  static async createRefund(businessId, refundData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Validate original transaction
      const transaction = await this.validateTransaction(
        client,
        businessId,
        refundData.original_transaction_id,
        refundData.original_transaction_type
      );

      // Validate refund amount doesn't exceed original
      const availableRefund = parseFloat(transaction.final_amount) -
                              parseFloat(transaction.refunded_amount || 0);

      if (refundData.total_refunded > availableRefund + 0.01) {
        throw new Error(
          `Refund amount ${refundData.total_refunded} exceeds available refund amount ${availableRefund}`
        );
      }

      // Generate refund number
      const refundNumberResult = await client.query(
        'SELECT generate_refund_number($1) as refund_number',
        [businessId]
      );
      const refundNumber = refundNumberResult.rows[0].refund_number;

      // Refunds do not require approval - original transaction was already approved
      // Approval is for discounts, not refunds
      let requiresApproval = false;
      let approvalId = null;

      // Create refund record
      const refundResult = await client.query(
        `INSERT INTO refunds (
          business_id, refund_number, original_transaction_id,
          original_transaction_type, refund_type, refund_method,
          subtotal_refunded, discount_refunded, tax_refunded, total_refunded,
          refund_reason, notes, status, requires_approval, approval_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          businessId,
          refundNumber,
          refundData.original_transaction_id,
          refundData.original_transaction_type,
          refundData.refund_type,
          refundData.refund_method,
          refundData.subtotal_refunded,
          refundData.discount_refunded || 0,
          refundData.tax_refunded || 0,
          refundData.total_refunded,
          refundData.refund_reason,
          refundData.notes || null,
          'PENDING',
          requiresApproval,
          approvalId,
          userId
        ]
      );

      const refund = refundResult.rows[0];

      // Insert refund items with proper quantity rounding
      if (refundData.items && refundData.items.length > 0) {
        for (const item of refundData.items) {
          // Validate original line item exists
          const lineItemCheck = await client.query(
            `SELECT * FROM pos_transaction_items
             WHERE id = $1 AND pos_transaction_id = $2 AND business_id = $3`,
            [item.original_line_item_id, refundData.original_transaction_id, businessId]
          );

          if (lineItemCheck.rows.length === 0) {
            throw new Error(`Original line item not found: ${item.original_line_item_id}`);
          }

          // Validate quantity doesn't exceed available
          const originalItem = lineItemCheck.rows[0];
          const availableQty = parseFloat(originalItem.quantity) - 
                               parseFloat(originalItem.already_refunded_qty || 0);
          
          // Round quantity to 4 decimal places for precision
          const roundedQuantity = Math.round(item.quantity_refunded * 10000) / 10000;

          // Validate minimum quantity (must be > 0.0000)
          if (roundedQuantity <= 0.0000) {
            throw new Error(
              `Refund quantity ${item.quantity_refunded} rounds to ${roundedQuantity}, which is too small. Minimum refund quantity is 0.0001 units.`
            );
          }
          
          if (roundedQuantity > availableQty + 0.0001) {
            throw new Error(
              `Refund quantity ${roundedQuantity} exceeds available quantity ${availableQty}`
            );
          }

          await client.query(
            `INSERT INTO refund_items (
              refund_id, business_id, original_line_item_id, original_line_type,
              product_id, service_id, item_name,
              quantity_refunded, unit_price, subtotal_refunded,
              discount_refunded, tax_refunded, total_refunded, reason
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 
                      ROUND($8::numeric, 4),  -- Round quantity to 4 decimals
                      $9, $10, $11, $12, $13, $14)`,
            [
              refund.id,
              businessId,
              item.original_line_item_id,
              item.original_line_type,
              item.product_id || null,
              item.service_id || null,
              item.item_name,
              roundedQuantity,  // Use rounded quantity
              item.unit_price,
              item.subtotal_refunded,
              item.discount_refunded || 0,
              item.tax_refunded || 0,
              item.total_refunded,
              item.reason || null
            ]
          );
        }
      }

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'refund.created',
        resourceType: 'refund',
        resourceId: refund.id,
        newValues: {
          refund_number: refund.refund_number,
          total_refunded: refund.total_refunded,
          requires_approval: requiresApproval,
          status: refund.status
        }
      });

      await client.query('COMMIT');

      // Process refund immediately (no approval required)
      return await this.processRefund(refund.id, userId, businessId);

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error creating refund:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process refund (approve and execute all reversals)
   * @param {string} refundId - Refund ID
   * @param {string} userId - User ID
   * @param {string} businessId - Business ID
   * @returns {Promise<Object>} Processing result
   */
  static async processRefund(refundId, userId, businessId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get refund details
      const refundResult = await client.query(
        `SELECT r.*,
                pt.transaction_number as original_transaction_number,
                pt.final_amount as original_final_amount
         FROM refunds r
         LEFT JOIN pos_transactions pt ON r.original_transaction_id = pt.id
           AND r.original_transaction_type = 'POS'
         WHERE r.id = $1 AND r.business_id = $2`,
        [refundId, businessId]
      );

      if (refundResult.rows.length === 0) {
        throw new Error('Refund not found');
      }

      const refund = refundResult.rows[0];

      // ========== ADD WALLET BALANCE CHECK HERE ==========
      // Skip wallet check for CREDIT_NOTE refunds
      if (refund.refund_method !== 'CREDIT_NOTE') {
        const walletCheck = await client.query(
          `SELECT * FROM check_refund_wallet_sufficiency($1, $2, $3)`,
          [businessId, refund.refund_method, refund.total_refunded]
        );
        
        if (!walletCheck.rows[0].sufficient) {
          throw new Error(walletCheck.rows[0].message);
        }
        
        log.info('Wallet balance verified', {
          refundId,
          method: refund.refund_method,
          amount: refund.total_refunded,
          walletId: walletCheck.rows[0].wallet_id,
          currentBalance: walletCheck.rows[0].current_balance
        });
      }
      // ========== END WALLET BALANCE CHECK ==========

      // Check if already processed
      if (refund.status === 'COMPLETED') {
        return {
          success: true,
          message: 'Refund already completed',
          refund: this.formatRefund(refund)
        };
      }

      // ========================================================================
      // STEP 1: REVERSE INVENTORY (if product refund)
      // ========================================================================
      const refundItems = await client.query(
        `SELECT ri.*, pti.inventory_item_id as original_inventory_item_id
         FROM refund_items ri
         LEFT JOIN pos_transaction_items pti ON ri.original_line_item_id = pti.id
         WHERE ri.refund_id = $1 AND ri.business_id = $2`,
        [refundId, businessId]
      );

      const inventoryItems = refundItems.rows.filter(
        item => item.product_id || item.original_inventory_item_id
      );

      let inventoryReversalResult = null;
      if (inventoryItems.length > 0) {
        try {
          inventoryReversalResult = await this.reverseInventory(
            businessId,
            refundId,
            inventoryItems,
            userId
          );
          log.info('Inventory reversal completed', {
            refundId,
            itemsReversed: inventoryReversalResult.items_processed
          });
        } catch (inventoryError) {
          log.error('Inventory reversal failed:', inventoryError);
          // Continue with refund - inventory will be handled separately
        }
      }

      // ========================================================================
      // STEP 2: REVERSE DISCOUNTS (if discount was applied)
      // ========================================================================
      let discountReversalResult = null;
      if (refund.discount_refunded > 0) {
        try {
          discountReversalResult = await this.reverseDiscounts(
            client,
            businessId,
            refundId,
            refund.original_transaction_id,
            refund.original_transaction_type,
            refund.total_refunded,
            refund.discount_refunded,
            userId
          );
          log.info('Discount reversal completed', {
            refundId,
            discountReversed: refund.discount_refunded
          });
        } catch (discountError) {
          log.error('Discount reversal failed:', discountError);
          // Continue with refund
        }
      }

      // ========================================================================
      // STEP 3: REVERSE TAXES (if tax was applied)
      // ========================================================================
      let taxReversalResult = null;
      if (refund.tax_refunded > 0) {
        try {
          taxReversalResult = await this.reverseTaxes(
            client,
            businessId,
            refundId,
            refund.original_transaction_id,
            refund.original_transaction_type,
            refund.total_refunded,
            refund.tax_refunded,
            userId
          );
          log.info('Tax reversal completed', {
            refundId,
            taxReversed: refund.tax_refunded
          });
        } catch (taxError) {
          log.error('Tax reversal failed:', taxError);
          // Continue with refund
        }
      }

      // ========================================================================
      // STEP 4: CREATE JOURNAL ENTRY
      // ========================================================================
      const journalResult = await client.query(
        `SELECT * FROM create_refund_journal_entry($1, $2)`,
        [refundId, userId]
      );

      const journalEntry = journalResult.rows[0];

      if (!journalEntry.success) {
        throw new Error(`Journal entry creation failed: ${journalEntry.message}`);
      }

      // ========================================================================
      // STEP 5: UPDATE ORIGINAL TRANSACTION
      // ========================================================================
      const newRefundedAmount = parseFloat(refund.refunded_amount || 0) + parseFloat(refund.total_refunded);

      if (refund.original_transaction_type === 'POS') {
        const updateResult = await client.query(
          `UPDATE pos_transactions
           SET refunded_amount = COALESCE(refunded_amount, 0) + $1,
               refund_status = CASE
                 WHEN COALESCE(refunded_amount, 0) + $1 >= total_amount THEN 'FULL'
                 ELSE 'PARTIAL'
               END,
               updated_at = NOW()
           WHERE id = $2 AND business_id = $3
           RETURNING refund_status, refunded_amount`,
          [refund.total_refunded, refund.original_transaction_id, businessId]
        );

        log.info('POS transaction updated', {
          transactionId: refund.original_transaction_id,
          newRefundedAmount: newRefundedAmount,
          status: updateResult.rows[0]?.refund_status
        });
      } else if (refund.original_transaction_type === 'INVOICE') {
        await client.query(
          `UPDATE invoices
           SET refunded_amount = COALESCE(refunded_amount, 0) + $1,
               refund_status = CASE
                 WHEN COALESCE(refunded_amount, 0) + $1 >= total_amount THEN 'FULL'
                 ELSE 'PARTIAL'
               END,
               updated_at = NOW()
           WHERE id = $2 AND business_id = $3`,
          [refund.total_refunded, refund.original_transaction_id, businessId]
        );
      }

      // ========================================================================
      // STEP 6: UPDATE REFUND STATUS
      // ========================================================================
      await client.query(
        `UPDATE refunds
         SET status = 'COMPLETED',
             journal_entry_id = $1,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $2 AND business_id = $3`,
        [journalEntry.journal_entry_id, refundId, businessId]
      );

      // ========================================================================
      // STEP 7: AUDIT LOG
      // ========================================================================
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'refund.processed',
        resourceType: 'refund',
        resourceId: refundId,
        newValues: {
          refund_number: refund.refund_number,
          journal_entry_id: journalEntry.journal_entry_id,
          inventory_reversed: inventoryReversalResult?.items_processed || 0,
          discount_reversed: refund.discount_refunded,
          tax_reversed: refund.tax_refunded,
          status: 'COMPLETED'
        }
      });

      await client.query('COMMIT');

      return {
        success: true,
        refund: await this.getRefundById(refundId, businessId),
        journal_entry_id: journalEntry.journal_entry_id,
        inventory_reversal: inventoryReversalResult,
        discount_reversal: discountReversalResult,
        tax_reversal: taxReversalResult,
        message: 'Refund processed successfully'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error processing refund:', error);

      // Update refund with error
      try {
        const updateClient = await getClient();
        await updateClient.query(
          `UPDATE refunds
           SET status = 'REJECTED',
               notes = COALESCE(notes, '') || '\nError: ' || $1,
               updated_at = NOW()
           WHERE id = $2 AND business_id = $3`,
          [error.message, refundId, businessId]
        );
        updateClient.release();
      } catch (updateError) {
        log.error('Failed to update refund error status:', updateError);
      }

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reverse inventory for refunded items
   * @param {string} businessId - Business ID
   * @param {string} refundId - Refund ID
   * @param {Array} items - Refund items with inventory
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Reversal result
   */
  static async reverseInventory(businessId, refundId, items, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      let itemsProcessed = 0;
      const reversedItems = [];

      for (const item of items) {
        const inventoryItemId = item.product_id ?
          await this.getInventoryItemId(client, item.product_id, businessId) :
          item.original_inventory_item_id;

        if (!inventoryItemId) {
          log.warn('No inventory item found for product', {
            productId: item.product_id,
            refundId
          });
          continue;
        }

        // Get current stock and cost
        const inventoryResult = await client.query(
          `SELECT current_stock, cost_price, name
           FROM inventory_items
           WHERE id = $1 AND business_id = $2`,
          [inventoryItemId, businessId]
        );

        if (inventoryResult.rows.length === 0) {
          log.warn('Inventory item not found', { inventoryItemId });
          continue;
        }

        const inventory = inventoryResult.rows[0];
        const quantity = parseFloat(item.quantity_refunded);

        // Update inventory stock (increase)
        await client.query(
          `UPDATE inventory_items
           SET current_stock = current_stock + $1,
               updated_at = NOW()
           WHERE id = $2 AND business_id = $3`,
          [quantity, inventoryItemId, businessId]
        );

        // Create inventory transaction (reversal)
        const transactionResult = await client.query(
          `INSERT INTO inventory_transactions (
            business_id, inventory_item_id, product_id, transaction_type,
            quantity, unit_cost, reference_type, reference_id, notes, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id`,
          [
            businessId,
            inventoryItemId,
            item.product_id || null,
            'refund',
            quantity,  // Positive quantity (stock increase)
            inventory.cost_price,
            'refund',
            refundId,
            `Refund reversal for ${item.item_name} - ${quantity} units`,
            userId
          ]
        );

        itemsProcessed++;
        reversedItems.push({
          inventory_item_id: inventoryItemId,
          item_name: item.item_name,
          quantity: quantity,
          unit_cost: inventory.cost_price,
          total_cost_reversed: quantity * inventory.cost_price
        });
      }

      await client.query('COMMIT');

      return {
        success: true,
        items_processed: itemsProcessed,
        reversed_items: reversedItems,
        message: `Reversed inventory for ${itemsProcessed} items`
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error reversing inventory:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reverse discounts for refund
   * @param {Object} client - Database client
   * @param {string} businessId - Business ID
   * @param {string} refundId - Refund ID
   * @param {string} originalTransactionId - Original transaction ID
   * @param {string} transactionType - Transaction type (POS/INVOICE)
   * @param {number} refundAmount - Total refund amount
   * @param {number} discountRefunded - Discount portion refunded
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Reversal result
   */
  static async reverseDiscounts(client, businessId, refundId, originalTransactionId,
                                 transactionType, refundAmount, discountRefunded, userId) {
    try {
      // Find discount allocations on original transaction
      const allocationResult = await client.query(
        `SELECT * FROM discount_allocations
         WHERE ${transactionType === 'POS' ? 'pos_transaction_id' : 'invoice_id'} = $1
           AND business_id = $2
           AND status = 'APPLIED'
           AND is_refund_reversal = FALSE`,
        [originalTransactionId, businessId]
      );

      const allocations = allocationResult.rows;

      if (allocations.length === 0) {
        log.info('No discount allocations found to reverse', { originalTransactionId });
        return { success: true, message: 'No discounts to reverse' };
      }

      const reversedAllocations = [];

      for (const allocation of allocations) {
        // Calculate proportional discount reversal
        const reversalAmount = allocation.total_discount_amount * (discountRefunded / refundAmount);

        // Create reversal allocation
        const reversalResult = await client.query(
          `INSERT INTO discount_allocations (
            business_id, discount_rule_id, promotional_discount_id,
            invoice_id, pos_transaction_id, allocation_number,
            total_discount_amount, allocation_method, status,
            original_allocation_id, is_refund_reversal, refund_id,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id`,
          [
            businessId,
            allocation.discount_rule_id,
            allocation.promotional_discount_id,
            transactionType === 'POS' ? null : originalTransactionId,
            transactionType === 'POS' ? originalTransactionId : null,
            `REV-${allocation.allocation_number}`,
            -reversalAmount,  // Negative amount for reversal
            allocation.allocation_method,
            'VOID',
            allocation.id,
            true,
            refundId,
            userId
          ]
        );

        reversedAllocations.push({
          original_allocation_id: allocation.id,
          reversal_allocation_id: reversalResult.rows[0].id,
          amount_reversed: reversalAmount
        });

        // Mark original allocation as partially reversed
        if (Math.abs(reversalAmount - allocation.total_discount_amount) < 0.01) {
          // Full reversal
          await client.query(
            `UPDATE discount_allocations
             SET status = 'VOID',
                 voided_by = $1,
                 voided_at = NOW(),
                 void_reason = $2
             WHERE id = $3`,
            [userId, `Fully reversed by refund ${refundId}`, allocation.id]
          );
        } else {
          // Partial reversal - keep original but note reversal
          await client.query(
            `UPDATE discount_allocations
             SET notes = COALESCE(notes, '') || '\nPartial reversal: ' || $1 || ' from refund ' || $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [reversalAmount, refundId, allocation.id]
          );
        }
      }

      // Create journal entry for discount reversal
      if (discountRefunded > 0) {
        try {
          await DiscountAccountingService.createBulkDiscountJournalEntries(
            {
              business_id: businessId,
              id: refundId,
              type: 'REFUND'
            },
            [{
              rule_type: 'REFUND_REVERSAL',
              discount_amount: discountRefunded,
              allocation_id: reversedAllocations[0]?.reversal_allocation_id,
              name: `Discount reversal for refund ${refundId}`
            }],
            userId
          );
        } catch (accountingError) {
          log.warn('Discount reversal journal entry failed:', accountingError);
        }
      }

      return {
        success: true,
        allocations_reversed: reversedAllocations.length,
        total_amount_reversed: discountRefunded,
        reversed_allocations: reversedAllocations,
        message: `Reversed ${reversedAllocations.length} discount allocations`
      };

    } catch (error) {
      log.error('Error reversing discounts:', error);
      throw error;
    }
  }

  /**
   * Reverse taxes for refund
   * @param {Object} client - Database client
   * @param {string} businessId - Business ID
   * @param {string} refundId - Refund ID
   * @param {string} originalTransactionId - Original transaction ID
   * @param {string} transactionType - Transaction type
   * @param {number} refundAmount - Total refund amount
   * @param {number} taxRefunded - Tax portion refunded
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Reversal result
   */
  static async reverseTaxes(client, businessId, refundId, originalTransactionId,
                             transactionType, refundAmount, taxRefunded, userId) {
    try {
      // Create tax reversal tracking table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS refund_tax_allocations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          refund_id UUID NOT NULL REFERENCES refunds(id),
          tax_allocation_id UUID,
          amount_reversed NUMERIC(15,2) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          created_by UUID REFERENCES users(id)
        )
      `);

      // Create tax reversal record
      await client.query(
        `INSERT INTO refund_tax_allocations (
          refund_id, amount_reversed, created_by
        ) VALUES ($1, $2, $3)`,
        [refundId, taxRefunded, userId]
      );

      // Get original tax transactions to reverse
      const taxTransactions = await client.query(
        `SELECT tt.* FROM transaction_taxes tt
         WHERE tt.transaction_id = $1
           AND tt.transaction_type = $2
           AND tt.business_id = $3`,
        [originalTransactionId,
         transactionType === 'POS' ? 'pos_sale' : 'invoice_sale',
         businessId]
      );

      // Create reverse tax entries in transaction_taxes
      for (const taxTx of taxTransactions.rows) {
        const proportionalAmount = taxTx.tax_amount * (taxRefunded / refundAmount);

        await client.query(
          `INSERT INTO transaction_taxes (
            business_id, transaction_id, transaction_type, transaction_date,
            tax_type_id, tax_rate_id, taxable_amount, tax_rate, tax_amount,
            country_code, product_category_code, tax_period, calculation_context,
            customer_type, customer_id, is_reversal, original_transaction_tax_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            businessId,
            refundId,
            'refund',
            new Date(),
            taxTx.tax_type_id,
            taxTx.tax_rate_id,
            taxTx.taxable_amount * (refundAmount / taxTx.taxable_amount),
            taxTx.tax_rate,
            -proportionalAmount,  // Negative for reversal
            taxTx.country_code,
            taxTx.product_category_code,
            taxTx.tax_period,
            taxTx.calculation_context,
            taxTx.customer_type,
            taxTx.customer_id,
            true,
            taxTx.id
          ]
        );
      }

      return {
        success: true,
        tax_amount_reversed: taxRefunded,
        tax_transactions_reversed: taxTransactions.rows.length,
        message: `Reversed ${taxRefunded} in taxes`
      };

    } catch (error) {
      log.error('Error reversing taxes:', error);
      throw error;
    }
  }

  /**
   * Validate original transaction exists and is eligible for refund
   */
  static async validateTransaction(client, businessId, transactionId, transactionType) {
    let transaction;

    if (transactionType === 'POS') {
      const result = await client.query(
        `SELECT id, transaction_number, final_amount, refunded_amount, refund_status, status
         FROM pos_transactions
         WHERE id = $1 AND business_id = $2`,
        [transactionId, businessId]
      );
      transaction = result.rows[0];

      if (!transaction) {
        throw new Error('POS transaction not found');
      }

      if (transaction.status !== 'completed') {
        throw new Error(`Cannot refund ${transaction.status} transaction`);
      }

      if (transaction.refund_status === 'FULL') {
        throw new Error('Transaction is already fully refunded');
      }

    } else if (transactionType === 'INVOICE') {
      const result = await client.query(
        `SELECT id, invoice_number, total_amount, refunded_amount, refund_status, status
         FROM invoices
         WHERE id = $1 AND business_id = $2`,
        [transactionId, businessId]
      );
      transaction = result.rows[0];

      if (!transaction) {
        throw new Error('Invoice not found');
      }

      if (transaction.status !== 'paid') {
        throw new Error(`Cannot refund ${transaction.status} invoice`);
      }

      if (transaction.refund_status === 'FULL') {
        throw new Error('Invoice is already fully refunded');
      }

    } else {
      throw new Error(`Invalid transaction type: ${transactionType}`);
    }

    return transaction;
  }

  /**
   * Get inventory item ID from product
   */
  static async getInventoryItemId(client, productId, businessId) {
    const result = await client.query(
      `SELECT inventory_item_id FROM products
       WHERE id = $1 AND business_id = $2`,
      [productId, businessId]
    );

    return result.rows[0]?.inventory_item_id;
  }

  /**
   * Approve refund (if approval required)
   */
  static async approveRefund(refundId, userId, businessId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if refund is in PENDING state
      const refundCheck = await client.query(
        `SELECT status FROM refunds
         WHERE id = $1 AND business_id = $2`,
        [refundId, businessId]
      );

      if (refundCheck.rows.length === 0) {
        throw new Error('Refund not found');
      }

      if (refundCheck.rows[0].status !== 'PENDING') {
        throw new Error(`Cannot approve refund with status: ${refundCheck.rows[0].status}`);
      }

      // Update refund status to APPROVED
      await client.query(
        `UPDATE refunds
         SET status = 'APPROVED',
             approved_by = $1,
             approved_at = NOW(),
             updated_at = NOW()
         WHERE id = $2 AND business_id = $3`,
        [userId, refundId, businessId]
      );

      await client.query('COMMIT');

      // Process the refund
      return await this.processRefund(refundId, userId, businessId);

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error approving refund:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reject refund
   */
  static async rejectRefund(refundId, userId, businessId, reason) {
    const client = await getClient();

    try {
      const result = await client.query(
        `UPDATE refunds
         SET status = 'REJECTED',
             notes = COALESCE(notes, '') || '\nRejected: ' || $1,
             updated_at = NOW()
         WHERE id = $2 AND business_id = $3
         RETURNING *`,
        [reason, refundId, businessId]
      );

      if (result.rows.length === 0) {
        throw new Error('Refund not found');
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'refund.rejected',
        resourceType: 'refund',
        resourceId: refundId,
        newValues: {
          refund_number: result.rows[0].refund_number,
          reason: reason
        }
      });

      return {
        success: true,
        refund: this.formatRefund(result.rows[0]),
        message: 'Refund rejected'
      };

    } catch (error) {
      log.error('Error rejecting refund:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get refund by ID with all details
   */
  static async getRefundById(refundId, businessId) {
    const client = await getClient();

    try {
      const refundResult = await client.query(
        `SELECT r.*,
                je.reference_number as journal_reference,
                je.created_at as journal_created_at,
                pt.transaction_number as original_transaction_number,
                pt.final_amount as original_final_amount
         FROM refunds r
         LEFT JOIN journal_entries je ON r.journal_entry_id = je.id
         LEFT JOIN pos_transactions pt ON r.original_transaction_id = pt.id
           AND r.original_transaction_type = 'POS'
         WHERE r.id = $1 AND r.business_id = $2`,
        [refundId, businessId]
      );

      if (refundResult.rows.length === 0) {
        throw new Error('Refund not found');
      }

      const refund = refundResult.rows[0];

      // Get refund items
      const itemsResult = await client.query(
        `SELECT ri.*,
                pti.item_type as original_item_type,
                pti.product_id as original_product_id,
                pti.service_id as original_service_id
         FROM refund_items ri
         LEFT JOIN pos_transaction_items pti ON ri.original_line_item_id = pti.id
         WHERE ri.refund_id = $1 AND ri.business_id = $2
         ORDER BY ri.created_at`,
        [refundId, businessId]
      );

      refund.items = itemsResult.rows;

      // Get inventory reversal transactions
      const invResult = await client.query(
        `SELECT * FROM inventory_transactions
         WHERE reference_type = 'refund'
           AND reference_id = $1
           AND business_id = $2`,
        [refundId, businessId]
      );
      refund.inventory_transactions = invResult.rows;

      // Get discount reversals
      const discountResult = await client.query(
        `SELECT * FROM discount_allocations
         WHERE refund_id = $1 AND business_id = $2
           AND is_refund_reversal = TRUE`,
        [refundId, businessId]
      );
      refund.discount_reversals = discountResult.rows;

      // Get tax reversals
      const taxResult = await client.query(
        `SELECT * FROM refund_tax_allocations
         WHERE refund_id = $1`,
        [refundId]
      );
      refund.tax_reversals = taxResult.rows;

      return this.formatRefund(refund);

    } catch (error) {
      log.error('Error getting refund:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * List refunds with filters
   */
  static async listRefunds(businessId, filters = {}) {
    const client = await getClient();

    try {
      let query = `
        SELECT r.*,
               je.reference_number as journal_reference,
               pt.transaction_number as original_transaction_number
        FROM refunds r
        LEFT JOIN journal_entries je ON r.journal_entry_id = je.id
        LEFT JOIN pos_transactions pt ON r.original_transaction_id = pt.id
          AND r.original_transaction_type = 'POS'
        WHERE r.business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (filters.status) {
        paramCount++;
        query += ` AND r.status = $${paramCount}`;
        params.push(filters.status);
      }

      if (filters.refund_type) {
        paramCount++;
        query += ` AND r.refund_type = $${paramCount}`;
        params.push(filters.refund_type);
      }

      if (filters.original_transaction_type) {
        paramCount++;
        query += ` AND r.original_transaction_type = $${paramCount}`;
        params.push(filters.original_transaction_type);
      }

      if (filters.start_date) {
        paramCount++;
        query += ` AND r.created_at >= $${paramCount}`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        paramCount++;
        query += ` AND r.created_at <= $${paramCount}`;
        params.push(filters.end_date);
      }

      if (filters.search) {
        paramCount++;
        query += ` AND (r.refund_number ILIKE $${paramCount} OR r.refund_reason ILIKE $${paramCount})`;
        params.push(`%${filters.search}%`);
      }

      // Get total count
      const countQuery = query.replace(
        'SELECT r.*, je.reference_number as journal_reference, pt.transaction_number as original_transaction_number',
        'SELECT COUNT(*) as total'
      );
      const countResult = await client.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Add ordering and pagination
      query += ' ORDER BY r.created_at DESC';

      const limit = filters.limit || 50;
      const page = filters.page || 1;
      const offset = (page - 1) * limit;

      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(limit);

      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(offset);

      const result = await client.query(query, params);
      const refunds = result.rows;

      // Get item count for each refund (not all items for performance)
      for (const refund of refunds) {
        const count = await client.query(
          `SELECT COUNT(*) as item_count FROM refund_items
           WHERE refund_id = $1 AND business_id = $2`,
          [refund.id, businessId]
        );
        refund.item_count = parseInt(count.rows[0].item_count);
      }

      return {
        success: true,
        refunds: refunds.map(r => this.formatRefund(r, true)),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        message: 'Refunds retrieved successfully'
      };

    } catch (error) {
      log.error('Error listing refunds:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Format refund for response
   */
  static formatRefund(refund, summaryOnly = false) {
    const formatted = {
      id: refund.id,
      refund_number: refund.refund_number,
      original_transaction_id: refund.original_transaction_id,
      original_transaction_number: refund.original_transaction_number,
      original_transaction_type: refund.original_transaction_type,
      refund_type: refund.refund_type,
      refund_method: refund.refund_method,
      subtotal_refunded: parseFloat(refund.subtotal_refunded),
      discount_refunded: parseFloat(refund.discount_refunded),
      tax_refunded: parseFloat(refund.tax_refunded),
      total_refunded: parseFloat(refund.total_refunded),
      status: refund.status,
      journal_entry_id: refund.journal_entry_id,
      journal_reference: refund.journal_reference,
      journal_created_at: refund.journal_created_at,
      refund_reason: refund.refund_reason,
      notes: refund.notes,
      requires_approval: refund.requires_approval,
      created_at: refund.created_at,
      approved_at: refund.approved_at,
      completed_at: refund.completed_at,
      created_by: refund.created_by,
      approved_by: refund.approved_by
    };

    if (!summaryOnly) {
      formatted.items = refund.items ? refund.items.map(item => ({
        id: item.id,
        original_line_item_id: item.original_line_item_id,
        original_line_type: item.original_line_type,
        product_id: item.product_id,
        service_id: item.service_id,
        item_name: item.item_name,
        quantity_refunded: parseFloat(item.quantity_refunded),
        unit_price: parseFloat(item.unit_price),
        subtotal_refunded: parseFloat(item.subtotal_refunded),
        discount_refunded: parseFloat(item.discount_refunded),
        tax_refunded: parseFloat(item.tax_refunded),
        total_refunded: parseFloat(item.total_refunded),
        reason: item.reason
      })) : [];

      formatted.inventory_transactions = refund.inventory_transactions;
      formatted.discount_reversals = refund.discount_reversals;
      formatted.tax_reversals = refund.tax_reversals;
    } else {
      formatted.item_count = refund.item_count;
    }

    return formatted;
  }
}

export default RefundService;
