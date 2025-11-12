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
