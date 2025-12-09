import express from 'express';
import { staffController } from '../controllers/staffController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// ========== PUBLIC ROUTES ==========
// These routes DON'T require authentication
router.post('/login', staffController.staffLogin);

// ========== PROTECTED ROUTES ==========
// Create a sub-router for protected routes
const protectedRouter = express.Router();

// Apply authentication middleware to protected routes only
protectedRouter.use(authenticate);
protectedRouter.use(setRLSContext);

// Define all protected routes
protectedRouter.post(
  '/',
  requirePermission('staff:create'),
  staffController.createStaff
);

protectedRouter.get(
  '/',
  requirePermission('staff:read'),
  staffController.getStaff
);

protectedRouter.get(
  '/roles',
  requirePermission('staff:read'),
  staffController.getStaffRoles
);

protectedRouter.get(
  '/:id',
  requirePermission('staff:read'),
  staffController.getStaffById
);

protectedRouter.put(
  '/:id',
  requirePermission('staff:update'),
  staffController.updateStaff
);

protectedRouter.delete(
  '/:id',
  requirePermission('staff:delete'),
  staffController.deleteStaff
);

protectedRouter.post(
  '/invite',
  requirePermission('staff:create'),
  staffController.inviteStaff
);

protectedRouter.post(
  '/:id/resend-invitation',
  requirePermission('staff:update'),
  staffController.resendInvitation
);

protectedRouter.post(
  '/:staffId/assign-role',
  requirePermission('staff:update'),
  staffController.assignRole
);

protectedRouter.get(
  '/:staffId/performance',
  requirePermission('staff:read'),
  staffController.getStaffPerformance
);

protectedRouter.get(
  '/dashboard/overview',
  requirePermission('staff:read'),
  staffController.getStaffDashboard
);

// Mount the protected router
router.use(protectedRouter);

export default router;
