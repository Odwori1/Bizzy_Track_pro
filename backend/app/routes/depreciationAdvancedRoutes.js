import express from 'express';
import { depreciationAdvancedController } from '../controllers/depreciationAdvancedController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import { 
  bulkDepreciationSchema, 
  historicalDepreciationSchema, 
  overrideDepreciationSchema,
  bulkImportSchema 
} from '../schemas/advancedSchemas.js';

const router = express.Router();

// Apply authentication and RLS context to all routes
router.use(authenticate);
router.use(setRLSContext);

/**
 * @swagger
 * tags:
 *   name: Depreciation Advanced
 *   description: Advanced depreciation operations
 */

/**
 * @swagger
 * /api/depreciation/advanced/bulk-post:
 *   post:
 *     summary: Bulk post depreciation for multiple periods
 *     tags: [Depreciation Advanced]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - periods
 *             properties:
 *               periods:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - month
 *                     - year
 *                   properties:
 *                     month:
 *                       type: integer
 *                       minimum: 1
 *                       maximum: 12
 *                     year:
 *                       type: integer
 *                       minimum: 2000
 *                       maximum: 2100
 *     responses:
 *       200:
 *         description: Bulk depreciation posted successfully
 */
router.post('/bulk-post',
  requirePermission('asset:update'),
  validateRequest(bulkDepreciationSchema),
  depreciationAdvancedController.bulkPostDepreciation
);

/**
 * @swagger
 * /api/depreciation/advanced/historical:
 *   post:
 *     summary: Post historical depreciation for specific period
 *     tags: [Depreciation Advanced]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - asset_id
 *               - month
 *               - year
 *             properties:
 *               asset_id:
 *                 type: string
 *                 format: uuid
 *               month:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 12
 *               year:
 *                 type: integer
 *                 minimum: 2000
 *                 maximum: 2100
 *     responses:
 *       200:
 *         description: Historical depreciation posted successfully
 */
router.post('/historical',
  requirePermission('asset:update'),
  validateRequest(historicalDepreciationSchema),
  depreciationAdvancedController.postHistoricalDepreciation
);

/**
 * @swagger
 * /api/depreciation/advanced/override/{asset_code}:
 *   post:
 *     summary: Override depreciation for an asset
 *     tags: [Depreciation Advanced]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: asset_code
 *         required: true
 *         schema:
 *           type: string
 *         description: Asset code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - month
 *               - year
 *               - override_amount
 *               - reason
 *             properties:
 *               month:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 12
 *               year:
 *                 type: integer
 *                 minimum: 2000
 *                 maximum: 2100
 *               override_amount:
 *                 type: number
 *                 format: float
 *                 minimum: 0
 *               reason:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Depreciation override applied successfully
 */
router.post('/override/:asset_code',
  requirePermission('asset:update'),
  validateRequest(overrideDepreciationSchema),
  depreciationAdvancedController.overrideDepreciation
);

/**
 * @swagger
 * /api/depreciation/advanced/override-history/{asset_id}:
 *   get:
 *     summary: Get override history for an asset
 *     tags: [Depreciation Advanced]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: asset_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Asset ID
 *     responses:
 *       200:
 *         description: Override history fetched successfully
 */
router.get('/override-history/:asset_id',
  requirePermission('asset:read'),
  depreciationAdvancedController.getOverrideHistory
);

/**
 * @swagger
 * /api/depreciation/advanced/bulk-import:
 *   post:
 *     summary: Bulk import assets
 *     tags: [Depreciation Advanced]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assets
 *             properties:
 *               assets:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - asset_name
 *                     - category
 *                     - purchase_cost
 *                   properties:
 *                     asset_name:
 *                       type: string
 *                       maxLength: 255
 *                     asset_code:
 *                       type: string
 *                       maxLength: 50
 *                     category:
 *                       type: string
 *                       enum: [land, building, vehicle, equipment, furniture, computer, software, other, electronics]
 *                     purchase_cost:
 *                       type: number
 *                       format: float
 *                       minimum: 0
 *                     purchase_date:
 *                       type: string
 *                       format: date
 *                     useful_life_months:
 *                       type: integer
 *                       minimum: 1
 *                       maximum: 1200
 *     responses:
 *       200:
 *         description: Assets imported successfully
 */
router.post('/bulk-import',
  requirePermission('asset:create'),
  validateRequest(bulkImportSchema),
  depreciationAdvancedController.bulkImportAssets
);

/**
 * @swagger
 * /api/depreciation/advanced/export/{format}:
 *   get:
 *     summary: Export assets data
 *     tags: [Depreciation Advanced]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: format
 *         required: true
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *         description: Export format
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter
 *       - in: query
 *         name: asset_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by asset ID
 *     responses:
 *       200:
 *         description: Assets exported successfully
 */
router.get('/export/:format',
  requirePermission('asset:read'),
  depreciationAdvancedController.exportAssets
);

export default router;
