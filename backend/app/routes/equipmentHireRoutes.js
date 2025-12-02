import express from 'express';
import { equipmentHireController } from '../controllers/equipmentHireController.js';
import { createEquipmentAssetSchema, createHireBookingSchema, updateHireBookingSchema } from '../schemas/equipmentHireSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Equipment assets
router.post(
  '/equipment',
  requirePermission('equipment:create'),
  validateRequest(createEquipmentAssetSchema),
  equipmentHireController.createEquipment
);

router.get(
  '/equipment',
  requirePermission('equipment:read'),
  equipmentHireController.getAllEquipment
);

router.get(
  '/equipment/available',
  requirePermission('equipment:read'),
  equipmentHireController.getAvailableEquipment
);

// Hire bookings
router.post(
  '/bookings',
  requirePermission('equipment:hire:create'),
  validateRequest(createHireBookingSchema),
  equipmentHireController.createBooking
);

router.get(
  '/bookings',
  requirePermission('equipment:hire:read'),
  equipmentHireController.getBookings
);

router.get(
  '/bookings/:bookingId',
  requirePermission('equipment:hire:read'),
  equipmentHireController.getBookingById
);

router.put(
  '/bookings/:bookingId',
  requirePermission('equipment:hire:update'),
  validateRequest(updateHireBookingSchema),
  equipmentHireController.updateBooking
);

router.delete(
  '/bookings/:bookingId',
  requirePermission('equipment:hire:delete'),
  equipmentHireController.deleteBooking
);

// Statistics
router.get(
  '/statistics',
  requirePermission('equipment:read'),
  equipmentHireController.getStatistics
);

export default router;
