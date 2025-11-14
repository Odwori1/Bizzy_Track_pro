import express from 'express';
import { discountApprovalController } from '../controllers/discountApprovalController.js';
import { validateRequest } from '../middleware/validation.js';
import { 
  createDiscountApprovalSchema, 
  updateDiscountApprovalSchema,
  approveDiscountSchema 
} from '../schemas/discountApprovalSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Create discount approval request
router.post(
  '/', 
  requirePermission('discount:request'),
  validateRequest(createDiscountApprovalSchema),
  discountApprovalController.create
);

// Get pending approvals (for managers)
router.get(
  '/pending', 
  requirePermission('discount:approve'),
  discountApprovalController.getPending
);

// Get approval by ID
router.get(
  '/:id', 
  requirePermission('discount:read'),
  discountApprovalController.getById
);

// Update approval status (approve/reject)
router.put(
  '/:id/status', 
  requirePermission('discount:approve'),
  validateRequest(updateDiscountApprovalSchema),
  discountApprovalController.updateStatus
);

// Get approval history with filters
router.get(
  '/history/all', 
  requirePermission('discount:read'),
  discountApprovalController.getHistory
);

// Get approval statistics
router.get(
  '/stats/summary', 
  requirePermission('discount:read'),
  discountApprovalController.getStats
);

// Check if discount requires approval
router.post(
  '/check-approval', 
  requirePermission('discount:request'),
  discountApprovalController.checkApprovalRequired
);

export default router;
