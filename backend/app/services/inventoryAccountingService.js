// File: backend/app/services/inventoryAccountingService.js
import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { AccountingService } from './accountingService.js';

/**
 * INVENTORY ACCOUNTING SERVICE
 * FIXED: Use created_at instead of transaction_date
 */
export class InventoryAccountingService {
  /**
   * Record inventory purchase with accounting entries
   */
  static async recordInventoryPurchase(purchaseData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Get inventory item details
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

      // 2. Create accounting journal entry
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

      // 3. Record inventory transaction
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

      // 4. Sync to products if linked (DO THIS FIRST to avoid deadlock)
      await this.syncInventoryToProduct(
        purchaseData.inventory_item_id, 
        userId, 
        purchaseData.quantity  // Pass the quantity change
      );

      // 5. Update inventory item stock (trigger will fire but product already updated)
      await client.query(
        `UPDATE inventory_items
         SET current_stock = current_stock + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [purchaseData.quantity, purchaseData.inventory_item_id]
      );

      // 6. Audit log
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
        item: item,
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

  /**
   * Record POS sale with COGS accounting
   */
  static async recordPosSaleWithCogs(saleData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const cogsTransactions = [];
      const updatedItems = [];

      // 1. Process each sale item for COGS
      for (const item of saleData.items) {
        if (item.inventory_item_id) {
          // Get current cost from inventory
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

          // Check if enough stock
          if (parseFloat(inventoryItem.current_stock) < item.quantity) {
            throw new Error(
              `Insufficient stock for ${inventoryItem.name}. ` +
              `Required: ${item.quantity}, Available: ${inventoryItem.current_stock}`
            );
          }

          // Record inventory transaction for COGS
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

          // Sync product stock with negative quantity change
          await this.syncInventoryToProduct(
            item.inventory_item_id,
            userId,
            -item.quantity  // Negative quantity for sale
          );

          // Update inventory stock
          await client.query(
            `UPDATE inventory_items
             SET current_stock = current_stock - $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [item.quantity, item.inventory_item_id]
          );

          // Update product stock if linked
          if (item.product_id) {
            await client.query(
              `UPDATE products
               SET current_stock = current_stock - $1,
                   updated_at = NOW()
               WHERE id = $2 AND business_id = $3`,
              [item.quantity, item.product_id, saleData.business_id]
            );
          }

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
      }

      // 2. Create COGS journal entry if there were inventory items
      let cogsJournalEntry = null;
      const totalCogs = updatedItems.reduce((sum, item) => sum + item.item_cogs, 0);

      if (totalCogs > 0) {
        cogsJournalEntry = await AccountingService.createJournalEntry({
          business_id: saleData.business_id,
          description: `COGS for POS Sale #${saleData.pos_transaction_id}`,
          journal_date: new Date(),
          reference_type: 'pos_transaction',
          reference_id: saleData.pos_transaction_id,
          lines: [
            {
              account_code: '5100', // Cost of Goods Sold
              description: 'Cost of inventory sold in POS transaction',
              amount: totalCogs,
              line_type: 'debit'
            },
            {
              account_code: '1300', // Inventory
              description: 'Reduction in inventory from POS sales',
              amount: totalCogs,
              line_type: 'credit'
            }
          ]
        }, userId);

        // Link COGS journal entry to inventory transactions
        for (const transaction of cogsTransactions) {
          await client.query(
            `UPDATE inventory_transactions
             SET cogs_entry_id = $1
             WHERE id = $2`,
            [cogsJournalEntry.journal_entry.id, transaction.transaction.id]
          );
        }
      }

      // 3. Audit log
      await auditLogger.logAction({
        businessId: saleData.business_id,
        userId,
        action: 'inventory.cogs.recorded',
        resourceType: 'pos_transaction',
        resourceId: saleData.pos_transaction_id,
        newValues: {
          items_count: updatedItems.length,
          total_cogs: totalCogs,
          items: updatedItems.map(item => ({
            inventory_item_id: item.inventory_item_id,
            quantity: item.quantity,
            cogs: item.item_cogs
          }))
        }
      });

