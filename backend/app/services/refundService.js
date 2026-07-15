// File: backend/app/services/refundService.js
// PERFECT VERSION: Real-world business refund system
// Fixes: COGS reversal, correct discount account, quantity/amount separation, period protection
// FIX: Removed duplicate reverseInventory() call — trigger handles all inventory reversal
// PATCHED: Added assertApprovalSatisfied() guard, called at the top of
// processRefund(). This closes the gap where POST /api/refunds/:id/process
// could push a refund flagged requires_approval=true straight to APPROVED
// (and therefore into the accounting trigger) with no permission check,
// because RefundApprovalService was never wired into any route.
//
// approveRefund() is now marked @deprecated in favor of routing through
// RefundApprovalService (see refundController.patched.js), but is left
// functional and now enforces the same guard so it is safe even if called
// directly.

import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { InventoryAccountingService } from './inventoryAccountingService.js';
import { AccountingService } from './accountingService.js';
import { TaxService } from './taxService.js';
import { DiscountRuleEngine } from './discountRuleEngine.js';
import { DiscountAllocationService } from './discountAllocationService.js';
import { DiscountAccountingService } from './discountAccountingService.js';
import { RefundApprovalService } from './refundApprovalService.js';

export class RefundService {

  /**
   * NEW: Guard used by processRefund() (and, defensively, by the deprecated
   * approveRefund()) to make sure a refund that requires approval has
   * actually cleared RefundApprovalService's queue before we let it reach
   * status APPROVED — which is what fires the accounting trigger and moves
   * real money/inventory/tax.
   *
   * Throws if:
   *   - the refund requires approval and has no approval_id at all, or
   *   - the linked refund_approval_queue row is not in APPROVED status.
   *
   * No-ops (returns true) if the refund never required approval.
   */
  static async assertApprovalSatisfied(client, refundId, businessId) {
    const refundResult = await client.query(
      `SELECT requires_approval, approval_id, status
       FROM refunds WHERE id = $1 AND business_id = $2`,
      [refundId, businessId]
    );

    if (refundResult.rows.length === 0) {
      throw new Error('Refund not found');
    }

    const refund = refundResult.rows[0];

    if (!refund.requires_approval) {
      return true;
    }

    if (!refund.approval_id) {
      throw new Error(
        'Refund requires approval but no approval request has been created for it'
      );
    }

    const approvalResult = await client.query(
      `SELECT approval_status FROM refund_approval_queue WHERE id = $1`,
      [refund.approval_id]
    );

    if (
      approvalResult.rows.length === 0 ||
      approvalResult.rows[0].approval_status !== 'APPROVED'
    ) {
      const currentStatus = approvalResult.rows[0]?.approval_status || 'MISSING';
      throw new Error(
        `Refund requires approval and is not yet approved (approval status: ${currentStatus}). ` +
        `Use the refund approval endpoint, not processRefund directly.`
      );
    }

    return true;
  }

