// COMPLETE FIX for backend/app/routes/unifiedEmployeeRoutes.js
// 
// THE RULE: ALL specific routes (without :id) must come BEFORE the generic /:id route
// Express matches routes top-to-bottom, first match wins

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import { UnifiedEmployeeController } from '../controllers/unifiedEmployeeController.js';
import Joi from 'joi';

// [Keep all your validation schemas - lines 11-62 unchanged]
const createEmployeeSchema = Joi.object({
  email: Joi.string().email().required(),
  full_name: Joi.string().min(2).max(100).required(),
  role: Joi.string().valid('owner', 'manager', 'supervisor', 'staff').default('staff'),
  department_id: Joi.string().uuid().optional(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  is_active: Joi.boolean().default(true),
  job_title: Joi.string().max(100).optional(),
  base_wage_rate: Joi.number().min(0).optional(),
  employment_type: Joi.string().valid('full_time', 'part_time', 'contract', 'temporary').optional()
});

const updateEmployeeSchema = Joi.object({
  email: Joi.string().email().optional(),
  full_name: Joi.string().min(2).max(100).optional(),
  role: Joi.string().valid('owner', 'manager', 'supervisor', 'staff').optional(),
  department_id: Joi.string().uuid().optional(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  is_active: Joi.boolean().optional(),
  job_title: Joi.string().max(100).optional(),
  base_wage_rate: Joi.number().min(0).optional(),
  employment_type: Joi.string().valid('full_time', 'part_time', 'contract', 'temporary').optional()
});

const clockInSchema = Joi.object({
  shift_roster_id: Joi.string().uuid().optional(),
  gps_latitude: Joi.number().min(-90).max(90).optional(),
  gps_longitude: Joi.number().min(-180).max(180).optional()
});

const clockOutSchema = Joi.object({
  gps_latitude: Joi.number().min(-90).max(90).optional(),
  gps_longitude: Joi.number().min(-180).max(180).optional()
});

const employeeQuerySchema = Joi.object({
  department_id: Joi.string().uuid().optional(),
  role: Joi.string().valid('owner', 'manager', 'supervisor', 'staff').optional(),
  status: Joi.string().valid('active', 'inactive').optional(),
  search: Joi.string().optional()
});

const clockEventsQuerySchema = Joi.object({
  employee_id: Joi.string()
    .pattern(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|EMP\d+)$/i)
    .optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(1000).default(50),
  offset: Joi.number().integer().min(0).default(0)
});

const breakSchema = Joi.object({
  notes: Joi.string().max(500).optional()
});

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// =============================================================================
// ✅ SECTION 1: COLLECTION ROUTES (no :id parameter)
// These MUST come before any /:id routes
// =============================================================================

// Get all employees
router.get(
  '/',
  requirePermission('staff_profiles:read'),
  validateRequest(employeeQuerySchema, 'query'),
  UnifiedEmployeeController.getEmployees
);

// Create new employee
router.post(
  '/',
  requirePermission('staff_profiles:create'),
  validateRequest(createEmployeeSchema),
  UnifiedEmployeeController.createEmployee
);

// Get ALL clock events (for all employees)
// ⚠️ CRITICAL: This must come BEFORE /:id route
router.get('/clock-events',
  (req, res, next) => {
    console.log('🟢 ROUTE HIT: /clock-events (ALL employees)');
    console.log('Query params:', req.query);
    next();
  },
  requirePermission('attendance:read'),
  validateRequest(clockEventsQuerySchema, 'query'),
  UnifiedEmployeeController.getClockEvents
);

// =============================================================================
// ✅ SECTION 2: SPECIFIC EMPLOYEE ROUTES (with :id parameter)
// These come AFTER all parameterless routes
// =============================================================================

// Get employee by ID
router.get(
  '/:id',
  requirePermission('staff_profiles:read'),
  UnifiedEmployeeController.getEmployeeById
);

// Update employee
router.put(
  '/:id',
  requirePermission('staff_profiles:update'),
  validateRequest(updateEmployeeSchema),
  UnifiedEmployeeController.updateEmployee
);

// Delete employee
router.delete(
  '/:id',
  requirePermission('staff_profiles:delete'),
  UnifiedEmployeeController.deleteEmployee
);

// Get workforce data for specific employee
router.get(
  '/:id/workforce',
  requirePermission('staff_profiles:read'),
  UnifiedEmployeeController.getWorkforceData
);

// Clock in
router.post(
  '/:id/clock-in',
  requirePermission('attendance:clock_in'),
  validateRequest(clockInSchema),
  UnifiedEmployeeController.clockIn
);

// Clock out
router.post(
  '/:id/clock-out',
  requirePermission('attendance:clock_out'),
  validateRequest(clockOutSchema),
  UnifiedEmployeeController.clockOut
);

// Get clock events for SPECIFIC employee
router.get('/:id/clock-events',
  (req, res, next) => {
    console.log('🔵 ROUTE HIT: /:id/clock-events (SPECIFIC employee)');
    console.log('Employee ID:', req.params.id);
    next();
  },
  requirePermission('attendance:read'),
  validateRequest(clockEventsQuerySchema, 'query'),
  UnifiedEmployeeController.getEmployeeClockEvents
);

// Start break
router.post(
  '/:id/break-start',
  requirePermission('attendance:clock_in'),
  validateRequest(breakSchema),
  UnifiedEmployeeController.startBreak
);

// End break
router.post(
  '/:id/break-end',
  requirePermission('attendance:clock_in'),
  validateRequest(breakSchema),
  UnifiedEmployeeController.endBreak
);

export default router;

// =============================================================================
// ROUTE ORDER EXPLANATION
// =============================================================================
/*
Express matches routes in ORDER from top to bottom.

❌ WRONG ORDER (Your current setup):
1. GET /                           ✓ Works
2. POST /                          ✓ Works
3. GET /:id                        ✓ Works BUT catches "clock-events"!
4. PUT /:id                        ✓ Works
5. DELETE /:id                     ✓ Works
6. GET /:id/workforce              ✓ Works
7. POST /:id/clock-in              ✓ Works
8. POST /:id/clock-out             ✓ Works
9. GET /clock-events               ✗ NEVER REACHED (/:id already matched)
10. GET /:id/clock-events          ✓ Works

When you request /api/employees/clock-events:
- Express checks route #3: GET /:id
- :id matches "clock-events" ✓
- Route #3 is used, calls getEmployeeById("clock-events")
- Returns "Employee not found"
- Route #9 is NEVER checked

✅ CORRECT ORDER (This fix):
1. GET /                           ✓ Works
2. POST /                          ✓ Works  
3. GET /clock-events               ✓ Works - catches it first!
4. GET /:id                        ✓ Works with actual IDs
5. PUT /:id                        ✓ Works
6. DELETE /:id                     ✓ Works
7. GET /:id/workforce              ✓ Works
8. POST /:id/clock-in              ✓ Works
9. POST /:id/clock-out             ✓ Works
10. GET /:id/clock-events          ✓ Works

Now when you request /api/employees/clock-events:
- Express checks route #3: GET /clock-events
- Exact match ✓
- Route #3 is used, calls getClockEvents()
- Returns all clock events ✓

RULE: Always put specific literal routes BEFORE parameterized routes.
*/
