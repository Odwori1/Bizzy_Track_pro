import express from 'express';
import { businessValuationController } from '../controllers/businessValuationController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Business valuation
router.get(
  '/',
  requirePermission('valuation:view'),
  businessValuationController.getValuation
);

export default router;
