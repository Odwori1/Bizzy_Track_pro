import express from 'express';
import { depreciationBulkController } from '../controllers/depreciationBulkController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import { historicalDepreciationSchema, bulkImportSchema } from '../schemas/advancedSchemas.js';

const router = express.Router();

// Apply authentication and RLS context to all routes
router.use(authenticate);
router.use(setRLSContext);

/**
 * @swagger
 * tags:
 *   name: Depreciation Bulk
 *   description: Bulk depreciation operations
 */

/**
 * @swagger
 * /api/depreciation/bulk/bulk-post:
 *   post:
 *     summary: Bulk post depreciation for specific month/year
 *     tags: [Depreciation Bulk]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - month
 *               - year
 *             properties:
 *               month:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 12
 *               year:
 *                 type: integer
 *                 minimum: 2000
 *                 maximum: 2100
 *               asset_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Specific asset IDs to process (optional)
 *     responses:
 *       200:
 *         description: Bulk depreciation posted successfully
 */
router.post('/bulk-post',
  requirePermission('asset:update'),
  depreciationBulkController.bulkPostDepreciation
);

/**
 * @swagger
 * /api/depreciation/bulk/bulk-import:
 *   post:
 *     summary: Bulk import assets
 *     tags: [Depreciation Bulk]
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
 *                     category:
 *                       type: string
 *                       enum: [land, building, vehicle, equipment, furniture, computer, software, other, electronics]
 *                     purchase_cost:
 *                       type: number
 *                       format: float
 *                       minimum: 0
 *     responses:
 *       200:
 *         description: Assets imported successfully
 */
router.post('/bulk-import',
  requirePermission('asset:create'),
  validateRequest(bulkImportSchema),
  depreciationBulkController.bulkImportAssets
);

/**
 * @swagger
 * /api/depreciation/bulk/export:
 *   get:
 *     summary: Export depreciation data
 *     tags: [Depreciation Bulk]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
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
 *       - in: query
 *         name: department_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by department
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *     responses:
 *       200:
 *         description: Depreciation data exported successfully
 */
router.get('/export',
  requirePermission('asset:read'),
  depreciationBulkController.exportDepreciation
);

export default router;
