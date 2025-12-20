import express from 'express';
import { jobController } from '../controllers/jobController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import {
  createJobSchema,
  updateJobSchema,
  updateJobStatusSchema
} from '../schemas/jobSchemas.js';
import { getClient } from '../utils/database.js';

const router = express.Router();

// Validation middleware
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errorMessages
      });
    }

    req.body = value;
    next();
  };
};

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// GET /api/jobs - Get all jobs (requires job:read permission)
router.get('/', requirePermission('job:read'), jobController.getAll);

// GET /api/jobs/for-billing - Get jobs suitable for billing (requires job:read permission)
router.get('/for-billing', requirePermission('job:read'), async (req, res) => {
  console.log('=== /jobs/for-billing called ===');
  console.log('Full user object:', JSON.stringify(req.user, null, 2));
  
  const client = await getClient();
  
  try {
    // Try to get business ID in multiple ways
    const businessId = req.user?.business_id || req.user?.businessId;
    
    console.log('business_id from req.user:', req.user?.business_id);
    console.log('businessId from req.user:', req.user?.businessId);
    console.log('Selected businessId:', businessId);
    
    if (!businessId) {
      console.error('ERROR: No business ID found in any format');
      return res.status(400).json({
        success: false,
        error: 'Business ID not found in user context',
        debug: {
          userKeys: Object.keys(req.user || {}),
          hasBusinessId: !!req.user?.businessId,
          hasBusiness_id: !!req.user?.business_id,
          fullUser: req.user
        }
      });
    }

    console.log(`Fetching jobs for business: ${businessId}`);

    const query = `
      SELECT
        j.id,
        j.job_number,
        j.title,
        j.status,
        j.final_price,
        s.name as service_name,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name
      FROM jobs j
      JOIN services s ON j.service_id = s.id
      JOIN customers c ON j.customer_id = c.id
      WHERE j.business_id = $1
        AND j.status IN ('in-progress', 'completed', 'pending')
      ORDER BY j.created_at DESC
      LIMIT 10
    `;

    console.log('Executing query with businessId:', businessId);
    const { rows } = await client.query(query, [businessId]);

    console.log(`Found ${rows.length} jobs`);

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('❌ ERROR in /jobs/for-billing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch jobs',
      details: error.message
    });
  } finally {
    client.release();
  }
});

// GET /api/jobs/:id - Get job by ID (requires job:read permission)
router.get('/:id', requirePermission('job:read'), jobController.getById);

// POST /api/jobs - Create new job (requires job:create permission)
router.post(
  '/',
  requirePermission('job:create'),
  validateRequest(createJobSchema),
  jobController.create
);

// PUT /api/jobs/:id - Update job (requires job:update permission)
router.put(
  '/:id',
  requirePermission('job:update'),
  validateRequest(updateJobSchema),
  jobController.update
);

// PATCH /api/jobs/:id/status - Update job status (requires job:status:update permission)
router.patch(
  '/:id/status',
  requirePermission('job:status:update'),
  validateRequest(updateJobStatusSchema),
  jobController.updateStatus
);

// DELETE /api/jobs/:id - Delete job (requires job:delete permission)
router.delete('/:id', requirePermission('job:delete'), jobController.delete);

export default router;
