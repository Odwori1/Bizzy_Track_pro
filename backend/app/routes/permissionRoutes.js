import express from 'express';
import { permissionController } from '../controllers/permissionController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(setRLSContext);

// ========== CATEGORY ROUTES ==========
router.get('/categories', permissionController.getCategories);

router.get('/categories/:category/permissions', permissionController.getPermissionsByCategory);

// ========== ROLE PERMISSIONS (RBAC) ==========
router.get('/roles', permissionController.getBusinessRoles);

router.get('/role/:roleId', permissionController.getRolePermissions);

router.put('/role/:roleId', permissionController.updateRolePermissions);

// ========== USER PERMISSIONS (RBAC + ABAC) ==========
router.get('/user/:userId', permissionController.getUserPermissions);

router.post('/user/:userId', permissionController.addUserPermissionOverride);

router.delete('/user/:userId/:permissionId', permissionController.removeUserPermissionOverride);

// ========== PERMISSION EVALUATION ==========
router.post('/evaluate/user/:userId/permission/:permissionName', permissionController.evaluatePermission);

// ========== AUDIT LOG ==========
router.get('/audit', permissionController.getPermissionAuditLog);

// ========== ALL PERMISSIONS ==========
router.get('/all', permissionController.getAllPermissions);

export default router;