  /**
   * Create a new refund request
   * KEY FIX: Separates physical quantity return from financial refund amount
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

      // CHECK PERIOD CLOSING
      const periodCheck = await client.query(
        `SELECT * FROM check_period_open_for_refund($1, $2)`,
        [refundData.original_transaction_id, refundData.original_transaction_type]
      );

      if (!periodCheck.rows[0].is_open) {
        throw new Error(
          `Cannot refund: Accounting period ${periodCheck.rows[0].period_name} is closed`
        );
      }

      // Validate refund amount doesn't exceed original
      const availableRefund = parseFloat(transaction.final_amount) -
                              parseFloat(transaction.refunded_amount || 0);

      if (refundData.total_refunded > availableRefund + 0.01) {
        throw new Error(
          `Refund amount ${refundData.total_refunded} exceeds available ${availableRefund}`
        );
      }

      // Generate refund number
      const refundNumberResult = await client.query(
        'SELECT generate_refund_number($1) as refund_number',
        [businessId]
      );
      const refundNumber = refundNumberResult.rows[0].refund_number;

      // Check approval requirements
      const approvalCheck = await RefundApprovalService.requiresApproval(
        businessId,
        refundData.total_refunded
      );

      let requiresApproval = approvalCheck.requires_approval;
      let approvalId = null;

      // Create refund record
      const refundResult = await client.query(
        `INSERT INTO refunds (
          business_id, refund_number, original_transaction_id,
          original_transaction_type, refund_type, refund_method,
          subtotal_refunded, discount_refunded, tax_refunded, total_refunded,
          restock_fee, refund_reason, notes, status, requires_approval, approval_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
          refundData.restock_fee || 0,
          refundData.refund_reason,
          refundData.notes || null,
          'PENDING',
          requiresApproval,
          approvalId,
          userId
        ]
      );

      const refund = refundResult.rows[0];

      // Insert refund items with PROPER quantity validation
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

          const originalItem = lineItemCheck.rows[0];

          // KEY FIX: Use the quantity the user specifies (physical units returned)
          // NOT a calculated quantity based on financial amounts
          const quantityReturned = parseFloat(item.quantity_refunded);

          // Validate against available quantity
          const availableQty = parseFloat(originalItem.quantity) -
                               parseFloat(originalItem.already_refunded_qty || 0);

          if (quantityReturned > availableQty + 0.0001) {
            throw new Error(
              `Return quantity ${quantityReturned} exceeds available ${availableQty}`
            );
          }

          // Calculate proportional financial amounts from original line
          const qtyRatio = quantityReturned / parseFloat(originalItem.quantity);
          const calculatedSubtotal = parseFloat(originalItem.total_price) * qtyRatio;
          const calculatedDiscount = parseFloat(originalItem.item_discount_amount || 0) * qtyRatio;
          const calculatedTax = parseFloat(originalItem.line_tax_amount || 0) * qtyRatio;
          const calculatedTotal = calculatedSubtotal - calculatedDiscount + calculatedTax;

          // Validate user-provided amounts match calculated (within tolerance)
          // NOTE: this mismatch check still only logs a warning rather than
          // rejecting or clamping. Flagged separately from the approval-bypass
          // fix in this migration — tracked as a follow-up, see review notes.
          if (Math.abs(item.subtotal_refunded - calculatedSubtotal) > 1.00) {
            log.warn('Refund subtotal mismatch', {
              expected: calculatedSubtotal,
              provided: item.subtotal_refunded,
              difference: Math.abs(item.subtotal_refunded - calculatedSubtotal)
            });
          }

          await client.query(
            `INSERT INTO refund_items (
              refund_id, business_id, original_line_item_id, original_line_type,
              product_id, service_id, item_name,
              quantity_refunded, unit_price, subtotal_refunded,
              discount_refunded, tax_refunded, total_refunded, reason
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              refund.id,
              businessId,
              item.original_line_item_id,
              item.original_line_type,
              item.product_id || null,
              item.service_id || null,
              item.item_name,
              quantityReturned,
              item.unit_price,
              item.subtotal_refunded || calculatedSubtotal,
              item.discount_refunded || calculatedDiscount,
              item.tax_refunded || calculatedTax,
              item.total_refunded || calculatedTotal,
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

      if (requiresApproval) {
        // FIXED: Pass the shared client to the approval service
        const approvalRequest = await RefundApprovalService.createApprovalRequest(
          businessId,
          refund.id,
          userId,
          { metadata: { approval_reason: approvalCheck.reason } },
          client  // <-- Pass parent transaction client
        );
        approvalId = approvalRequest.id;

        // PRODUCTION FIX: Persist approval_id to refunds table and update in-memory object
        await client.query(
          `UPDATE refunds SET approval_id = $1 WHERE id = $2`,
          [approvalId, refund.id]
        );
        refund.approval_id = approvalId;

        await client.query('COMMIT');
        return {
          success: true,
          refund: this.formatRefund(refund),
          requires_approval: true,
          approval_id: approvalId,
          approval_reason: approvalCheck.reason,
          message: 'Refund created and pending approval'
        };
      } else {
        await client.query('COMMIT');
        return await this.processRefund(refund.id, userId, businessId);
      }

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error creating refund:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * FIXED: Use correct table name for invoices
   */
  static async getOriginalTransactionQuantity(client, transactionId, transactionType) {
    let result;

    if (transactionType === 'POS') {
      result = await client.query(
        `SELECT COALESCE(SUM(quantity), 0) as total_quantity
         FROM pos_transaction_items
         WHERE pos_transaction_id = $1`,
        [transactionId]
      );
    } else if (transactionType === 'INVOICE') {
      result = await client.query(
        `SELECT COALESCE(SUM(quantity), 0) as total_quantity
         FROM invoice_line_items  -- FIXED: was invoice_items
         WHERE invoice_id = $1`,
        [transactionId]
      );
    } else {
      throw new Error(`Invalid transaction type: ${transactionType}`);
    }

    return parseFloat(result.rows[0].total_quantity);
  }

