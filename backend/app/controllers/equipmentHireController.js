import { EquipmentHireService } from '../services/equipmentHireService.js';
import { log } from '../utils/logger.js';

export const equipmentHireController = {
  async createEquipment(req, res, next) {
    try {
      const equipmentData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      const newEquipment = await EquipmentHireService.createEquipmentAsset(businessId, equipmentData, userId);

      res.status(201).json({
        success: true,
        message: 'Equipment asset created successfully',
        data: newEquipment
      });

    } catch (error) {
      log.error('Equipment asset creation controller error', error);
      next(error);
    }
  },

  async createBooking(req, res, next) {
    try {
      const bookingData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      const newBooking = await EquipmentHireService.createHireBooking(businessId, bookingData, userId);

      res.status(201).json({
        success: true,
        message: 'Hire booking created successfully',
        data: newBooking
      });

    } catch (error) {
      log.error('Hire booking creation controller error', error);
      next(error);
    }
  },

  async getBookingById(req, res, next) {
    try {
      const { bookingId } = req.params;
      const businessId = req.user.businessId;

      const booking = await EquipmentHireService.getHireBookingById(businessId, bookingId);

      res.json({
        success: true,
        data: booking,
        message: 'Hire booking fetched successfully'
      });

    } catch (error) {
      log.error('Hire booking fetch by ID controller error', error);
      next(error);
    }
  },

  async updateBooking(req, res, next) {
    try {
      const { bookingId } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      const updatedBooking = await EquipmentHireService.updateHireBooking(businessId, bookingId, updateData, userId);

      res.json({
        success: true,
        message: 'Hire booking updated successfully',
        data: updatedBooking
      });

    } catch (error) {
      log.error('Hire booking update controller error', error);
      next(error);
    }
  },

  async deleteBooking(req, res, next) {
    try {
      const { bookingId } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      const result = await EquipmentHireService.deleteHireBooking(businessId, bookingId, userId);

      res.json({
        success: true,
        message: 'Hire booking deleted successfully',
        data: result
      });

    } catch (error) {
      log.error('Hire booking deletion controller error', error);
      next(error);
    }
  },

  async getAvailableEquipment(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const equipment = await EquipmentHireService.getAvailableEquipment(businessId);

      res.json({
        success: true,
        data: equipment,
        count: equipment.length,
        message: 'Available equipment fetched successfully'
      });

    } catch (error) {
      log.error('Available equipment fetch controller error', error);
      next(error);
    }
  },

  async getBookings(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { status } = req.query;

      const bookings = await EquipmentHireService.getHireBookings(businessId, status);

      res.json({
        success: true,
        data: bookings,
        count: bookings.length,
        message: 'Hire bookings fetched successfully'
      });

    } catch (error) {
      log.error('Hire bookings fetch controller error', error);
      next(error);
    }
  },

  async getStatistics(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const statistics = await EquipmentHireService.getHireStatistics(businessId);

      res.json({
        success: true,
        data: statistics,
        message: 'Hire statistics fetched successfully'
      });

    } catch (error) {
      log.error('Hire statistics fetch controller error', error);
      next(error);
    }
  }
};
