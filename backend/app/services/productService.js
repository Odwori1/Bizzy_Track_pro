import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { InventorySyncService } from './inventorySyncService.js';

export class ProductService {
  /**
   * Generate unique SKU for product
   */
  static async generateUniqueSKU(businessId, productName) {
    const client = await getClient();

    try {
      // Create base SKU from product name (first 3 letters + random numbers)
      const baseName = productName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
      let sku = '';
      let attempts = 0;
      let skuExists = true;

      do {
        const randomNum = Math.floor(1000 + Math.random() * 9000); // 1000-9999
        sku = `${baseName}-${randomNum}`;

        // Check if SKU exists in both products and inventory items
        const skuCheck = await client.query(
          `SELECT id FROM products WHERE business_id = $1 AND sku = $2
           UNION
           SELECT id FROM inventory_items WHERE business_id = $1 AND sku = $2`,
          [businessId, sku]
        );

        skuExists = skuCheck.rows.length > 0;
        attempts++;

        if (attempts > 10) {
          // Fallback: use timestamp
          const timestamp = Date.now().toString().slice(-4);
          sku = `${baseName}-${timestamp}`;
          break;
        }
      } while (skuExists);

      return sku;
    } finally {
      client.release();
    }
  }

  /**
   * Create a new product with inventory integration
   */
  static async createProduct(businessId, productData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify category belongs to business
      const categoryCheck = await client.query(
        'SELECT id FROM inventory_categories WHERE id = $1 AND business_id = $2',
        [productData.category_id, businessId]
      );

      if (categoryCheck.rows.length === 0) {
        throw new Error('Category not found or access denied');
      }

      // Auto-generate SKU if not provided
      let finalSKU = productData.sku;
      if (!finalSKU || finalSKU.trim() === '') {
        finalSKU = await this.generateUniqueSKU(businessId, productData.name);
        log.info('Auto-generated SKU', { productName: productData.name, generatedSKU: finalSKU });
      }

      // Check for duplicate SKU in both products and inventory items
      const skuCheck = await client.query(
        `SELECT id FROM products WHERE business_id = $1 AND sku = $2
         UNION
         SELECT id FROM inventory_items WHERE business_id = $1 AND sku = $2`,
        [businessId, finalSKU]
      );

      if (skuCheck.rows.length > 0) {
        throw new Error('SKU already exists in products or inventory items');
      }

      // Insert product
      const result = await client.query(
        `INSERT INTO products (
          business_id, name, description, sku, barcode, category_id,
          cost_price, selling_price, current_stock, min_stock_level,
          max_stock_level, unit_of_measure, is_active, has_variants,
          variant_data, image_urls, tags, tax_category_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *`,
        [
          businessId,
          productData.name,
          productData.description || '',
          finalSKU,
          productData.barcode || '',
          productData.category_id,
          productData.cost_price,
          productData.selling_price,
          productData.current_stock || 0,
          productData.min_stock_level || 0,
          productData.max_stock_level || 1000,
          productData.unit_of_measure,
          productData.is_active,
          productData.has_variants,
          productData.variant_data || null,
          productData.image_urls || [],
          productData.tags || [],
          productData.tax_category_code || 'STANDARD_GOODS'
        ]
      );

      const product = result.rows[0];

      // ========================================================================
      // NEW: AUTO-CREATE INVENTORY ITEM IF FLAG IS SET
      // ========================================================================
      if (productData.auto_create_inventory) {
        try {
          const syncResult = await InventorySyncService.syncProductToInventory(product.id, userId);
          log.info(`Auto-created inventory item from product: ${product.id} → ${syncResult.inventory_item.id}`);

          // Update product with inventory_item_id
          await client.query(
            `UPDATE products
             SET inventory_item_id = $1, updated_at = NOW()
             WHERE id = $2`,
            [syncResult.inventory_item.id, product.id]
          );

          product.inventory_item_id = syncResult.inventory_item.id;
        } catch (syncError) {
          log.warn(`Failed to auto-create inventory item from product:`, syncError);
          // Don't fail the whole operation
        }
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'product.created',
        resourceType: 'product',
        resourceId: product.id,
        newValues: {
          name: product.name,
          sku: product.sku,
          cost_price: product.cost_price,
          selling_price: product.selling_price,
          tax_category_code: product.tax_category_code,
          auto_inventory_created: productData.auto_create_inventory || false
        }
      });

