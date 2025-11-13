import express from 'express';
import { userFeatureToggleController } from '../controllers/userFeatureToggleController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { 
  createUserFeatureToggleSchema, 
  updateUserFeatureToggleSchema 
} from '../schemas/userFeatureToggleSchemas.js';

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

// GET /api/user-feature-toggles/:userId - Get user feature toggles (requires permission management)
router.get('/:userId', requirePermission('permission:manage'), userFeatureToggleController.getByUser);

// POST /api/user-feature-toggles - Create user feature toggle (requires permission management)
router.post(
  '/',
  requirePermission('permission:manage'),
  validateRequest(createUserFeatureToggleSchema),
  userFeatureToggleController.create
);

// PUT /api/user-feature-toggles/:id - Update user feature toggle (requires permission management)
router.put(
  '/:id',
  requirePermission('permission:manage'),
  validateRequest(updateUserFeatureToggleSchema),
  userFeatureToggleController.update
);

// DELETE /api/user-feature-toggles/:id - Delete user feature toggle (requires permission management)
router.delete('/:id', requirePermission('permission:manage'), userFeatureToggleController.delete);

// GET /api/user-feature-toggles/:userId/check/:permissionName - Check permission with context
router.post('/:userId/check/:permissionName', userFeatureToggleController.checkPermissionWithContext);

export default router;
