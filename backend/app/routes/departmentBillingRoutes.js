import express from 'express';
import { departmentBillingController } from '../controllers/departmentBillingController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Department Billing Routes
router.get(
  '/',
  requirePermission('department_billing:read'),
  departmentBillingController.getDepartmentBilling
);

router.get(
  '/consolidated',
  requirePermission('department_billing:read'),
  departmentBillingController.getConsolidatedBilling
);

router.get(
  '/department/:departmentId',
  requirePermission('department_billing:read'),
  departmentBillingController.getBillingByDepartment
);

router.post(
  '/generate-bill',
  requirePermission('department_billing:create'),
  departmentBillingController.generateConsolidatedBill
);

router.post(
  '/allocate-charge',
  requirePermission('department_billing:create'),
  departmentBillingController.allocateDepartmentCharge
);

router.post(
  '/allocate-to-invoice',
  requirePermission('department_billing:update'),
  departmentBillingController.allocateChargeToInvoice
);

export default router;
