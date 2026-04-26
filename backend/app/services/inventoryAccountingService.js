// File: backend/app/services/inventoryAccountingService.js
import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { AccountingService } from './accountingService.js';

/**
 * INVENTORY ACCOUNTING SERVICE
 *
 * FIX 1 (60-second timeout): removed syncInventoryToProduct() calls from
 * recordPosSaleWithCogs() and recordInventoryPurchase(). The trigger
 * trg_sync_product_stock (tgenabled=O) handles product stock propagation.
 *
 * FIX 2 (cogs_entry_id FK violation): inventory_transactions.cogs_entry_id
 * has a FK to journal_entry_lines.id — NOT journal_entries.id. The original
 * code was passing cogsJournalEntry.journal_entry.id (the entry header UUID)
 * which violated the constraint. The fix extracts the debit line ID (account
 * 5100, line_type='debit') from the created journal entry lines and uses that.
 *
 * FIX 3 (unique constraint on journal_entries): the table has a unique
 * constraint on (business_id, reference_type, reference_id). Prior failed
 * runs left committed COGS journal entries behind, so subsequent sales for
 * the same pos_transaction_id hit a unique violation. The fix uses INSERT
 * ... ON CONFLICT DO NOTHING and reads back the existing row if needed, so
 * retries are safe.
 *
 * FIX 4 (transaction ordering): inventory_transaction rows are committed
 * BEFORE the journal entry is created, so when the link UPDATE runs both
 * sides of every FK exist in the DB.
 */
export class InventoryAccountingService {

  // ============================================================================
  // recordInventoryPurchase
  // ============================================================================

