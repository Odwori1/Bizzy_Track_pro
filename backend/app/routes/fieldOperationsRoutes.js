import { Router } from 'express';
import { FieldOperationsController } from '../controllers/fieldOperationsController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Checklist Templates routes
router.post(
  '/checklist-templates',
  requirePermission('field_ops:manage'),
  FieldOperationsController.createChecklistTemplate
);

router.get(
  '/checklist-templates',
  requirePermission('field_ops:view'),
  FieldOperationsController.getChecklistTemplates
);

// Job Assignment routes
router.post(
  '/job-assignments',
  requirePermission('field_ops:manage'),
  FieldOperationsController.assignJobToStaff
);

router.get(
  '/job-assignments',
  requirePermission('field_ops:view'),
  FieldOperationsController.getFieldJobAssignments
);

router.put(
  '/job-assignments/:assignmentId/status',
  requirePermission('field_ops:manage'),
  FieldOperationsController.updateAssignmentStatus
);

// Location Tracking routes
router.post(
  '/location-tracking',
  requirePermission('location:track'),
  FieldOperationsController.recordLocation
);

// Digital Signature routes
router.post(
  '/digital-signatures',
  requirePermission('digital_signatures:capture'),
  FieldOperationsController.recordDigitalSignature
);

export default router;