      await client.query('COMMIT');
      return product;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all products with inventory sync status
   */
  static async getProducts(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT
          p.*,
          ic.name as category_name,
          ptc.category_name as tax_category_name,  -- NEW
          ptc.global_treatment as tax_treatment,   -- NEW
          CASE
            WHEN p.current_stock <= p.min_stock_level AND p.min_stock_level > 0 THEN 'low'
            WHEN p.current_stock = 0 THEN 'out_of_stock'
            ELSE 'adequate'
          END as stock_status,
          COUNT(pv.id) as variant_count,
          -- Inventory sync status
          CASE
            WHEN p.inventory_item_id IS NOT NULL THEN 'synced'
            ELSE 'not_synced'
          END as inventory_sync_status,
          ii.name as inventory_item_name,
          ii.current_stock as inventory_stock,
          ii.cost_price as inventory_cost,
          -- Accounting metrics
          (SELECT COUNT(*) FROM inventory_transactions it
           WHERE it.inventory_item_id = ii.id
             AND it.transaction_type = 'sale'
             AND it.created_at >= CURRENT_DATE - INTERVAL '30 days') as recent_sales_count
        FROM products p
        LEFT JOIN inventory_categories ic ON p.category_id = ic.id
        LEFT JOIN product_tax_categories ptc ON p.tax_category_code = ptc.category_code  -- NEW JOIN
        LEFT JOIN inventory_items ii ON p.inventory_item_id = ii.id
        LEFT JOIN product_variants pv ON p.id = pv.product_id AND pv.is_active = true
        WHERE p.business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (filters.category_id) {
        paramCount++;
        queryStr += ` AND p.category_id = $${paramCount}`;
        params.push(filters.category_id);
      }

      if (filters.is_active !== undefined) {
        paramCount++;
        queryStr += ` AND p.is_active = $${paramCount}`;
        params.push(filters.is_active);
      }

      if (filters.has_variants !== undefined) {
        paramCount++;
        queryStr += ` AND p.has_variants = $${paramCount}`;
        params.push(filters.has_variants);
      }

      if (filters.low_stock) {
        queryStr += ` AND p.current_stock <= p.min_stock_level AND p.min_stock_level > 0`;
      }

      if (filters.search) {
        paramCount++;
        queryStr += ` AND (
          p.name ILIKE $${paramCount} OR
          p.description ILIKE $${paramCount} OR
          p.sku ILIKE $${paramCount} OR
          p.barcode ILIKE $${paramCount} OR
          p.tags::text ILIKE $${paramCount}
        )`;
        params.push(`%${filters.search}%`);
      }

      if (filters.synced_only) {
        queryStr += ` AND p.inventory_item_id IS NOT NULL`;
      }

      queryStr += ' GROUP BY p.id, ic.name, ii.id, ii.name, ii.current_stock, ii.cost_price, ptc.category_name, ptc.global_treatment ORDER BY p.name';

      if (filters.page && filters.limit) {
        const offset = (filters.page - 1) * filters.limit;
        paramCount++;
        queryStr += ` LIMIT $${paramCount}`;
        params.push(filters.limit);

        paramCount++;
        queryStr += ` OFFSET $${paramCount}`;
        params.push(offset);
      }

      log.info('🗄️ Database Query - getProducts:', { query: queryStr, params });

      const result = await client.query(queryStr, params);

      log.info('✅ Products query successful', {
        rowCount: result.rows.length,
        businessId,
        synced_count: result.rows.filter(p => p.inventory_sync_status === 'synced').length
      });

      return result.rows;
    } catch (error) {
      log.error('❌ Products query failed:', {
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
   * Get product by ID with inventory and accounting info
   */
  static async getProductById(businessId, productId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT
          p.*,
          ic.name as category_name,
          ptc.category_name as tax_category_name,  -- NEW
          ptc.global_treatment as tax_treatment,   -- NEW
          CASE
            WHEN p.current_stock <= p.min_stock_level AND p.min_stock_level > 0 THEN 'low'
            WHEN p.current_stock = 0 THEN 'out_of_stock'
            ELSE 'adequate'
          END as stock_status,
          -- Inventory info
          ii.id as inventory_item_id,
          ii.name as inventory_item_name,
          ii.current_stock as inventory_stock,
          ii.cost_price as inventory_cost,
          ii.selling_price as inventory_selling_price,
          -- Sales history
          (SELECT COUNT(*) FROM pos_transaction_items pti
           WHERE pti.product_id = p.id
             AND pti.created_at >= CURRENT_DATE - INTERVAL '30 days') as recent_sales_count,
          (SELECT COALESCE(SUM(pti.quantity), 0) FROM pos_transaction_items pti
           WHERE pti.product_id = p.id) as total_sold
        FROM products p
        LEFT JOIN inventory_categories ic ON p.category_id = ic.id
        LEFT JOIN product_tax_categories ptc ON p.tax_category_code = ptc.category_code  -- NEW JOIN
        LEFT JOIN inventory_items ii ON p.inventory_item_id = ii.id
        WHERE p.business_id = $1 AND p.id = $2
      `;

      log.info('🗄️ Database Query - getProductById:', { query: queryStr, params: [businessId, productId] });

      const result = await client.query(queryStr, [businessId, productId]);

      if (result.rows.length === 0) {
        throw new Error('Product not found or access denied');
      }

      const product = result.rows[0];

      // Get recent POS sales
      const salesQuery = `
        SELECT
          pti.*,
          pt.transaction_number,
          pt.transaction_date,
          pt.final_amount,
          CONCAT(c.first_name, ' ', c.last_name) as customer_name
        FROM pos_transaction_items pti
        JOIN pos_transactions pt ON pti.pos_transaction_id = pt.id
        LEFT JOIN customers c ON pt.customer_id = c.id
        WHERE pti.business_id = $1 AND pti.product_id = $2
        ORDER BY pt.transaction_date DESC
        LIMIT 10
      `;

      const salesResult = await client.query(salesQuery, [businessId, productId]);
      product.recent_sales = salesResult.rows;

      // Get inventory transactions if linked
      if (product.inventory_item_id) {
        const transactionsQuery = `
          SELECT it.*, je.description as journal_description
          FROM inventory_transactions it
          LEFT JOIN journal_entries je ON it.journal_entry_id = je.id
          WHERE it.business_id = $1 AND it.inventory_item_id = $2
          ORDER BY it.created_at DESC
          LIMIT 10
        `;

        const transactionsResult = await client.query(transactionsQuery, [businessId, product.inventory_item_id]);
        product.inventory_transactions = transactionsResult.rows;
      }

      log.info('✅ Product query successful', {
        productId,
        businessId,
        inventory_linked: !!product.inventory_item_id,
        tax_category: product.tax_category_code
      });

      return product;
    } catch (error) {
      log.error('❌ Product query failed:', {
        error: error.message,
        businessId,
        productId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update product with inventory sync
   */
  static async updateProduct(businessId, productId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify product belongs to business and get current values
      const currentProduct = await client.query(
        'SELECT * FROM products WHERE id = $1 AND business_id = $2',
        [productId, businessId]
      );

      if (currentProduct.rows.length === 0) {
        throw new Error('Product not found or access denied');
      }

      const current = currentProduct.rows[0];

      // Check for duplicate SKU (check both products and inventory items)
      if (updateData.sku && updateData.sku !== current.sku) {
        const skuCheck = await client.query(
          `SELECT id FROM products WHERE business_id = $1 AND sku = $2 AND id != $3
           UNION
           SELECT id FROM inventory_items WHERE business_id = $1 AND sku = $2`,
          [businessId, updateData.sku, productId]
        );

        if (skuCheck.rows.length > 0) {
          throw new Error('SKU already exists in products or inventory items');
        }
      }

      // Build dynamic update query
      const updateFields = [];
      const updateValues = [];
      let paramCount = 0;

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          paramCount++;
          updateFields.push(`${key} = $${paramCount}`);
          updateValues.push(updateData[key]);
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      paramCount++;
      updateFields.push(`updated_at = $${paramCount}`);
      updateValues.push(new Date());

      paramCount++;
      updateValues.push(productId);
      paramCount++;
      updateValues.push(businessId);

      const updateQuery = `
        UPDATE products
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount - 1} AND business_id = $${paramCount}
        RETURNING *
      `;

      log.info('🗄️ Database Query - updateProduct:', { query: updateQuery, params: updateValues });

      const result = await client.query(updateQuery, updateValues);
      const updatedProduct = result.rows[0];

      // Sync to inventory if product is linked to inventory item
      if (current.inventory_item_id || (updateData.auto_sync_inventory && current.inventory_item_id)) {
        try {
          await InventorySyncService.syncProductToInventory(productId, userId);
          log.info(`Synced product ${productId} to inventory`);
        } catch (syncError) {
          log.warn(`Failed to sync product to inventory:`, syncError);
        }
      }

      // Handle stock discrepancy between product and inventory
      if (current.inventory_item_id && updateData.current_stock !== undefined) {
        const productStock = parseFloat(updateData.current_stock);
        const inventoryResult = await client.query(
          'SELECT current_stock FROM inventory_items WHERE id = $1',
          [current.inventory_item_id]
        );

        if (inventoryResult.rows.length > 0) {
          const inventoryStock = parseFloat(inventoryResult.rows[0].current_stock);
          if (Math.abs(productStock - inventoryStock) > 0.01) {
            log.warn(`Stock discrepancy detected: Product=${productStock}, Inventory=${inventoryStock}`);
            // Could automatically fix or flag for review
          }
        }
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'product.updated',
        resourceType: 'product',
        resourceId: productId,
        oldValues: current,
        newValues: updatedProduct
      });

      await client.query('COMMIT');
      return updatedProduct;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create product variant
   */
  static async createProductVariant(businessId, variantData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify product belongs to business
      const productCheck = await client.query(
        'SELECT id, has_variants FROM products WHERE id = $1 AND business_id = $2',
        [variantData.product_id, businessId]
      );

      if (productCheck.rows.length === 0) {
        throw new Error('Product not found or access denied');
      }

      if (!productCheck.rows[0].has_variants) {
        throw new Error('Product does not support variants');
      }

      // Check for duplicate SKU
      const skuCheck = await client.query(
        'SELECT id FROM product_variants WHERE business_id = $1 AND sku = $2',
        [businessId, variantData.sku]
      );

      if (skuCheck.rows.length > 0) {
        throw new Error('Variant SKU already exists');
      }

      const result = await client.query(
        `INSERT INTO product_variants (
          business_id, product_id, variant_name, sku, barcode,
          cost_price, selling_price, current_stock, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          businessId,
          variantData.product_id,
          variantData.variant_name,
          variantData.sku,
          variantData.barcode || '',
          variantData.cost_price,
          variantData.selling_price,
          variantData.current_stock || 0,
          variantData.is_active
        ]
      );

      const variant = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'product.variant.created',
        resourceType: 'product_variant',
        resourceId: variant.id,
        newValues: {
          product_id: variant.product_id,
          variant_name: variant.variant_name,
          sku: variant.sku
        }
      });

