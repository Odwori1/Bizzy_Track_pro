import express from 'express';
import { assetSearchController } from '../controllers/assetSearchController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import { searchAssetsSchema } from '../schemas/advancedSchemas.js';

const router = express.Router();

// Apply authentication and RLS context
router.use(authenticate);
router.use(setRLSContext);

/**
 * @swagger
 * tags:
 *   name: Asset Search
 *   description: Advanced asset search and filtering
 */

/**
 * @swagger
 * /api/assets/search:
 *   get:
 *     summary: Advanced asset search with filters
 *     tags: [Asset Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search_text
 *         schema:
 *           type: string
 *         description: Text to search in asset code, name, serial, model, manufacturer, location
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [land, building, vehicle, equipment, furniture, computer, software, other, electronics]
 *         description: Filter by category
 *       - in: query
 *         name: min_value
 *         schema:
 *           type: number
 *           format: float
 *         description: Minimum current book value
 *       - in: query
 *         name: max_value
 *         schema:
 *           type: number
 *           format: float
 *         description: Maximum current book value
 *       - in: query
 *         name: department_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by department
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, disposed, sold, scrapped, under_maintenance, idle]
 *         description: Filter by status
 *       - in: query
 *         name: depreciation_method
 *         schema:
 *           type: string
 *           enum: [straight_line, declining_balance]
 *         description: Filter by depreciation method
 *       - in: query
 *         name: acquisition_method
 *         schema:
 *           type: string
 *           enum: [purchase, existing, transfer, donation, construction, exchange]
 *         description: Filter by acquisition method
 *       - in: query
 *         name: is_existing_asset
 *         schema:
 *           type: boolean
 *         description: Filter by existing assets
 *       - in: query
 *         name: condition_status
 *         schema:
 *           type: string
 *           enum: [excellent, good, fair, poor, broken]
 *         description: Filter by condition
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: purchase_date_from
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by purchase date from
 *       - in: query
 *         name: purchase_date_to
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by purchase date to
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [asset_code, asset_name, purchase_date, purchase_cost, current_book_value, created_at]
 *         description: Field to sort by
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 50
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of results to skip
 *     responses:
 *       200:
 *         description: Assets found successfully
 */
router.get('/',
  requirePermission('asset:read'),
  validateRequest(searchAssetsSchema, 'query'),
  assetSearchController.searchAssets
);

/**
 * @swagger
 * /api/assets/search/options:
 *   get:
 *     summary: Get search options and filters
 *     tags: [Asset Search]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Search options fetched successfully
 */
router.get('/options',
  requirePermission('asset:read'),
  assetSearchController.getSearchOptions
);

/**
 * @swagger
 * /api/assets/search/quick:
 *   get:
 *     summary: Quick search for autocomplete
 *     tags: [Asset Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Search query (minimum 2 characters)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: Quick search completed
 */
router.get('/quick',
  requirePermission('asset:read'),
  assetSearchController.quickSearch
);

export default router;
