import express from 'express';
import db from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

router.use(authenticate, setRLSContext);

// Get all product categories (using inventory_categories table)
router.get('/', requirePermission('products:read'), async (req, res) => {
  try {
    const { businessId } = req.user;
    
    const result = await db.query(
      `SELECT 
        id, business_id, name, description, 
        category_type, is_active,
        created_at, updated_at
       FROM inventory_categories 
       WHERE business_id = $1 
       AND category_type = 'sale'
       ORDER BY name`,
      [businessId]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rowCount,
      message: 'Categories fetched successfully'
    });
  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
});

// Create new category
router.post('/', requirePermission('products:create'), async (req, res) => {
  try {
    const { businessId } = req.user;
    const { name, description, is_active = true } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
    }

    const result = await db.query(
      `INSERT INTO inventory_categories 
       (business_id, name, description, is_active, category_type)
       VALUES ($1, $2, $3, $4, 'sale')
       RETURNING *`,
      [businessId, name, description, is_active]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Category created successfully'
    });
  } catch (error) {
    console.error('Category creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category',
      error: error.message
    });
  }
});

export default router;
