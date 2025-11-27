import express from 'express';
import db from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

router.use(authenticate, setRLSContext);

// Lookup product by barcode
router.get('/lookup', requirePermission('pos:read'), async (req, res) => {
  try {
    const { businessId } = req.user;
    const { barcode, sku } = req.query;

    if (!barcode && !sku) {
      return res.status(400).json({
        success: false,
        message: 'Barcode or SKU is required'
      });
    }

    let query = `
      SELECT 
        p.id, p.business_id, p.name, p.description,
        p.sku, p.barcode, p.category_id,
        p.cost_price, p.selling_price, p.current_stock,
        p.min_stock_level, p.max_stock_level, p.unit_of_measure,
        p.is_active, p.has_variants, p.variant_data,
        p.image_urls, p.tags, p.created_at, p.updated_at,
        ic.name as category_name
      FROM products p
      LEFT JOIN inventory_categories ic ON p.category_id = ic.id
      WHERE p.business_id = $1 
        AND (p.barcode = $2 OR p.sku = $3)
        AND p.is_active = true
    `;

    const result = await db.query(query, [businessId, barcode, sku]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Product found successfully'
    });
  } catch (error) {
    console.error('Barcode lookup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to lookup product',
      error: error.message
    });
  }
});

// Generate barcode for product
router.post('/generate', requirePermission('products:update'), async (req, res) => {
  try {
    const { businessId } = req.user;
    const { product_id, barcode } = req.body;

    if (!product_id || !barcode) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and barcode are required'
      });
    }

    // Check if barcode is already in use
    const existing = await db.query(
      'SELECT id FROM products WHERE business_id = $1 AND barcode = $2 AND id != $3',
      [businessId, barcode, product_id]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Barcode already in use by another product'
      });
    }

    // Update product with barcode
    const result = await db.query(
      `UPDATE products 
       SET barcode = $1, updated_at = NOW()
       WHERE id = $2 AND business_id = $3
       RETURNING *`,
      [barcode, product_id, businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Barcode assigned successfully'
    });
  } catch (error) {
    console.error('Barcode generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate barcode',
      error: error.message
    });
  }
});

export default router;
