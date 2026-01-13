import { query, getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { InventoryAccountingService } from './inventoryAccountingService.js';
import { InventorySyncService } from './inventorySyncService.js';

export class InventoryService {
  /**
   * Get inventory overview with accounting metrics
   */
  static async getOverview(businessId) {
    const client = await getClient();

    try {
      log.info('Getting inventory overview with accounting metrics', { businessId });

      const totalItemsResult = await client.query(
        'SELECT COUNT(*) as count FROM inventory_items WHERE business_id = $1 AND is_active = true',
        [businessId]
      );

      const lowStockResult = await client.query(
        `SELECT COUNT(*) as count FROM inventory_items
         WHERE business_id = $1 AND is_active = true
         AND current_stock <= min_stock_level AND min_stock_level > 0`,
        [businessId]
      );

      const outOfStockResult = await client.query(
        'SELECT COUNT(*) as count FROM inventory_items WHERE business_id = $1 AND is_active = true AND current_stock <= 0',
        [businessId]
      );

      // Get FIFO valuation
      const valuationResult = await client.query(
        `SELECT
           SUM(current_value) as fifo_value,
           SUM(current_quantity) as total_quantity,
           COUNT(*) as valued_items
         FROM inventory_valuation_fifo
         WHERE business_id = $1`,
        [businessId]
      );

      const recentMovementsResult = await client.query(
        `SELECT
          im.*,
          ii.name as item_name,
          ii.sku as item_sku
         FROM inventory_movements im
         LEFT JOIN inventory_items ii ON im.inventory_item_id = ii.id
         WHERE im.business_id = $1
         ORDER BY im.created_at DESC
         LIMIT 10`,
        [businessId]
      );

      const categoriesResult = await client.query(
        `SELECT
          ic.name as category_name,
          COUNT(ii.id) as item_count,
          SUM(ii.current_stock * ii.cost_price) as total_value
         FROM inventory_categories ic
         LEFT JOIN inventory_items ii ON ic.id = ii.category_id AND ii.is_active = true
         WHERE ic.business_id = $1 AND ic.is_active = true
         GROUP BY ic.id, ic.name
         ORDER BY ic.name`,
        [businessId]
      );

      // Get accounting summary
      const accountingSummaryResult = await client.query(
        `SELECT
           COUNT(*) as total_transactions,
           SUM(CASE WHEN transaction_type = 'purchase' THEN total_cost ELSE 0 END) as total_purchases,
           SUM(CASE WHEN transaction_type = 'sale' THEN total_cost ELSE 0 END) as total_cogs,
           COUNT(DISTINCT inventory_item_id) as items_with_transactions
         FROM inventory_transactions
         WHERE business_id = $1`,
        [businessId]
      );

      return {
        summary: {
          total_items: parseInt(totalItemsResult.rows[0].count) || 0,
          low_stock_items: parseInt(lowStockResult.rows[0].count) || 0,
          out_of_stock_items: parseInt(outOfStockResult.rows[0].count) || 0,
          total_inventory_value: parseFloat(valuationResult.rows[0].fifo_value) || 0,
          total_quantity: parseFloat(valuationResult.rows[0].total_quantity) || 0,
          valued_items: parseInt(valuationResult.rows[0].valued_items) || 0
        },
        categories: categoriesResult.rows,
        recent_movements: recentMovementsResult.rows,
        accounting_summary: accountingSummaryResult.rows[0] || {},
        alerts: {
          has_low_stock: parseInt(lowStockResult.rows[0].count) > 0,
          has_out_of_stock: parseInt(outOfStockResult.rows[0].count) > 0,
          valuation_available: parseInt(valuationResult.rows[0].valued_items) > 0
        }
      };

    } catch (error) {
      log.error('Inventory overview service error', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create inventory category
   */
  static async createCategory(businessId, categoryData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO inventory_categories (business_id, name, description, category_type, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          businessId,
          categoryData.name,
          categoryData.description || '',
          categoryData.category_type,
          categoryData.is_active
        ]
      );

      const category = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'inventory.category.created',
        resourceType: 'inventory_category',
        resourceId: category.id,
        newValues: { name: category.name, category_type: category.category_type }
      });

      await client.query('COMMIT');
      return category;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update inventory category
   */
  static async updateCategory(businessId, categoryId, categoryData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const categoryCheck = await client.query(
        'SELECT * FROM inventory_categories WHERE id = $1 AND business_id = $2',
        [categoryId, businessId]
      );

      if (categoryCheck.rows.length === 0) {
        throw new Error('Category not found or access denied');
      }

      const result = await client.query(
        `UPDATE inventory_categories
         SET name = $1, description = $2, category_type = $3, is_active = $4, updated_at = NOW()
         WHERE id = $5 AND business_id = $6
         RETURNING *`,
        [
          categoryData.name,
          categoryData.description,
          categoryData.category_type,
          categoryData.is_active,
          categoryId,
          businessId
        ]
      );

      const updatedCategory = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'inventory.category.updated',
        resourceType: 'inventory_category',
        resourceId: categoryId,
        newValues: categoryData
      });

      await client.query('COMMIT');
      return updatedCategory;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete inventory category
   */
  static async deleteCategory(businessId, categoryId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const categoryCheck = await client.query(
        'SELECT * FROM inventory_categories WHERE id = $1 AND business_id = $2',
        [categoryId, businessId]
      );

      if (categoryCheck.rows.length === 0) {
        throw new Error('Category not found or access denied');
      }

      const itemsCheck = await client.query(
        'SELECT COUNT(*) as item_count FROM inventory_items WHERE category_id = $1 AND business_id = $2',
        [categoryId, businessId]
      );

      const itemCount = parseInt(itemsCheck.rows[0].item_count);
      if (itemCount > 0) {
        throw new Error(`Cannot delete category with ${itemCount} associated items`);
      }

      await client.query(
        'DELETE FROM inventory_categories WHERE id = $1 AND business_id = $2',
        [categoryId, businessId]
      );

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'inventory.category.deleted',
        resourceType: 'inventory_category',
        resourceId: categoryId
      });

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create inventory item with accounting integration
   */
  static async createItem(businessId, itemData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify category belongs to business
      const categoryCheck = await client.query(
        'SELECT id FROM inventory_categories WHERE id = $1 AND business_id = $2',
        [itemData.category_id, businessId]
      );

      if (categoryCheck.rows.length === 0) {
        throw new Error('Category not found or access denied');
      }

      // Check for duplicate SKU
      const skuCheck = await client.query(
        'SELECT id FROM inventory_items WHERE business_id = $1 AND sku = $2',
        [businessId, itemData.sku]
      );

      if (skuCheck.rows.length > 0) {
        throw new Error('SKU already exists');
      }

      // Insert inventory item
      const result = await client.query(
        `INSERT INTO inventory_items (
          business_id, category_id, name, description, sku,
          cost_price, selling_price, current_stock, min_stock_level,
          max_stock_level, unit_of_measure, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          businessId,
          itemData.category_id,
          itemData.name,
          itemData.description || '',
          itemData.sku,
          itemData.cost_price,
          itemData.selling_price,
          itemData.current_stock || 0,
          itemData.min_stock_level || 0,
          itemData.max_stock_level || 0,
          itemData.unit_of_measure,
          itemData.is_active
        ]
      );

      const item = result.rows[0];

      // ========================================================================
      // NEW: AUTO-CREATE PRODUCT FOR POS IF FLAG IS SET
      // ========================================================================
      if (itemData.auto_create_product) {
        try {
          const syncResult = await InventorySyncService.makeInventoryItemSellable(item.id, userId);
          log.info(`Auto-created product from inventory item: ${item.id} → ${syncResult.product.id}`);
        } catch (syncError) {
          log.warn(`Failed to auto-create product from inventory item:`, syncError);
          // Don't fail the whole operation
        }
      }

      // ========================================================================
      // NEW: CREATE INITIAL INVENTORY TRANSACTION IF STARTING STOCK > 0
      // ========================================================================
      if (itemData.current_stock > 0) {
        try {
          await client.query(
            `INSERT INTO inventory_transactions (
              business_id, inventory_item_id, transaction_type,
              quantity, unit_cost, reference_type, notes, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              businessId,
              item.id,
              'adjustment',
              itemData.current_stock,
              itemData.cost_price,
              'inventory_setup',
              `Initial stock setup for ${item.name}`,
              userId
            ]
          );
        } catch (txError) {
          log.warn(`Failed to create initial inventory transaction:`, txError);
          // Don't fail the whole operation
        }
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'inventory.item.created',
        resourceType: 'inventory_item',
        resourceId: item.id,
        newValues: {
          name: item.name,
          sku: item.sku,
          cost_price: item.cost_price,
          selling_price: item.selling_price,
          auto_product_created: itemData.auto_create_product || false,
          initial_transaction_created: itemData.current_stock > 0
        }
      });

      await client.query('COMMIT');
      return item;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get inventory item by ID with accounting info
   */
  static async getItemById(businessId, itemId) {
    const client = await getClient();

    try {
      const result = await client.query(
        `SELECT
          ii.*,
          ic.name as category_name,
          p.id as product_id,
          p.name as product_name,
          CASE
            WHEN ii.current_stock <= ii.min_stock_level AND ii.min_stock_level > 0 THEN 'low'
            WHEN ii.current_stock = 0 THEN 'out_of_stock'
            ELSE 'adequate'
          END as stock_status,
          -- Accounting info
          (SELECT COALESCE(SUM(quantity * unit_cost), 0)
           FROM inventory_transactions
           WHERE inventory_item_id = ii.id AND transaction_type = 'purchase') as total_investment,
          (SELECT COALESCE(SUM(quantity), 0)
           FROM inventory_transactions
           WHERE inventory_item_id = ii.id AND transaction_type = 'sale') as total_sold,
          (SELECT COALESCE(AVG(unit_cost), 0)
           FROM inventory_transactions
           WHERE inventory_item_id = ii.id AND transaction_type = 'purchase') as average_cost,
          (SELECT COALESCE(SUM(quantity * unit_cost), 0)
           FROM inventory_transactions
           WHERE inventory_item_id = ii.id AND transaction_type = 'sale') as total_cogs
         FROM inventory_items ii
         LEFT JOIN inventory_categories ic ON ii.category_id = ic.id
         LEFT JOIN products p ON ii.id = p.inventory_item_id
         WHERE ii.id = $1 AND ii.business_id = $2`,
        [itemId, businessId]
      );

      if (result.rows.length === 0) {
        throw new Error('Item not found or access denied');
      }

      const item = result.rows[0];

      // Get recent transactions
      const transactionsResult = await client.query(
        `SELECT
           it.*,
           je.description as journal_description,
           CASE
             WHEN it.reference_type = 'pos_transaction' THEN 'POS Sale'
             WHEN it.reference_type = 'purchase_order' THEN 'Purchase'
             ELSE it.reference_type
           END as transaction_source
         FROM inventory_transactions it
         LEFT JOIN journal_entries je ON it.journal_entry_id = je.id
         WHERE it.inventory_item_id = $1 AND it.business_id = $2
         ORDER BY it.created_at DESC
         LIMIT 20`,
        [itemId, businessId]
      );

      item.recent_transactions = transactionsResult.rows;

      // Get current valuation from FIFO view
      const valuationResult = await client.query(
        `SELECT * FROM inventory_valuation_fifo
         WHERE inventory_item_id = $1 AND business_id = $2`,
        [itemId, businessId]
      );

      if (valuationResult.rows.length > 0) {
        item.valuation = valuationResult.rows[0];
      }

      return item;
    } catch (error) {
      log.error('Get item by ID service error', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update inventory item
   */
  static async updateItem(businessId, itemId, itemData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const itemCheck = await client.query(
        'SELECT * FROM inventory_items WHERE id = $1 AND business_id = $2',
        [itemId, businessId]
      );

      if (itemCheck.rows.length === 0) {
        throw new Error('Item not found or access denied');
      }

      if (itemData.category_id) {
        const categoryCheck = await client.query(
          'SELECT id FROM inventory_categories WHERE id = $1 AND business_id = $2',
          [itemData.category_id, businessId]
        );

        if (categoryCheck.rows.length === 0) {
          throw new Error('Category not found or access denied');
        }
      }

      if (itemData.sku) {
        const skuCheck = await client.query(
          'SELECT id FROM inventory_items WHERE business_id = $1 AND sku = $2 AND id != $3',
          [businessId, itemData.sku, itemId]
        );

        if (skuCheck.rows.length > 0) {
          throw new Error('SKU already exists');
        }
      }

      const result = await client.query(
        `UPDATE inventory_items
         SET
           category_id = COALESCE($1, category_id),
           name = COALESCE($2, name),
           description = COALESCE($3, description),
           sku = COALESCE($4, sku),
           cost_price = COALESCE($5, cost_price),
           selling_price = COALESCE($6, selling_price),
           min_stock_level = COALESCE($7, min_stock_level),
           max_stock_level = COALESCE($8, max_stock_level),
           unit_of_measure = COALESCE($9, unit_of_measure),
           is_active = COALESCE($10, is_active),
           updated_at = NOW()
         WHERE id = $11 AND business_id = $12
         RETURNING *`,
        [
          itemData.category_id,
          itemData.name,
          itemData.description,
          itemData.sku,
          itemData.cost_price,
          itemData.selling_price,
          itemData.min_stock_level,
          itemData.max_stock_level,
          itemData.unit_of_measure,
          itemData.is_active,
          itemId,
          businessId
        ]
      );

      const updatedItem = result.rows[0];

      // If stock changed significantly, create adjustment transaction
      const oldStock = parseFloat(itemCheck.rows[0].current_stock);
      const newStock = parseFloat(itemData.current_stock || oldStock);

      if (Math.abs(newStock - oldStock) > 0.01 && itemData.current_stock !== undefined) {
        const adjustmentQuantity = newStock - oldStock;
        const adjustmentType = adjustmentQuantity > 0 ? 'adjustment' : 'write_off';

        await client.query(
          `INSERT INTO inventory_transactions (
            business_id, inventory_item_id, transaction_type,
            quantity, unit_cost, reference_type, notes, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            businessId,
            itemId,
            adjustmentType,
            Math.abs(adjustmentQuantity),
            updatedItem.cost_price,
            'inventory_adjustment',
            `Stock adjustment from ${oldStock} to ${newStock}`,
            userId
          ]
        );
      }

      // Sync to product if linked
      const productCheck = await client.query(
        'SELECT id FROM products WHERE inventory_item_id = $1 AND business_id = $2',
        [itemId, businessId]
      );

      if (productCheck.rows.length > 0) {
        try {
          await InventorySyncService.syncInventoryToProduct(itemId, userId);
        } catch (syncError) {
          log.warn(`Failed to sync inventory to product:`, syncError);
        }
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'inventory.item.updated',
        resourceType: 'inventory_item',
        resourceId: itemId,
        newValues: itemData,
        stock_adjustment: Math.abs(newStock - oldStock) > 0.01 ? {
          old_stock: oldStock,
          new_stock: newStock,
          adjustment: newStock - oldStock
        } : null
      });

      await client.query('COMMIT');
      return updatedItem;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all inventory categories
   */
  static async getCategories(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT * FROM inventory_categories
        WHERE business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (filters.is_active !== undefined) {
        paramCount++;
        queryStr += ` AND is_active = $${paramCount}`;
        params.push(filters.is_active);
      }

      queryStr += ' ORDER BY name';

      log.info('🗄️ Database Query:', { query: queryStr, params });

      const result = await client.query(queryStr, params);

      log.info('✅ Database query successful', {
        rowCount: result.rows.length,
        businessId
      });

      return result.rows;
    } catch (error) {
      log.error('❌ Database query failed in getCategories:', {
        error: error.message,
        businessId,
        filters
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all inventory items with optional filters
   */
  static async getItems(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT
          ii.*,
          ic.name as category_name,
          CASE
            WHEN ii.current_stock <= ii.min_stock_level AND ii.min_stock_level > 0 THEN 'low'
            WHEN ii.current_stock = 0 THEN 'out_of_stock'
            ELSE 'adequate'
          END as stock_status,
          -- Accounting info
          (SELECT COUNT(*) FROM inventory_transactions it
           WHERE it.inventory_item_id = ii.id) as transaction_count,
          (SELECT COALESCE(SUM(it.quantity * it.unit_cost), 0)
           FROM inventory_transactions it
           WHERE it.inventory_item_id = ii.id AND it.transaction_type = 'purchase') as total_investment,
          -- Product link
          p.id as product_id,
          p.name as product_name
        FROM inventory_items ii
        LEFT JOIN inventory_categories ic ON ii.category_id = ic.id
        LEFT JOIN products p ON ii.id = p.inventory_item_id
        WHERE ii.business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (filters.category_id) {
        paramCount++;
        queryStr += ` AND ii.category_id = $${paramCount}`;
        params.push(filters.category_id);
      }

      if (filters.is_active !== undefined) {
        paramCount++;
        queryStr += ` AND ii.is_active = $${paramCount}`;
        params.push(filters.is_active);
      }

      if (filters.low_stock) {
        queryStr += ` AND ii.current_stock <= ii.min_stock_level AND ii.min_stock_level > 0`;
      }

      // Search filter
      if (filters.search) {
        paramCount++;
        queryStr += ` AND (
          ii.name ILIKE $${paramCount} OR
          ii.sku ILIKE $${paramCount} OR
          ii.description ILIKE $${paramCount} OR
          ic.name ILIKE $${paramCount}
        )`;
        params.push(`%${filters.search}%`);
      }

      queryStr += ' ORDER BY ii.name';

      if (filters.page && filters.limit) {
        const offset = (filters.page - 1) * filters.limit;
        paramCount++;
        queryStr += ` LIMIT $${paramCount}`;
        params.push(filters.limit);

        paramCount++;
        queryStr += ` OFFSET $${paramCount}`;
        params.push(offset);
      }

      log.info('🗄️ Database Query:', { query: queryStr, params });

      const result = await client.query(queryStr, params);

      log.info('✅ Database query successful', {
        rowCount: result.rows.length,
        businessId
      });

      return result.rows;
    } catch (error) {
      log.error('❌ Database query failed in getItems:', {
        error: error.message,
        businessId,
        filters
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Record inventory movement with accounting integration
   */
  static async recordMovement(businessId, movementData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const itemCheck = await client.query(
        'SELECT id, current_stock, name, cost_price FROM inventory_items WHERE id = $1 AND business_id = $2',
        [movementData.inventory_item_id, businessId]
      );

      if (itemCheck.rows.length === 0) {
        throw new Error('Inventory item not found or access denied');
      }

      const item = itemCheck.rows[0];
      const currentStock = parseFloat(item.current_stock);
      const quantity = parseFloat(movementData.quantity);
      const unitCost = parseFloat(movementData.unit_cost);
      const totalValue = quantity * unitCost;

      // Handle purchases with accounting entries
      if (movementData.movement_type === 'purchase') {
        try {
          await InventoryAccountingService.recordInventoryPurchase(
            {
              business_id: businessId,
              purchase_order_id: movementData.reference_id,
              inventory_item_id: movementData.inventory_item_id,
              quantity: quantity,
              unit_cost: unitCost,
              payment_method: movementData.payment_method || 'accounts_payable'
            },
            userId
          );
        } catch (accountingError) {
          log.error('Inventory purchase accounting failed:', accountingError);
          throw new Error(`Purchase accounting failed: ${accountingError.message}`);
        }
      }
      // ADD THIS NEW CODE FOR INTERNAL USE ACCOUNTING:
      else if (movementData.movement_type === 'internal_use') {
        try {
          await this.recordInternalUseAccounting(
            businessId,
            movementData.inventory_item_id,
            quantity,
            unitCost,
            movementData.notes || '',
            userId
          );
        } catch (accountingError) {
          log.error('Internal use accounting failed:', accountingError);
          throw new Error(`Internal use accounting failed: ${accountingError.message}`);
        }
      }

      // Record inventory movement
      const movementResult = await client.query(
        `INSERT INTO inventory_movements (
          business_id, inventory_item_id, movement_type, quantity,
          unit_cost, total_value, reference_type, reference_id, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          businessId,
          movementData.inventory_item_id,
          movementData.movement_type,
          quantity,
          unitCost,
          totalValue,
          movementData.reference_type || null,
          movementData.reference_id || null,
          movementData.notes || '',
          userId
        ]
      );

      const movement = movementResult.rows[0];

      // Update inventory stock
      const newStock = await client.query(
        'SELECT update_inventory_stock($1, $2, $3) as new_stock',
        [movementData.inventory_item_id, quantity, movementData.movement_type]
      );

      // Sync to product if it's a purchase or major adjustment
      if (movementData.movement_type === 'purchase' || movementData.movement_type === 'adjustment') {
        try {
          await InventorySyncService.syncInventoryToProduct(movementData.inventory_item_id, userId);
        } catch (syncError) {
          log.warn(`Failed to sync inventory to product:`, syncError);
        }
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'inventory.movement.created',
        resourceType: 'inventory_movement',
        resourceId: movement.id,
        newValues: {
          movement_type: movement.movement_type,
          quantity: movement.quantity,
          unit_cost: movement.unit_cost,
          new_stock: parseFloat(newStock.rows[0].new_stock),
          accounting_created: movementData.movement_type === 'purchase'
        }
      });

      await client.query('COMMIT');
      return { movement, new_stock: parseFloat(newStock.rows[0].new_stock) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get low stock alerts
   */
  static async getLowStockAlerts(businessId) {
    const client = await getClient();

    try {
      const result = await client.query(
        `SELECT * FROM get_low_stock_items($1)`,
        [businessId]
      );

      return result.rows;
    } catch (error) {
      log.error('❌ Database query failed in getLowStockAlerts:', {
        error: error.message,
        businessId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get inventory statistics with accounting metrics
   */
  static async getInventoryStatistics(businessId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT
          COUNT(*) as total_items,
          COUNT(*) FILTER (WHERE is_active = true) as active_items,
          COUNT(*) FILTER (WHERE current_stock <= min_stock_level AND min_stock_level > 0) as low_stock_items,
          COUNT(*) FILTER (WHERE current_stock = 0) as out_of_stock_items,
          SUM(current_stock * cost_price) as total_inventory_value,
          SUM(current_stock * selling_price) as total_potential_revenue,
          -- Accounting metrics
          (SELECT COALESCE(SUM(total_cost), 0) FROM inventory_transactions
           WHERE business_id = $1 AND transaction_type = 'purchase') as total_purchases_value,
          (SELECT COALESCE(SUM(total_cost), 0) FROM inventory_transactions
           WHERE business_id = $1 AND transaction_type = 'sale') as total_cogs_value,
          (SELECT COUNT(*) FROM inventory_transactions WHERE business_id = $1) as total_transactions
        FROM inventory_items
        WHERE business_id = $1
      `;

      const result = await client.query(queryStr, [businessId]);

      return result.rows[0];
    } catch (error) {
      log.error('❌ Database query failed in getInventoryStatistics:', {
        error: error.message,
        businessId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get inventory valuation report (GAAP-compliant FIFO)
   */
  static async getInventoryValuationReport(businessId, asOfDate = new Date()) {
    try {
      return await InventoryAccountingService.getInventoryValuation(businessId, 'fifo', asOfDate);
    } catch (error) {
      log.error('Inventory valuation report error:', error);
      throw error;
    }
  }

  /**
   * Get COGS report for a period
   */
  static async getCogsReport(businessId, startDate, endDate) {
    try {
      return await InventoryAccountingService.getCogsReport(businessId, startDate, endDate);
    } catch (error) {
      log.error('COGS report error:', error);
      throw error;
    }
  }

  /**
   * Sync all inventory items to products
   */
  static async syncAllInventoryToProducts(businessId, userId) {
    try {
      return await InventoryAccountingService.syncAllInventoryToProducts(businessId, userId);
    } catch (error) {
      log.error('Bulk sync error:', error);
      throw error;
    }
  }

  /**
   * Get sync status between inventory and products
   */
  static async getSyncStatus(businessId) {
    try {
      return await InventorySyncService.getSyncStatus(businessId);
    } catch (error) {
      log.error('Sync status error:', error);
      throw error;
    }
  }

  /**
   * Record internal use of inventory with accounting entries
   */
  static async recordInternalUseAccounting(businessId, inventoryItemId, quantity, unitCost, notes, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Get inventory item details
      const itemResult = await client.query(
        `SELECT ii.*, ic.name as category_name, ic.category_type
         FROM inventory_items ii
         LEFT JOIN inventory_categories ic ON ii.category_id = ic.id
         WHERE ii.id = $1 AND ii.business_id = $2`,
        [inventoryItemId, businessId]
      );

      if (itemResult.rows.length === 0) {
        throw new Error('Inventory item not found or access denied');
      }

      const item = itemResult.rows[0];
      const totalCost = quantity * unitCost;

      // 2. Determine which expense account to use based on category
      let expenseAccountCode;
      switch (item.category_type) {
        case 'internal_use':
          expenseAccountCode = '5201'; // Office Supplies Expense (default for internal use)
          break;
        case 'sale':
          // If something meant for sale is used internally, still expense it
          expenseAccountCode = '5209'; // Miscellaneous Expense (or create new account)
          break;
        case 'both':
          expenseAccountCode = '5201'; // Office Supplies Expense
          break;
        default:
          expenseAccountCode = '5201'; // Default to Office Supplies
      }

      // 3. Get the specific expense account ID
      const expenseAccountResult = await client.query(
        `SELECT id FROM chart_of_accounts
         WHERE business_id = $1 AND account_code = $2`,
        [businessId, expenseAccountCode]
      );

      let expenseAccountId;
      if (expenseAccountResult.rows.length === 0) {
        // Fallback to any expense account
        const fallbackResult = await client.query(
          `SELECT id FROM chart_of_accounts
           WHERE business_id = $1 AND account_type = 'expense'
           LIMIT 1`,
          [businessId]
        );
        
        if (fallbackResult.rows.length === 0) {
          throw new Error('No expense account found for internal use');
        }
        
        expenseAccountId = fallbackResult.rows[0].id;
      } else {
        expenseAccountId = expenseAccountResult.rows[0].id;
      }

      // 4. Get inventory asset account (1300)
      const inventoryAccountResult = await client.query(
        `SELECT id FROM chart_of_accounts
         WHERE business_id = $1 AND account_code = '1300'`,
        [businessId]
      );

      if (inventoryAccountResult.rows.length === 0) {
        throw new Error('Inventory asset account (1300) not found');
      }

      const inventoryAccountId = inventoryAccountResult.rows[0].id;

      // 5. Create journal entry for internal use
      const journalEntryResult = await client.query(
        `INSERT INTO journal_entries (
          business_id,
          journal_date,
          reference_number,
          reference_type,
          reference_id,
          description,
          total_amount,
          created_by,
          posted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          businessId,
          new Date(),
          'INTUSE-' + Date.now(),
          'inventory_internal_use',
          inventoryItemId,
          `Internal use: ${quantity} ${item.unit_of_measure} of ${item.name} - ${notes}`,
          totalCost,
          userId,
          new Date()
        ]
      );

      const journalEntry = journalEntryResult.rows[0];

      // 6. Create journal entry lines
      // Line 1: Debit Expense Account
      await client.query(
        `INSERT INTO journal_entry_lines (
          business_id,
          journal_entry_id,
          account_id,
          line_type,
          amount,
          description
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          businessId,
          journalEntry.id,
          expenseAccountId,
          'debit',
          totalCost,
          `Expense: ${item.name} used internally`
        ]
      );

      // Line 2: Credit Inventory Asset Account
      await client.query(
        `INSERT INTO journal_entry_lines (
          business_id,
          journal_entry_id,
          account_id,
          line_type,
          amount,
          description
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          businessId,
          journalEntry.id,
          inventoryAccountId,
          'credit',
          totalCost,
          `Inventory reduction: ${item.name} used internally`
        ]
      );

      // 7. Create inventory transaction record
      const transactionResult = await client.query(
        `INSERT INTO inventory_transactions (
          business_id, inventory_item_id, transaction_type,
          quantity, unit_cost, reference_type, reference_id,
          journal_entry_id, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          businessId,
          inventoryItemId,
          'write_off', // Using 'write_off' for internal use (or create new type)
          -quantity,
          unitCost,
          'internal_use',
          inventoryItemId,
          journalEntry.id,
          `Internal use: ${notes}`,
          userId
        ]
      );

      const inventoryTransaction = transactionResult.rows[0];

      // 8. Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'inventory.internal_use.recorded',
        resourceType: 'inventory_transaction',
        resourceId: inventoryTransaction.id,
        newValues: {
          item_name: item.name,
          quantity: quantity,
          unit_cost: unitCost,
          total_cost: totalCost,
          expense_account_code: expenseAccountCode,
          notes: notes
        }
      });

      await client.query('COMMIT');

      return {
        inventory_transaction: inventoryTransaction,
        journal_entry: journalEntry,
        expense_account_code: expenseAccountCode,
        total_cost: totalCost
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Internal use accounting error:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
