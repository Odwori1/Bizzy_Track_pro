import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

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
        
        // Check if SKU exists
        const skuCheck = await client.query(
          'SELECT id FROM products WHERE business_id = $1 AND sku = $2',
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
   * Create a new product
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

      // ⭐ ENHANCED SKU LOGIC: Auto-generate if not provided ⭐
      let finalSKU = productData.sku;
      if (!finalSKU || finalSKU.trim() === '') {
        finalSKU = await this.generateUniqueSKU(businessId, productData.name);
        log.info('Auto-generated SKU', { productName: productData.name, generatedSKU: finalSKU });
      }

      // Check for duplicate SKU (even if auto-generated, ensure uniqueness)
      const skuCheck = await client.query(
        'SELECT id FROM products WHERE business_id = $1 AND sku = $2',
        [businessId, finalSKU]
      );

      if (skuCheck.rows.length > 0) {
        throw new Error('SKU already exists');
      }

      // Insert product
      const result = await client.query(
        `INSERT INTO products (
          business_id, name, description, sku, barcode, category_id,
          cost_price, selling_price, current_stock, min_stock_level,
          max_stock_level, unit_of_measure, is_active, has_variants,
          variant_data, image_urls, tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          businessId,
          productData.name,
          productData.description || '',
          finalSKU, // Use the final SKU (either provided or auto-generated)
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
          productData.tags || []
        ]
      );

      const product = result.rows[0];

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
          selling_price: product.selling_price
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
   * Get all products with optional filters
   */
  static async getProducts(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT
          p.*,
          ic.name as category_name,
          CASE
            WHEN p.current_stock <= p.min_stock_level AND p.min_stock_level > 0 THEN 'low'
            WHEN p.current_stock = 0 THEN 'out_of_stock'
            ELSE 'adequate'
          END as stock_status,
          COUNT(pv.id) as variant_count
        FROM products p
        LEFT JOIN inventory_categories ic ON p.category_id = ic.id
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

      queryStr += ' GROUP BY p.id, ic.name ORDER BY p.name';

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
        businessId
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
   * Get product by ID
   */
  static async getProductById(businessId, productId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT
          p.*,
          ic.name as category_name,
          CASE
            WHEN p.current_stock <= p.min_stock_level AND p.min_stock_level > 0 THEN 'low'
            WHEN p.current_stock = 0 THEN 'out_of_stock'
            ELSE 'adequate'
          END as stock_status
        FROM products p
        LEFT JOIN inventory_categories ic ON p.category_id = ic.id
        WHERE p.business_id = $1 AND p.id = $2
      `;

      log.info('🗄️ Database Query - getProductById:', { query: queryStr, params: [businessId, productId] });

      const result = await client.query(queryStr, [businessId, productId]);

      if (result.rows.length === 0) {
        throw new Error('Product not found or access denied');
      }

      log.info('✅ Product query successful', {
        productId,
        businessId
      });

      return result.rows[0];
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
   * Update product
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

      // Check for duplicate SKU if SKU is being updated
      if (updateData.sku && updateData.sku !== currentProduct.rows[0].sku) {
        const skuCheck = await client.query(
          'SELECT id FROM products WHERE business_id = $1 AND sku = $2 AND id != $3',
          [businessId, updateData.sku, productId]
        );

        if (skuCheck.rows.length > 0) {
          throw new Error('SKU already exists');
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

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'product.updated',
        resourceType: 'product',
        resourceId: productId,
        oldValues: currentProduct.rows[0],
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
   * Get product statistics
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
          SUM(current_stock * selling_price) as total_potential_revenue
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
}
