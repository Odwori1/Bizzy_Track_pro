import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

/**
 * INVENTORY SYNC SERVICE
 * Synchronizes inventory_items and products tables
 * Ensures single source of truth for inventory
 */
export class InventorySyncService {
  /**
   * Get unified inventory view (combined products and inventory items)
   * @param {UUID} businessId - Business ID
   * @param {Object} filters - Optional filters
   * @returns {Array} Unified inventory items
   */
  static async getUnifiedInventory(businessId, filters = {}) {
    const client = await getClient();

    try {
      const query = `
        -- Products with their inventory items
        SELECT 
          'product' as source_type,
          p.id as source_id,
          p.name,
          p.description,
          p.sku,
          p.barcode,
          p.cost_price,
          p.selling_price,
          p.current_stock,
          p.min_stock_level,
          p.max_stock_level,
          p.unit_of_measure,
          p.is_active,
          p.inventory_item_id,
          p.category_id,
          ic.name as category_name,
          p.created_at,
          p.updated_at,
          CASE
            WHEN p.current_stock <= p.min_stock_level AND p.min_stock_level > 0 THEN 'low'
            WHEN p.current_stock = 0 THEN 'out_of_stock'
            ELSE 'adequate'
          END as stock_status,
          TRUE as is_sellable_in_pos
        FROM products p
        LEFT JOIN inventory_categories ic ON p.category_id = ic.id
        WHERE p.business_id = $1
          AND ($2::boolean IS NULL OR p.is_active = $2)
        
        UNION ALL
        
        -- Inventory items without linked products
        SELECT 
          'inventory_item' as source_type,
          ii.id as source_id,
          ii.name,
          ii.description,
          ii.sku,
          ii.barcode,
          ii.cost_price,
          ii.selling_price,
          ii.current_stock,
          ii.min_stock_level,
          ii.max_stock_level,
          ii.unit_of_measure,
          ii.is_active,
          ii.id as inventory_item_id,
          ii.category_id,
          ic.name as category_name,
          ii.created_at,
          ii.updated_at,
          CASE
            WHEN ii.current_stock <= ii.min_stock_level AND ii.min_stock_level > 0 THEN 'low'
            WHEN ii.current_stock = 0 THEN 'out_of_stock'
            ELSE 'adequate'
          END as stock_status,
          FALSE as is_sellable_in_pos -- Not yet in POS catalog
        FROM inventory_items ii
        LEFT JOIN inventory_categories ic ON ii.category_id = ic.id
        LEFT JOIN products p ON ii.id = p.inventory_item_id
        WHERE ii.business_id = $1
          AND p.id IS NULL -- Only inventory items without products
          AND ($2::boolean IS NULL OR ii.is_active = $2)
        
        ORDER BY name
      `;

      const params = [businessId, filters.is_active];
      log.info('Unified inventory query:', { query, params });

      const result = await client.query(query, params);

      // Apply additional filters in code if needed
      let filteredResults = result.rows;

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredResults = filteredResults.filter(item =>
          item.name.toLowerCase().includes(searchLower) ||
          item.sku.toLowerCase().includes(searchLower) ||
          (item.description && item.description.toLowerCase().includes(searchLower))
        );
      }

      if (filters.category_id) {
        filteredResults = filteredResults.filter(item =>
          item.category_id === filters.category_id
        );
      }

      if (filters.low_stock) {
        filteredResults = filteredResults.filter(item =>
          item.stock_status === 'low'
        );
      }

      return filteredResults;

    } catch (error) {
      log.error('Inventory sync service error getting unified inventory:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Make inventory item sellable in POS by creating/updating product
   * @param {UUID} inventoryItemId - Inventory item ID
   * @param {UUID} userId - User ID
   * @returns {Object} Created/updated product
   */
  static async makeInventoryItemSellable(inventoryItemId, userId) {
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

      // Check if product already exists
      const productCheck = await client.query(
        `SELECT id FROM products 
         WHERE business_id = $1 AND inventory_item_id = $2`,
        [inventoryItem.business_id, inventoryItemId]
      );

      let product;
      if (productCheck.rows.length > 0) {
        // Update existing product
        const updateResult = await client.query(
          `UPDATE products 
           SET 
             name = $1,
             description = $2,
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
            inventoryItem.current_stock,
            inventoryItem.min_stock_level,
            inventoryItem.max_stock_level,
            inventoryItem.unit_of_measure,
            inventoryItem.is_active,
            productCheck.rows[0].id
          ]
        );

        product = updateResult.rows[0];
        log.info(`Updated existing product for inventory item: ${inventoryItemId}`);

      } else {
        // Create new product
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
            inventoryItem.current_stock,
            inventoryItem.min_stock_level,
            inventoryItem.max_stock_level,
            inventoryItem.unit_of_measure,
            inventoryItem.is_active
          ]
        );

        product = insertResult.rows[0];
        log.info(`Created new product for inventory item: ${inventoryItemId}`);
      }

      // Audit log
      await auditLogger.logAction({
        businessId: inventoryItem.business_id,
        userId,
        action: 'inventory.item.made_sellable',
        resourceType: 'product',
        resourceId: product.id,
        newValues: {
          inventory_item_id: inventoryItemId,
          product_id: product.id,
          is_sellable_in_pos: true
        }
      });

      await client.query('COMMIT');

      return {
        product: product,
        inventory_item: inventoryItem,
        action: productCheck.rows.length > 0 ? 'updated' : 'created'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Inventory sync service error making item sellable:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Sync product stock to inventory item
   * @param {UUID} productId - Product ID
   * @param {UUID} userId - User ID
   * @returns {Object} Sync result
   */
  static async syncProductToInventory(productId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get product details
      const productResult = await client.query(
        `SELECT * FROM products WHERE id = $1`,
        [productId]
      );

      if (productResult.rows.length === 0) {
        throw new Error(`Product not found: ${productId}`);
      }

      const product = productResult.rows[0];

      // Check if inventory item exists
      let inventoryItem;
      if (product.inventory_item_id) {
        // Update existing inventory item
        const updateResult = await client.query(
          `UPDATE inventory_items 
           SET 
             name = $1,
             description = $2,
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
            product.name,
            product.description,
            product.sku,
            product.cost_price,
            product.selling_price,
            product.current_stock,
            product.min_stock_level,
            product.max_stock_level,
            product.unit_of_measure,
            product.is_active,
            product.inventory_item_id
          ]
        );

        inventoryItem = updateResult.rows[0];
        log.info(`Updated inventory item from product: ${productId}`);

      } else {
        // Create new inventory item
        const insertResult = await client.query(
          `INSERT INTO inventory_items (
            business_id, name, description, sku,
            cost_price, selling_price, current_stock,
            min_stock_level, max_stock_level, unit_of_measure,
            is_active, category_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *`,
          [
            product.business_id,
            product.name,
            product.description,
            product.sku,
            product.cost_price,
            product.selling_price,
            product.current_stock,
            product.min_stock_level,
            product.max_stock_level,
            product.unit_of_measure,
            product.is_active,
            product.category_id
          ]
        );

        inventoryItem = insertResult.rows[0];

        // Update product with inventory_item_id
        await client.query(
          `UPDATE products 
           SET inventory_item_id = $1, updated_at = NOW()
           WHERE id = $2`,
          [inventoryItem.id, productId]
        );

        log.info(`Created new inventory item from product: ${productId}`);
      }

      // Audit log
      await auditLogger.logAction({
        businessId: product.business_id,
        userId,
        action: 'product.synced_to_inventory',
        resourceType: 'inventory_item',
        resourceId: inventoryItem.id,
        newValues: {
          product_id: productId,
          inventory_item_id: inventoryItem.id,
          stock_synced: product.current_stock
        }
      });

      await client.query('COMMIT');

      return {
        inventory_item: inventoryItem,
        product: product,
        action: product.inventory_item_id ? 'updated' : 'created'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Inventory sync service error syncing product to inventory:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get sync status between products and inventory items
   * @param {UUID} businessId - Business ID
   * @returns {Object} Sync status report
   */
  static async getSyncStatus(businessId) {
    const client = await getClient();

    try {
      // Products with inventory items
      const syncedProductsResult = await client.query(
        `SELECT COUNT(*) as count 
         FROM products 
         WHERE business_id = $1 AND inventory_item_id IS NOT NULL`,
        [businessId]
      );

      // Products without inventory items
      const unsyncedProductsResult = await client.query(
        `SELECT COUNT(*) as count 
         FROM products 
         WHERE business_id = $1 AND inventory_item_id IS NULL`,
        [businessId]
      );

      // Inventory items with products
      const syncedInventoryResult = await client.query(
        `SELECT COUNT(*) as count 
         FROM inventory_items ii
         JOIN products p ON ii.id = p.inventory_item_id
         WHERE ii.business_id = $1`,
        [businessId]
      );

      // Inventory items without products (not sellable in POS)
      const unsellableInventoryResult = await client.query(
        `SELECT COUNT(*) as count 
         FROM inventory_items ii
         LEFT JOIN products p ON ii.id = p.inventory_item_id
         WHERE ii.business_id = $1 AND p.id IS NULL`,
        [businessId]
      );

      // Stock discrepancies
      const stockDiscrepanciesResult = await client.query(
        `SELECT 
           p.id as product_id,
           p.name as product_name,
           p.current_stock as product_stock,
           ii.id as inventory_item_id,
           ii.name as inventory_item_name,
           ii.current_stock as inventory_stock,
           ABS(p.current_stock - ii.current_stock) as stock_difference
         FROM products p
         JOIN inventory_items ii ON p.inventory_item_id = ii.id
         WHERE p.business_id = $1 
           AND ABS(p.current_stock - ii.current_stock) > 0.01`,
        [businessId]
      );

      return {
        summary: {
          total_products: parseInt(syncedProductsResult.rows[0].count) + parseInt(unsyncedProductsResult.rows[0].count),
          synced_products: parseInt(syncedProductsResult.rows[0].count),
          unsynced_products: parseInt(unsyncedProductsResult.rows[0].count),
          total_inventory_items: parseInt(syncedInventoryResult.rows[0].count) + parseInt(unsellableInventoryResult.rows[0].count),
          sellable_inventory_items: parseInt(syncedInventoryResult.rows[0].count),
          unsellable_inventory_items: parseInt(unsellableInventoryResult.rows[0].count),
          stock_discrepancies: stockDiscrepanciesResult.rows.length
        },
        stock_discrepancies: stockDiscrepanciesResult.rows,
        sync_percentage: {
          products: parseInt(syncedProductsResult.rows[0].count) / 
                   (parseInt(syncedProductsResult.rows[0].count) + parseInt(unsyncedProductsResult.rows[0].count)) * 100,
          inventory_items: parseInt(syncedInventoryResult.rows[0].count) / 
                         (parseInt(syncedInventoryResult.rows[0].count) + parseInt(unsellableInventoryResult.rows[0].count)) * 100
        }
      };

    } catch (error) {
      log.error('Inventory sync service error getting sync status:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Fix stock discrepancies between products and inventory items
   * @param {UUID} businessId - Business ID
   * @param {String} source - Which source to use: 'product', 'inventory', or 'average'
   * @param {UUID} userId - User ID
   * @returns {Object} Fix results
   */
  static async fixStockDiscrepancies(businessId, source = 'inventory', userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get discrepancies
      const discrepanciesResult = await client.query(
        `SELECT 
           p.id as product_id,
           p.current_stock as product_stock,
           ii.id as inventory_item_id,
           ii.current_stock as inventory_stock
         FROM products p
         JOIN inventory_items ii ON p.inventory_item_id = ii.id
         WHERE p.business_id = $1 
           AND ABS(p.current_stock - ii.current_stock) > 0.01`,
        [businessId]
      );

      const fixes = [];
      const errors = [];

      for (const discrepancy of discrepanciesResult.rows) {
        try {
          let correctStock;
          let fixedSource;
          let fixedTarget;

          switch (source) {
            case 'product':
              correctStock = parseFloat(discrepancy.product_stock);
              fixedSource = 'product';
              fixedTarget = 'inventory_item';
              await client.query(
                `UPDATE inventory_items 
                 SET current_stock = $1, updated_at = NOW()
                 WHERE id = $2`,
                [correctStock, discrepancy.inventory_item_id]
              );
              break;

            case 'inventory':
              correctStock = parseFloat(discrepancy.inventory_stock);
              fixedSource = 'inventory_item';
              fixedTarget = 'product';
              await client.query(
                `UPDATE products 
                 SET current_stock = $1, updated_at = NOW()
                 WHERE id = $2`,
                [correctStock, discrepancy.product_id]
              );
              break;

            case 'average':
              correctStock = (parseFloat(discrepancy.product_stock) + parseFloat(discrepancy.inventory_stock)) / 2;
              fixedSource = 'average';
              fixedTarget = 'both';
              await client.query(
                `UPDATE products 
                 SET current_stock = $1, updated_at = NOW()
                 WHERE id = $2`,
                [correctStock, discrepancy.product_id]
              );
              await client.query(
                `UPDATE inventory_items 
                 SET current_stock = $1, updated_at = NOW()
                 WHERE id = $2`,
                [correctStock, discrepancy.inventory_item_id]
              );
              break;

            default:
              throw new Error(`Invalid source: ${source}`);
          }

          fixes.push({
            product_id: discrepancy.product_id,
            inventory_item_id: discrepancy.inventory_item_id,
            previous_product_stock: discrepancy.product_stock,
            previous_inventory_stock: discrepancy.inventory_stock,
            corrected_stock: correctStock,
            fixed_source: fixedSource,
            fixed_target: fixedTarget
          });

          // Audit log
          await auditLogger.logAction({
            businessId,
            userId,
            action: 'inventory.stock_discrepancy_fixed',
            resourceType: 'product',
            resourceId: discrepancy.product_id,
            oldValues: {
              product_stock: discrepancy.product_stock,
              inventory_stock: discrepancy.inventory_stock
            },
            newValues: {
              corrected_stock: correctStock,
              fix_method: source
            }
          });

        } catch (error) {
          errors.push({
            product_id: discrepancy.product_id,
            inventory_item_id: discrepancy.inventory_item_id,
            error: error.message
          });
          log.error(`Failed to fix discrepancy for product ${discrepancy.product_id}:`, error);
        }
      }

      await client.query('COMMIT');

      return {
        total_discrepancies: discrepanciesResult.rows.length,
        fixed: fixes.length,
        failed: errors.length,
        fixes: fixes,
        errors: errors,
        fix_method: source
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Inventory sync service error fixing stock discrepancies:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
