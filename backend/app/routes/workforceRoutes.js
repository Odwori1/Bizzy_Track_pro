import express from 'express';
import { workforceController } from '../controllers/workforceController.js';
import {
  createStaffProfileSchema,
  updateStaffProfileSchema,
  createShiftTemplateSchema,
  createShiftRosterSchema,
  createClockEventSchema,
  staffQuerySchema,
  shiftQuerySchema
} from '../schemas/workforceSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Staff Profile Routes
router.post(
  '/staff-profiles',
  requirePermission('staff_profiles:create'),
  validateRequest(createStaffProfileSchema),
  workforceController.createStaffProfile
);

router.get(
  '/staff-profiles',
  requirePermission('staff_profiles:read'),
  validateRequest(staffQuerySchema, 'query'),
  workforceController.getStaffProfiles
);

router.get(
  '/staff-profiles/:id',
  requirePermission('staff_profiles:read'),
  workforceController.getStaffProfileById
);

router.put(
  '/staff-profiles/:id',
  requirePermission('staff_profiles:update'),
  validateRequest(updateStaffProfileSchema),
  workforceController.updateStaffProfile
);

// Shift Template Routes
router.post(
  '/shift-templates',
  requirePermission('shifts:create'),
  validateRequest(createShiftTemplateSchema),
  workforceController.createShiftTemplate
);

// Shift Roster Routes
router.post(
  '/shift-rosters',
  requirePermission('shifts:assign'),
  validateRequest(createShiftRosterSchema),
  workforceController.createShiftRoster
);

router.get(
  '/shifts',
  requirePermission('shifts:read'),
  validateRequest(shiftQuerySchema, 'query'),
  workforceController.getShifts
);

// Clock Event Routes
router.post(
  '/clock-events',
  requirePermission('attendance:clock_in'), // Can use either clock_in or clock_out permission
  validateRequest(createClockEventSchema),
  workforceController.processClockEvent
);

export default router;
