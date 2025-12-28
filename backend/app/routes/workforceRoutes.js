import express from 'express';
import { workforceController } from '../controllers/workforceController.js';
import {
  createStaffProfileSchema,
  updateStaffProfileSchema,
  createShiftTemplateSchema,
  createShiftRosterSchema,
  createClockEventSchema,
  staffQuerySchema,
  shiftQuerySchema,
  timesheetQuerySchema,
  createStaffAvailabilitySchema,
  createPerformanceMetricSchema,
  availabilityQuerySchema,
  performanceQuerySchema
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

// ADDED: GET route for shift templates
router.get(
  '/shift-templates',
  requirePermission('shifts:read'),
  workforceController.getShiftTemplates
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

// Clock Event Routes - FIXED: Added GET route
router.get(
  '/clock-events',
  requirePermission('attendance:clock_in'),
  workforceController.getClockEvents
);

router.post(
  '/clock-events',
  requirePermission('attendance:clock_in'),
  validateRequest(createClockEventSchema),
  workforceController.processClockEvent
);

// Timesheet Routes
router.get(
  '/timesheets',
  requirePermission('timesheets:read'),
  validateRequest(timesheetQuerySchema, 'query'),
  workforceController.getTimesheets
);

router.post(
  '/timesheets',
  requirePermission('timesheets:create'),
  workforceController.createTimesheet
);

router.put(
  '/timesheets/:id',
  requirePermission('timesheets:update'),
  workforceController.updateTimesheet
);

// Staff Availability Routes
router.get(
  '/availability',
  requirePermission('availability:read'),
  validateRequest(availabilityQuerySchema, 'query'),
  workforceController.getAvailability
);

router.post(
  '/availability',
  requirePermission('availability:create'),
  validateRequest(createStaffAvailabilitySchema),
  workforceController.createAvailability
);

// Performance Metrics Routes
router.get(
  '/performance',
  requirePermission('performance:read'),
  validateRequest(performanceQuerySchema, 'query'),
  workforceController.getPerformance
);

router.post(
  '/performance',
  requirePermission('performance:create'),
  validateRequest(createPerformanceMetricSchema),
  workforceController.createPerformance
);

// Payroll Routes
router.get(
  '/payroll-exports',
  requirePermission('payroll:read'),
  workforceController.getPayrollExports
);

export default router;
