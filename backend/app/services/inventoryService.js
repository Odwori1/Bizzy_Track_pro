import { query, getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class InventoryService {
  /**
   * Get inventory overview dashboard data
   */
  static async getOverview(businessId) {
    const client = await getClient();

    try {
      log.info('Getting inventory overview', { businessId });

      // Get total items count
      const totalItemsResult = await client.query(
        'SELECT COUNT(*) as count FROM inventory_items WHERE business_id = $1 AND is_active = true',
        [businessId]
      );

      // Get low stock items count
      const lowStockResult = await client.query(
        `SELECT COUNT(*) as count FROM inventory_items
         WHERE business_id = $1 AND is_active = true
         AND current_stock <= min_stock_level AND min_stock_level > 0`,
        [businessId]
      );

      // Get out of stock items count
      const outOfStockResult = await client.query(
        'SELECT COUNT(*) as count FROM inventory_items WHERE business_id = $1 AND is_active = true AND current_stock <= 0',
        [businessId]
      );

      // Get total inventory value
      const totalValueResult = await client.query(
        'SELECT SUM(current_stock * cost_price) as total_value FROM inventory_items WHERE business_id = $1 AND is_active = true',
        [businessId]
      );

      // Get recent movements
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

      // Get categories summary
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

      return {
        summary: {
          total_items: parseInt(totalItemsResult.rows[0].count) || 0,
          low_stock_items: parseInt(lowStockResult.rows[0].count) || 0,
          out_of_stock_items: parseInt(outOfStockResult.rows[0].count) || 0,
          total_inventory_value: parseFloat(totalValueResult.rows[0].total_value) || 0
        },
        categories: categoriesResult.rows,
        recent_movements: recentMovementsResult.rows,
        alerts: {
          has_low_stock: parseInt(lowStockResult.rows[0].count) > 0,
          has_out_of_stock: parseInt(outOfStockResult.rows[0].count) > 0
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

      // Check if category exists and belongs to business
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

      // Check if category exists and belongs to business
      const categoryCheck = await client.query(
        'SELECT * FROM inventory_categories WHERE id = $1 AND business_id = $2',
        [categoryId, businessId]
      );

      if (categoryCheck.rows.length === 0) {
        throw new Error('Category not found or access denied');
      }

      // Check if category has items
      const itemsCheck = await client.query(
        'SELECT COUNT(*) as item_count FROM inventory_items WHERE category_id = $1 AND business_id = $2',
        [categoryId, businessId]
      );

      const itemCount = parseInt(itemsCheck.rows[0].item_count);
      if (itemCount > 0) {
        throw new Error(`Cannot delete category with ${itemCount} associated items`);
      }

      // Delete the category
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
   * Create inventory item
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
          selling_price: item.selling_price
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
   * Get inventory item by ID
   */
  static async getItemById(businessId, itemId) {
    const client = await getClient();

    try {
      const result = await client.query(
        `SELECT
          ii.*,
          ic.name as category_name,
          CASE
            WHEN ii.current_stock <= ii.min_stock_level AND ii.min_stock_level > 0 THEN 'low'
            WHEN ii.current_stock = 0 THEN 'out_of_stock'
            ELSE 'adequate'
          END as stock_status
         FROM inventory_items ii
         LEFT JOIN inventory_categories ic ON ii.category_id = ic.id
         WHERE ii.id = $1 AND ii.business_id = $2`,
        [itemId, businessId]
      );

      if (result.rows.length === 0) {
        throw new Error('Item not found or access denied');
      }

      return result.rows[0];
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

      // Check if item exists and belongs to business
      const itemCheck = await client.query(
        'SELECT * FROM inventory_items WHERE id = $1 AND business_id = $2',
        [itemId, businessId]
      );

      if (itemCheck.rows.length === 0) {
        throw new Error('Item not found or access denied');
      }

      // If category is being updated, verify it belongs to business
      if (itemData.category_id) {
        const categoryCheck = await client.query(
          'SELECT id FROM inventory_categories WHERE id = $1 AND business_id = $2',
          [itemData.category_id, businessId]
        );

        if (categoryCheck.rows.length === 0) {
          throw new Error('Category not found or access denied');
        }
      }

      // If SKU is being updated, check for duplicates
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

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'inventory.item.updated',
        resourceType: 'inventory_item',
        resourceId: itemId,
        newValues: itemData
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
          END as stock_status
        FROM inventory_items ii
        LEFT JOIN inventory_categories ic ON ii.category_id = ic.id
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
   * Record inventory movement and update stock
   */
  static async recordMovement(businessId, movementData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify item belongs to business
      const itemCheck = await client.query(
        'SELECT id, current_stock FROM inventory_items WHERE id = $1 AND business_id = $2',
        [movementData.inventory_item_id, businessId]
      );

      if (itemCheck.rows.length === 0) {
        throw new Error('Inventory item not found or access denied');
      }

      const currentStock = parseFloat(itemCheck.rows[0].current_stock);
      const quantity = parseFloat(movementData.quantity);
      const unitCost = parseFloat(movementData.unit_cost);
      const totalValue = quantity * unitCost;

      // Record the movement
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

      // Update inventory stock using the helper function
      const newStock = await client.query(
        'SELECT update_inventory_stock($1, $2, $3) as new_stock',
        [movementData.inventory_item_id, quantity, movementData.movement_type]
      );

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
          new_stock: parseFloat(newStock.rows[0].new_stock)
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
      log.info('🗄️ Database Query: get_low_stock_items function');

      const result = await client.query(
        `SELECT * FROM get_low_stock_items($1)`,
        [businessId]
      );

      log.info('✅ Database query successful', {
        rowCount: result.rows.length,
        businessId
      });

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
   * Get inventory statistics
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
          SUM(current_stock * selling_price) as total_potential_revenue
         FROM inventory_items
         WHERE business_id = $1
      `;

      log.info('🗄️ Database Query:', { query: queryStr, params: [businessId] });

      const result = await client.query(queryStr, [businessId]);

      log.info('✅ Database query successful', {
        rowCount: result.rows.length,
        businessId
      });

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
}