      await client.query('COMMIT');
      return variant;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get product variants
   */
  static async getProductVariants(businessId, productId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT * FROM product_variants
        WHERE business_id = $1 AND product_id = $2 AND is_active = true
        ORDER BY variant_name
      `;

      log.info('🗄️ Database Query - getProductVariants:', { query: queryStr, params: [businessId, productId] });

      const result = await client.query(queryStr, [businessId, productId]);

      log.info('✅ Product variants query successful', {
        rowCount: result.rows.length,
        businessId,
        productId
      });

      return result.rows;
    } catch (error) {
      log.error('❌ Product variants query failed:', {
        error: error.message,
        businessId,
        productId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get product statistics with inventory metrics
   */
  static async getProductStatistics(businessId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT
          COUNT(*) as total_products,
          COUNT(*) FILTER (WHERE is_active = true) as active_products,
          COUNT(*) FILTER (WHERE has_variants = true) as products_with_variants,
          COUNT(*) FILTER (WHERE current_stock <= min_stock_level AND min_stock_level > 0) as low_stock_products,
          COUNT(*) FILTER (WHERE current_stock = 0) as out_of_stock_products,
          SUM(current_stock * cost_price) as total_inventory_value,
          SUM(current_stock * selling_price) as total_potential_revenue,
          -- Inventory sync metrics
          COUNT(*) FILTER (WHERE inventory_item_id IS NOT NULL) as synced_with_inventory,
          COUNT(*) FILTER (WHERE inventory_item_id IS NULL) as not_synced_with_inventory,
          -- Tax category distribution
          COUNT(*) FILTER (WHERE tax_category_code = 'STANDARD_GOODS') as standard_goods_count,
          COUNT(*) FILTER (WHERE tax_category_code = 'ESSENTIAL_GOODS') as essential_goods_count,
          COUNT(*) FILTER (WHERE tax_category_code = 'PHARMACEUTICALS') as pharmaceuticals_count,
          COUNT(*) FILTER (WHERE tax_category_code = 'DIGITAL_SERVICES') as digital_services_count,
          COUNT(*) FILTER (WHERE tax_category_code = 'EXPORT_GOODS') as export_goods_count,
          -- Sales metrics (last 30 days)
          (SELECT COUNT(DISTINCT pti.product_id) FROM pos_transaction_items pti
           JOIN pos_transactions pt ON pti.pos_transaction_id = pt.id
           WHERE pt.business_id = $1
             AND pt.transaction_date >= CURRENT_DATE - INTERVAL '30 days') as products_sold_last_30_days
        FROM products
        WHERE business_id = $1
      `;

      log.info('🗄️ Database Query - getProductStatistics:', { query: queryStr, params: [businessId] });

      const result = await client.query(queryStr, [businessId]);

      log.info('✅ Product statistics query successful', {
        businessId
      });

      return result.rows[0];
    } catch (error) {
      log.error('❌ Product statistics query failed:', {
        error: error.message,
        businessId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Sync product to inventory (force sync)
   */
  static async syncToInventory(businessId, productId, userId) {
    try {
      const result = await InventorySyncService.syncProductToInventory(productId, userId);
      log.info(`Manually synced product ${productId} to inventory:`, result);
      return result;
    } catch (error) {
      log.error(`Failed to sync product ${productId} to inventory:`, error);
      throw error;
    }
  }

  /**
   * Get products that need inventory sync
   */
  static async getProductsNeedingSync(businessId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT p.*, ic.name as category_name
        FROM products p
        LEFT JOIN inventory_categories ic ON p.category_id = ic.id
        WHERE p.business_id = $1
          AND p.is_active = true
          AND p.inventory_item_id IS NULL
          AND p.current_stock > 0  -- Only products with stock
        ORDER BY p.current_stock DESC
        LIMIT 50
      `;

      const result = await client.query(queryStr, [businessId]);
      return result.rows;
    } catch (error) {
      log.error('Failed to get products needing sync:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