      await client.query('COMMIT');

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
      await client.query('ROLLBACK');
      log.error('Inventory accounting service error recording POS sale COGS:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Sync inventory item to product
   */
  static async syncInventoryToProduct(inventoryItemId, userId, quantityChange = 0) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get inventory item details
      const inventoryResult = await client.query(
        `SELECT * FROM inventory_items WHERE id = $1`,
        [inventoryItemId]
      );

      if (inventoryResult.rows.length === 0) {
        throw new Error(`Inventory item not found: ${inventoryItemId}`);
      }

      const inventoryItem = inventoryResult.rows[0];

      // Calculate the NEW stock value
      let newStock = parseFloat(inventoryItem.current_stock);
      if (quantityChange !== 0) {
        newStock = newStock + quantityChange;
        // Ensure stock doesn't go negative
        if (newStock < 0) {
          newStock = 0;
        }
      }

      // Check if product already exists for this inventory item
      const productResult = await client.query(
        `SELECT * FROM products
         WHERE business_id = $1 AND inventory_item_id = $2`,
        [inventoryItem.business_id, inventoryItemId]
      );

      let product;
      if (productResult.rows.length > 0) {
        // Update existing product
        const updateResult = await client.query(
          `UPDATE products
           SET
             name = $1,
             description = COALESCE($2, description),
             sku = $3,
             cost_price = $4,
             selling_price = $5,
             current_stock = $6,
             min_stock_level = $7,
             max_stock_level = $8,
             unit_of_measure = $9,
             is_active = $10,
             updated_at = NOW()
           WHERE id = $11
           RETURNING *`,
          [
            inventoryItem.name,
            inventoryItem.description,
            inventoryItem.sku,
            inventoryItem.cost_price,
            inventoryItem.selling_price,
            newStock,  // Use calculated newStock
            inventoryItem.min_stock_level,
            inventoryItem.max_stock_level,
            inventoryItem.unit_of_measure,
            inventoryItem.is_active,
            productResult.rows[0].id
          ]
        );

        product = updateResult.rows[0];
        log.info(`Updated existing product from inventory: ${product.id}`);

      } else {
        // Create new product from inventory item
        const insertResult = await client.query(
          `INSERT INTO products (
            business_id, inventory_item_id, name, description, sku,
            category_id, cost_price, selling_price, current_stock,
            min_stock_level, max_stock_level, unit_of_measure, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *`,
          [
            inventoryItem.business_id,
            inventoryItemId,
            inventoryItem.name,
            inventoryItem.description,
            inventoryItem.sku,
            inventoryItem.category_id,
            inventoryItem.cost_price,
            inventoryItem.selling_price,
            newStock,  // Use calculated newStock
            inventoryItem.min_stock_level,
            inventoryItem.max_stock_level,
            inventoryItem.unit_of_measure,
            inventoryItem.is_active
          ]
        );

        product = insertResult.rows[0];
        log.info(`Created new product from inventory: ${product.id}`);
      }

      // Update inventory item with product reference
      await client.query(
        `UPDATE inventory_items
         SET updated_at = NOW()
         WHERE id = $1`,
        [inventoryItemId]
      );

      // Audit log
      await auditLogger.logAction({
        businessId: inventoryItem.business_id,
        userId,
        action: 'inventory.product.synced',
        resourceType: 'product',
        resourceId: product.id,
        newValues: {
          inventory_item_id: inventoryItemId,
          product_id: product.id,
          name: product.name,
          sku: product.sku,
          stock_before: inventoryItem.current_stock,
          stock_after: newStock,
          quantity_change: quantityChange
        }
      });

      await client.query('COMMIT');

      return {
        product: product,
        inventory_item: inventoryItem,
        stock_before: parseFloat(inventoryItem.current_stock),
        stock_after: newStock,
        quantity_change: quantityChange,
        action: productResult.rows.length > 0 ? 'updated' : 'created'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Inventory accounting service error syncing to product:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get inventory valuation (GAAP-compliant)
   * FIXED: Use created_at instead of transaction_date
   */
  static async getInventoryValuation(businessId, method = 'fifo', asOfDate = new Date()) {
    const client = await getClient();

    try {
      let valuationQuery;
      let queryParams;

      switch (method.toLowerCase()) {
        case 'fifo':
          // FIXED: Use created_at instead of transaction_date
          valuationQuery = `
            SELECT
              it.business_id,
              it.inventory_item_id,
              ii.name as item_name,
              ii.sku,
              SUM(CASE WHEN it.transaction_type IN ('purchase', 'adjustment') THEN it.quantity ELSE 0 END) as total_purchased,
              SUM(CASE WHEN it.transaction_type = 'sale' THEN it.quantity ELSE 0 END) as total_sold,
              SUM(CASE WHEN it.transaction_type IN ('purchase', 'adjustment') THEN it.quantity ELSE -it.quantity END) as current_quantity,
              MIN(CASE WHEN it.transaction_type IN ('purchase', 'adjustment') THEN it.unit_cost END) as earliest_cost,
              SUM(CASE WHEN it.transaction_type IN ('purchase', 'adjustment') THEN it.quantity * it.unit_cost ELSE 0 END) as total_investment,
              (SUM(CASE WHEN it.transaction_type IN ('purchase', 'adjustment') THEN it.quantity ELSE -it.quantity END) *
               MIN(CASE WHEN it.transaction_type IN ('purchase', 'adjustment') THEN it.unit_cost END)) as current_value
            FROM inventory_transactions it
            JOIN inventory_items ii ON it.inventory_item_id = ii.id
            WHERE it.business_id = $1
              AND it.created_at <= $2
            GROUP BY it.business_id, it.inventory_item_id, ii.name, ii.sku
            ORDER BY ii.name
          `;
          queryParams = [businessId, asOfDate];
          break;

        case 'average':
          // FIXED: Use created_at instead of transaction_date
          valuationQuery = `
            SELECT
              it.business_id,
              it.inventory_item_id,
              ii.name as item_name,
              ii.sku,
              SUM(CASE WHEN it.transaction_type IN ('purchase', 'adjustment') THEN it.quantity ELSE 0 END) as total_purchased,
              SUM(CASE WHEN it.transaction_type = 'sale' THEN it.quantity ELSE 0 END) as total_sold,
              SUM(CASE WHEN it.transaction_type IN ('purchase', 'adjustment') THEN it.quantity ELSE -it.quantity END) as current_quantity,
              AVG(CASE WHEN it.transaction_type IN ('purchase', 'adjustment') THEN it.unit_cost END) as average_cost,
              SUM(CASE WHEN it.transaction_type IN ('purchase', 'adjustment') THEN it.quantity * it.unit_cost ELSE 0 END) as total_investment,
              (SUM(CASE WHEN it.transaction_type IN ('purchase', 'adjustment') THEN it.quantity ELSE -it.quantity END) *
               AVG(CASE WHEN it.transaction_type IN ('purchase', 'adjustment') THEN it.unit_cost END)) as current_value
            FROM inventory_transactions it
            JOIN inventory_items ii ON it.inventory_item_id = ii.id
            WHERE it.business_id = $1
              AND it.created_at <= $2
            GROUP BY it.business_id, it.inventory_item_id, ii.name, ii.sku
            ORDER BY ii.name
          `;
          queryParams = [businessId, asOfDate];
          break;

        default:
          throw new Error(`Unsupported valuation method: ${method}`);
      }

      const result = await client.query(valuationQuery, queryParams);

      const totalValuation = result.rows.reduce((sum, row) => {
        return sum + (parseFloat(row.current_value) || 0);
      }, 0);

      const totalItems = result.rows.reduce((sum, row) => {
        return sum + (parseFloat(row.current_quantity) || 0);
      }, 0);

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

  /**
   * Get COGS report for a period
   * FIXED: Use created_at instead of transaction_date
   */
  static async getCogsReport(businessId, startDate, endDate) {
    const client = await getClient();

    try {
      const result = await client.query(
        `SELECT
          it.inventory_item_id,
          ii.name as item_name,
          ii.sku,
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

      const totalCogs = result.rows.reduce((sum, row) => {
        return sum + (parseFloat(row.total_cogs) || 0);
      }, 0);

      const totalQuantity = result.rows.reduce((sum, row) => {
        return sum + (parseFloat(row.total_quantity_sold) || 0);
      }, 0);

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

  /**
   * Sync all inventory items to products
   */
  static async syncAllInventoryToProducts(businessId, userId) {
    const client = await getClient();

    try {
      // Get all inventory items without linked products
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
          const result = await this.syncInventoryToProduct(inventoryItem.id, userId);
          syncResults.push(result);
        } catch (error) {
          errors.push({
            inventory_item_id: inventoryItem.id,
            name: inventoryItem.name,
            error: error.message
          });
          log.error(`Failed to sync inventory item ${inventoryItem.id}:`, error);
        }
      }

      return {
        total_inventory_items: inventoryItemsResult.rows.length,
        synced: syncResults.length,
        failed: errors.length,
        sync_results: syncResults,
        errors: errors
      };

    } catch (error) {
      log.error('Inventory accounting service error bulk syncing:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
