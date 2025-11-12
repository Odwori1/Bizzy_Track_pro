import express from 'express';
import { discountRuleController } from '../controllers/discountRuleController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { createDiscountRuleSchema } from '../schemas/discountRuleSchemas.js';

const router = express.Router();

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.details.map(detail => detail.message)
      });
    }
    req.body = value;
    next();
  };
};

router.use(authenticate, setRLSContext);

router.get('/', requirePermission('service:read'), discountRuleController.getAll);
router.post('/', requirePermission('service:create'), validateRequest(createDiscountRuleSchema), discountRuleController.create);
router.get('/calculate', requirePermission('service:read'), discountRuleController.calculate);

export default router;