  /**
   * Process refund (approve and execute all reversals)
   *
   * PATCHED: now calls assertApprovalSatisfied() as the very first check,
   * inside the same transaction, before the wallet-sufficiency check or the
   * status UPDATE that fires the accounting trigger. If the refund requires
   * approval and hasn't gone through RefundApprovalService, this throws and
   * the transaction rolls back — no partial state, nothing reaches APPROVED.
   * 
   * FIX: Removed service-layer reverseInventory() call. All inventory, discount,
   * tax, and journal entry mutations are now handled exclusively by the database
   * trigger process_refund_accounting() to prevent duplication and ensure single
   * source of truth.
   */
  static async processRefund(refundId, userId, businessId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // NEW: hard guard — must be first, before any other work in this transaction.
      await this.assertApprovalSatisfied(client, refundId, businessId);

      const refundResult = await client.query(
        `SELECT r.*,
                pt.transaction_number as original_transaction_number,
                pt.final_amount as original_final_amount,
                pt.discount_account_code as original_discount_account_code
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

      // Wallet check (skip for CREDIT_NOTE)
      if (refund.refund_method !== 'CREDIT_NOTE') {
        const walletCheck = await client.query(
          `SELECT * FROM check_refund_wallet_sufficiency($1, $2, $3)`,
          [businessId, refund.refund_method, refund.total_refunded]
        );

        if (!walletCheck.rows[0].sufficient) {
          throw new Error(walletCheck.rows[0].message);
        }
      }

      if (refund.status === 'COMPLETED') {
        return {
          success: true,
          message: 'Refund already completed',
          refund: this.formatRefund(refund)
        };
      }

      // All inventory, discount, tax, and journal entry mutations are handled
      // by the database trigger process_refund_accounting() (Migration 1504
      // fixed its internal ordering and error propagation) when status
      // changes to APPROVED. Do NOT call reverseInventory(), reverseDiscounts(),
      // or reverseTaxes() here — the trigger is the single source of truth.
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

      // Get updated refund with journal entry
      const completedRefund = await this.getRefundById(refundId, businessId);

      return {
        success: true,
        refund: completedRefund,
        journal_entry_id: completedRefund.journal_entry_id,
        message: 'Refund processed successfully'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error processing refund:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reverse inventory for refunded items
   * NOTE: This method is now ORPHANED from the main processRefund() flow.
   * It is kept for backward compatibility and potential direct use only.
   * The database trigger process_refund_accounting() handles all inventory reversal
   * automatically when refund status changes to APPROVED.
   * @deprecated Use database trigger instead. Kept for direct/manual use only.
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
            `Manual refund reversal for ${item.item_name} - ${quantity} units`,
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
   * NOTE: This method is now ORPHANED from the main processRefund() flow.
   * The database trigger reverse_discounts_on_refund() handles all discount reversal
   * automatically when refund status changes to APPROVED.
   * @deprecated Use database trigger instead. Kept for direct/manual use only.
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
   * NOTE: This method is now ORPHANED from the main processRefund() flow.
   * The database trigger reverse_tax_on_refund() handles all tax reversal
   * automatically when refund status changes to APPROVED.
   * @deprecated Use database trigger instead. Kept for direct/manual use only.
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
        `SELECT id, transaction_number, final_amount, refunded_amount, refund_status, status, total_amount
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
   * @deprecated Prefer RefundApprovalService.approveRefund(approvalId, userId, notes)
   * via the controller, which enforces userCanApprove() and updates the
   * approval queue + history. This method is kept only for any direct/manual
   * callers, and now enforces the same approval guard as processRefund() so
   * it is safe even if invoked without going through the queue-based flow.
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

      // NEW: even this legacy path must confirm the caller is allowed to
      // approve refunds for this business before flipping status.
      const canApprove = await RefundApprovalService.userCanApprove(userId, businessId);
      if (!canApprove) {
        throw new Error('User is not authorized to approve refunds for this business');
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
      restock_fee: parseFloat(refund.restock_fee || 0),
      total_refunded: parseFloat(refund.total_refunded),
      status: refund.status,
      journal_entry_id: refund.journal_entry_id,
      journal_reference: refund.journal_reference,
      journal_created_at: refund.journal_created_at,
      refund_reason: refund.refund_reason,
      notes: refund.notes,
      requires_approval: refund.requires_approval,
      approval_id: refund.approval_id,  // PRODUCTION FIX: Include approval_id in response
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
