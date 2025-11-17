import { Router } from 'express';
import { BranchController } from '../controllers/branchController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import { 
  createBranchSchema, 
  updateBranchSchema, 
  createBranchPermissionSetSchema, 
  createCrossBranchAccessSchema, 
  assignUserToBranchSchema 
} from '../schemas/branchSchemas.js';

const router = Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Branch management routes
router.post(
  '/branches',
  requirePermission('branches:manage'),
  validateRequest(createBranchSchema),
  BranchController.createBranch
);

router.get(
  '/branches',
  requirePermission('branches:view'),
  BranchController.getBranches
);

router.get(
  '/branches/:branchId',
  requirePermission('branches:view'),
  BranchController.getBranch
);

router.put(
  '/branches/:branchId',
  requirePermission('branches:manage'),
  validateRequest(updateBranchSchema),
  BranchController.updateBranch
);

// Branch permission management
router.post(
  '/branches/permission-sets',
  requirePermission('location_security:manage'),
  validateRequest(createBranchPermissionSetSchema),
  BranchController.createBranchPermissionSet
);

// User branch assignments
router.post(
  '/branches/assignments',
  requirePermission('branches:assign'),
  validateRequest(assignUserToBranchSchema),
  BranchController.assignUserToBranch
);

router.get(
  '/branches/assignments/:userId',
  requirePermission('branches:view'),
  BranchController.getUserBranchAssignments
);

// Cross-branch access
router.post(
  '/branches/cross-branch-access',
  requirePermission('cross_branch:manage'),
  validateRequest(createCrossBranchAccessSchema),
  BranchController.createCrossBranchAccess
);

export default router;