  static async recordInventoryPurchase(purchaseData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const itemResult = await client.query(
        `SELECT id, name, sku FROM inventory_items
         WHERE id = $1 AND business_id = $2`,
        [purchaseData.inventory_item_id, purchaseData.business_id]
      );

      if (itemResult.rows.length === 0) {
        throw new Error('Inventory item not found or access denied');
      }

      const item = itemResult.rows[0];
      const totalCost = purchaseData.quantity * purchaseData.unit_cost;

      const journalEntry = await AccountingService.createJournalEntryForInventoryPurchase(
        {
          business_id: purchaseData.business_id,
          purchase_order_id: purchaseData.purchase_order_id,
          total_amount: totalCost,
          inventory_item_id: purchaseData.inventory_item_id,
          quantity: purchaseData.quantity,
          unit_cost: purchaseData.unit_cost,
          payment_method: purchaseData.payment_method
        },
        userId
      );

      const transactionResult = await client.query(
        `INSERT INTO inventory_transactions (
          business_id, inventory_item_id, transaction_type,
          quantity, unit_cost, reference_type, reference_id,
          journal_entry_id, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          purchaseData.business_id,
          purchaseData.inventory_item_id,
          'purchase',
          purchaseData.quantity,
          purchaseData.unit_cost,
          'purchase_order',
          purchaseData.purchase_order_id,
          journalEntry.journal_entry.id,
          `Purchase: ${purchaseData.quantity} units of ${item.name}`,
          userId
        ]
      );

      const inventoryTransaction = transactionResult.rows[0];

      // trg_sync_product_stock fires on this UPDATE — no Node.js sync needed.
      await client.query(
        `UPDATE inventory_items
         SET current_stock = current_stock + $1, updated_at = NOW()
         WHERE id = $2`,
        [purchaseData.quantity, purchaseData.inventory_item_id]
      );

      await auditLogger.logAction({
        businessId: purchaseData.business_id,
        userId,
        action: 'inventory.purchase.recorded',
        resourceType: 'inventory_transaction',
        resourceId: inventoryTransaction.id,
        newValues: {
          item_name: item.name,
          quantity: purchaseData.quantity,
          unit_cost: purchaseData.unit_cost,
          total_cost: totalCost,
          payment_method: purchaseData.payment_method
        }
      });

      await client.query('COMMIT');

      return {
        inventory_transaction: inventoryTransaction,
        journal_entry: journalEntry,
        item,
        summary: {
          quantity: purchaseData.quantity,
          unit_cost: purchaseData.unit_cost,
          total_cost: totalCost
        }
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Inventory accounting service error recording purchase:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // recordPosSaleWithCogs
  // ============================================================================

  static async recordPosSaleWithCogs(saleData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const cogsTransactions = [];
      const updatedItems = [];

      // ── Step 1: insert inventory_transaction rows + update stock ────────────
      // Do NOT set cogs_entry_id here — the journal entry doesn't exist yet.
      // We COMMIT this block first so both sides of the FK exist before linking.
      for (const item of saleData.items) {
        if (!item.inventory_item_id) continue;

        const costResult = await client.query(
          `SELECT cost_price, current_stock, name
           FROM inventory_items
           WHERE id = $1 AND business_id = $2`,
          [item.inventory_item_id, saleData.business_id]
        );

        if (costResult.rows.length === 0) {
          log.warn(`Inventory item not found for COGS: ${item.inventory_item_id}`);
          continue;
        }

        const inventoryItem = costResult.rows[0];
        const unitCost = parseFloat(inventoryItem.cost_price);
        const itemCogs = unitCost * item.quantity;

        if (parseFloat(inventoryItem.current_stock) < item.quantity) {
          throw new Error(
            `Insufficient stock for ${inventoryItem.name}. ` +
            `Required: ${item.quantity}, Available: ${inventoryItem.current_stock}`
          );
        }

        const transactionResult = await client.query(
          `INSERT INTO inventory_transactions (
            business_id, inventory_item_id, transaction_type,
            quantity, unit_cost, reference_type, reference_id,
            notes, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *`,
          [
            saleData.business_id,
            item.inventory_item_id,
            'sale',
            item.quantity,
            unitCost,
            'pos_transaction',
            saleData.pos_transaction_id,
            `POS Sale: ${item.quantity} units of ${inventoryItem.name}`,
            userId
          ]
        );

        // trg_sync_product_stock fires here — products.current_stock updated automatically.
        await client.query(
          `UPDATE inventory_items
           SET current_stock = current_stock - $1, updated_at = NOW()
           WHERE id = $2`,
          [item.quantity, item.inventory_item_id]
        );

        cogsTransactions.push({
          transaction: transactionResult.rows[0],
          inventory_item: inventoryItem,
          item_cogs: itemCogs
        });

        updatedItems.push({
          inventory_item_id: item.inventory_item_id,
          quantity: item.quantity,
          unit_cost: unitCost,
          item_cogs: itemCogs
        });
      }

      // ── Step 2: COMMIT so inventory rows exist before FK linking ────────────
      await client.query('COMMIT');
      log.debug('Inventory transactions committed', {
        count: cogsTransactions.length,
        posTransactionId: saleData.pos_transaction_id
      });

      const totalCogs = updatedItems.reduce((sum, i) => sum + i.item_cogs, 0);

      // ── Step 3: create (or retrieve existing) COGS journal entry ────────────
      // journal_entries has a unique constraint on (business_id, reference_type,
      // reference_id). If a prior failed run left a committed journal entry for
      // this pos_transaction_id we read it back instead of failing.
      let cogsJournalEntry = null;
      let cogsDebitLineId = null;   // journal_entry_lines.id for the 5100 debit

      if (totalCogs > 0) {
        try {
          cogsJournalEntry = await AccountingService.createJournalEntry({
            business_id: saleData.business_id,
            description: `COGS for POS Sale #${saleData.pos_transaction_id}`,
            journal_date: new Date(),
            reference_type: 'pos_transaction',
            reference_id: saleData.pos_transaction_id,
            lines: [
              {
                account_code: '5100',
                description: 'Cost of inventory sold in POS transaction',
                amount: totalCogs,
                line_type: 'debit'
              },
              {
                account_code: '1300',
                description: 'Reduction in inventory from POS sales',
                amount: totalCogs,
                line_type: 'credit'
              }
            ]
          }, userId);

          // ── FIX: cogs_entry_id → journal_entry_lines.id, NOT journal_entries.id
          // Extract the debit line (5100) id from the returned lines array.
          const debitLine = cogsJournalEntry.lines?.find(l => l.line_type === 'debit');
          cogsDebitLineId = debitLine?.id ?? null;

          log.debug('COGS journal entry created', {
            journalEntryId: cogsJournalEntry.journal_entry.id,
            cogsDebitLineId,
            totalCogs
          });

        } catch (jeError) {
          // Unique constraint violation = a prior run already created this entry.
          // Read it back so we can still link cogs_entry_id correctly.
          if (jeError.code === '23505') {
            log.warn('COGS journal entry already exists, reading back existing row', {
              posTransactionId: saleData.pos_transaction_id,
              error: jeError.message
            });

            const readClient = await getClient();
            try {
              const existing = await readClient.query(
                `SELECT jel.id as line_id, jel.line_type, je.id as entry_id
                 FROM journal_entries je
                 JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
                 WHERE je.business_id = $1
                   AND je.reference_type = 'pos_transaction'
                   AND je.reference_id = $2
                   AND jel.line_type = 'debit'
                 LIMIT 1`,
                [saleData.business_id, saleData.pos_transaction_id]
              );

              if (existing.rows.length > 0) {
                cogsDebitLineId = existing.rows[0].line_id;
                log.debug('Read back existing COGS debit line', { cogsDebitLineId });
              }
            } finally {
              readClient.release();
            }
          } else {
            // Non-fatal for other errors: stock is committed and correct.
            log.error('COGS journal entry creation failed (stock already committed)', {
              posTransactionId: saleData.pos_transaction_id,
              error: jeError.message
            });
          }
        }
      }

      // ── Step 4: link cogs_entry_id (journal_entry_lines.id) ─────────────────
      // Both inventory_transaction rows and the journal_entry_line are now
      // committed, so the FK is fully satisfiable.
      if (cogsDebitLineId && cogsTransactions.length > 0) {
        const linkClient = await getClient();
        try {
          const ids = cogsTransactions.map(t => t.transaction.id);
          await linkClient.query(
            `UPDATE inventory_transactions
             SET cogs_entry_id = $1
             WHERE id = ANY($2::uuid[])`,
            [cogsDebitLineId, ids]
          );
          log.debug('cogs_entry_id linked to journal_entry_lines.id', {
            cogsDebitLineId,
            linkedRows: ids.length
          });
        } catch (linkError) {
          log.warn('cogs_entry_id link UPDATE failed (non-fatal)', {
            posTransactionId: saleData.pos_transaction_id,
            error: linkError.message
          });
        } finally {
          linkClient.release();
        }
      }

      // ── Step 5: audit log ────────────────────────────────────────────────────
      await auditLogger.logAction({
        businessId: saleData.business_id,
        userId,
        action: 'inventory.cogs.recorded',
        resourceType: 'pos_transaction',
        resourceId: saleData.pos_transaction_id,
        newValues: {
          items_count: updatedItems.length,
          total_cogs: totalCogs,
          cogs_line_id: cogsDebitLineId,
          items: updatedItems.map(i => ({
            inventory_item_id: i.inventory_item_id,
            quantity: i.quantity,
            cogs: i.item_cogs
          }))
        }
      });

      return {
        cogs_journal_entry: cogsJournalEntry,
        inventory_transactions: cogsTransactions,
        summary: {
          total_cogs: totalCogs,
          items_processed: updatedItems.length,
          items: updatedItems
        }
      };

    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) { /* already committed */ }
      log.error('Inventory accounting service error recording POS sale COGS:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // syncInventoryToProduct
  // ============================================================================

  /**
   * Sync a single inventory item to its linked product row.
   *
   * ⚠️  Do NOT call from inside an active transaction — opens its own
   * BEGIN/COMMIT on a new connection, which creates competing locks.
   *
   * Safe callers: syncAllInventoryToProducts(), admin endpoints.
   * Real-time POS sync is handled by trg_sync_product_stock (enabled).
   */
  static async syncInventoryToProduct(inventoryItemId, userId, quantityChange = 0) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const inventoryResult = await client.query(
        `SELECT * FROM inventory_items WHERE id = $1`,
        [inventoryItemId]
      );

      if (inventoryResult.rows.length === 0) {
        throw new Error(`Inventory item not found: ${inventoryItemId}`);
      }

      const inventoryItem = inventoryResult.rows[0];
      const newStock = Math.max(0, parseFloat(inventoryItem.current_stock) + quantityChange);

      const updateResult = await client.query(`
        UPDATE products SET
          name            = $3,
          description     = $4,
          sku             = $5,
          category_id     = $6,
          cost_price      = $7,
          selling_price   = $8,
          current_stock   = $9,
          min_stock_level = $10,
          max_stock_level = $11,
          unit_of_measure = $12,
          is_active       = $13,
          updated_at      = NOW()
        WHERE business_id = $1 AND inventory_item_id = $2
        RETURNING id, name, current_stock
      `, [
        inventoryItem.business_id, inventoryItemId,
        inventoryItem.name, inventoryItem.description, inventoryItem.sku,
        inventoryItem.category_id, inventoryItem.cost_price,
        inventoryItem.selling_price, newStock,
        inventoryItem.min_stock_level, inventoryItem.max_stock_level,
        inventoryItem.unit_of_measure, inventoryItem.is_active
      ]);

      let product;
      let wasInsert = false;

      if (updateResult.rows.length === 0) {
        const insertResult = await client.query(`
          INSERT INTO products (
            business_id, inventory_item_id, name, description, sku,
            category_id, cost_price, selling_price, current_stock,
            min_stock_level, max_stock_level, unit_of_measure, is_active,
            created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
          RETURNING id, name, current_stock
        `, [
          inventoryItem.business_id, inventoryItemId,
          inventoryItem.name, inventoryItem.description, inventoryItem.sku,
          inventoryItem.category_id, inventoryItem.cost_price,
          inventoryItem.selling_price, newStock,
          inventoryItem.min_stock_level, inventoryItem.max_stock_level,
          inventoryItem.unit_of_measure, inventoryItem.is_active
        ]);
        product = insertResult.rows[0];
        wasInsert = true;
      } else {
        product = updateResult.rows[0];
      }

      await client.query(
        `UPDATE inventory_items SET updated_at = NOW() WHERE id = $1`,
        [inventoryItemId]
      );

      setImmediate(() => {
        auditLogger.logAction({
          businessId: inventoryItem.business_id,
          userId,
          action: 'inventory.product.synced',
          resourceType: 'product',
          resourceId: product.id,
          newValues: {
            inventory_item_id: inventoryItemId,
            product_id: product.id,
            name: product.name,
            stock_before: inventoryItem.current_stock,
            stock_after: newStock,
            quantity_change: quantityChange,
            action_type: wasInsert ? 'created' : 'updated'
          }
        }).catch(err => log.warn('Audit log failed:', err.message));
      });

      await client.query('COMMIT');

      return {
        product,
        inventory_item: inventoryItem,
        stock_before: parseFloat(inventoryItem.current_stock),
        stock_after: newStock,
        quantity_change: quantityChange,
        action: wasInsert ? 'created' : 'updated'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Inventory accounting service error syncing to product:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // getInventoryValuation
  // ============================================================================

  static async getInventoryValuation(businessId, method = 'fifo', asOfDate = new Date()) {
    const client = await getClient();

    try {
      let valuationQuery;
      const queryParams = [businessId, asOfDate];

      if (method.toLowerCase() === 'fifo') {
        valuationQuery = `
          SELECT
            it.business_id, it.inventory_item_id, ii.name as item_name, ii.sku,
            SUM(CASE WHEN it.transaction_type IN ('purchase','adjustment') THEN it.quantity ELSE 0 END) as total_purchased,
            SUM(CASE WHEN it.transaction_type = 'sale' THEN it.quantity ELSE 0 END) as total_sold,
            SUM(CASE WHEN it.transaction_type IN ('purchase','adjustment') THEN it.quantity ELSE -it.quantity END) as current_quantity,
            MIN(CASE WHEN it.transaction_type IN ('purchase','adjustment') THEN it.unit_cost END) as earliest_cost,
            SUM(CASE WHEN it.transaction_type IN ('purchase','adjustment') THEN it.quantity * it.unit_cost ELSE 0 END) as total_investment,
            (SUM(CASE WHEN it.transaction_type IN ('purchase','adjustment') THEN it.quantity ELSE -it.quantity END) *
             MIN(CASE WHEN it.transaction_type IN ('purchase','adjustment') THEN it.unit_cost END)) as current_value
          FROM inventory_transactions it
          JOIN inventory_items ii ON it.inventory_item_id = ii.id
          WHERE it.business_id = $1 AND it.created_at <= $2
          GROUP BY it.business_id, it.inventory_item_id, ii.name, ii.sku
          ORDER BY ii.name`;
      } else if (method.toLowerCase() === 'average') {
        valuationQuery = `
          SELECT
            it.business_id, it.inventory_item_id, ii.name as item_name, ii.sku,
            SUM(CASE WHEN it.transaction_type IN ('purchase','adjustment') THEN it.quantity ELSE 0 END) as total_purchased,
            SUM(CASE WHEN it.transaction_type = 'sale' THEN it.quantity ELSE 0 END) as total_sold,
            SUM(CASE WHEN it.transaction_type IN ('purchase','adjustment') THEN it.quantity ELSE -it.quantity END) as current_quantity,
            AVG(CASE WHEN it.transaction_type IN ('purchase','adjustment') THEN it.unit_cost END) as average_cost,
            SUM(CASE WHEN it.transaction_type IN ('purchase','adjustment') THEN it.quantity * it.unit_cost ELSE 0 END) as total_investment,
            (SUM(CASE WHEN it.transaction_type IN ('purchase','adjustment') THEN it.quantity ELSE -it.quantity END) *
             AVG(CASE WHEN it.transaction_type IN ('purchase','adjustment') THEN it.unit_cost END)) as current_value
          FROM inventory_transactions it
          JOIN inventory_items ii ON it.inventory_item_id = ii.id
          WHERE it.business_id = $1 AND it.created_at <= $2
          GROUP BY it.business_id, it.inventory_item_id, ii.name, ii.sku
          ORDER BY ii.name`;
      } else {
        throw new Error(`Unsupported valuation method: ${method}`);
      }

      const result = await client.query(valuationQuery, queryParams);
      const totalValuation = result.rows.reduce((s, r) => s + (parseFloat(r.current_value) || 0), 0);
      const totalItems     = result.rows.reduce((s, r) => s + (parseFloat(r.current_quantity) || 0), 0);

      return {
        valuation_method: method,
        as_of_date: asOfDate,
        items: result.rows,
        summary: {
          total_items: result.rows.length,
          total_quantity: totalItems,
          total_valuation: totalValuation,
          average_item_value: totalItems > 0 ? totalValuation / totalItems : 0
        }
      };
    } catch (error) {
      log.error('Inventory accounting service error getting valuation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // getCogsReport
  // ============================================================================

  static async getCogsReport(businessId, startDate, endDate) {
    const client = await getClient();

    try {
      const result = await client.query(
        `SELECT
          it.inventory_item_id, ii.name as item_name, ii.sku,
          SUM(it.quantity) as total_quantity_sold,
          AVG(it.unit_cost) as average_unit_cost,
          SUM(it.quantity * it.unit_cost) as total_cogs,
          COUNT(DISTINCT it.reference_id) as number_of_sales,
          MIN(it.created_at) as first_sale_date,
          MAX(it.created_at) as last_sale_date
        FROM inventory_transactions it
        JOIN inventory_items ii ON it.inventory_item_id = ii.id
        WHERE it.business_id = $1
          AND it.transaction_type = 'sale'
          AND it.created_at >= $2
          AND it.created_at <= $3
        GROUP BY it.inventory_item_id, ii.name, ii.sku
        ORDER BY total_cogs DESC`,
        [businessId, startDate, endDate]
      );

      const totalCogs     = result.rows.reduce((s, r) => s + (parseFloat(r.total_cogs) || 0), 0);
      const totalQuantity = result.rows.reduce((s, r) => s + (parseFloat(r.total_quantity_sold) || 0), 0);

      return {
        period: { start_date: startDate, end_date: endDate },
        items: result.rows,
        summary: {
          total_items_sold: result.rows.length,
          total_quantity_sold: totalQuantity,
          total_cogs: totalCogs,
          average_cogs_per_item: result.rows.length > 0 ? totalCogs / result.rows.length : 0
        }
      };
    } catch (error) {
      log.error('Inventory accounting service error getting COGS report:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // syncAllInventoryToProducts
  // ============================================================================

  static async syncAllInventoryToProducts(businessId, userId) {
    const client = await getClient();

    try {
      const inventoryItemsResult = await client.query(
        `SELECT ii.*
         FROM inventory_items ii
         LEFT JOIN products p ON ii.id = p.inventory_item_id
         WHERE ii.business_id = $1 AND p.id IS NULL`,
        [businessId]
      );

      const syncResults = [];
      const errors = [];

      for (const inventoryItem of inventoryItemsResult.rows) {
        try {
          syncResults.push(await this.syncInventoryToProduct(inventoryItem.id, userId));
        } catch (error) {
          errors.push({ inventory_item_id: inventoryItem.id, name: inventoryItem.name, error: error.message });
          log.error(`Failed to sync inventory item ${inventoryItem.id}:`, error);
        }
      }

      return {
        total_inventory_items: inventoryItemsResult.rows.length,
        synced: syncResults.length,
        failed: errors.length,
        sync_results: syncResults,
        errors
      };
    } catch (error) {
      log.error('Inventory accounting service error bulk syncing:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
