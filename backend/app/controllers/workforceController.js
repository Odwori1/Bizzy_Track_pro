import { WorkforceService } from '../services/workforceService.js';
import { log } from '../utils/logger.js';

export const workforceController = {
  async createStaffProfile(req, res, next) {
    try {
      const staffData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating staff profile', {
        businessId,
        userId,
        employeeId: staffData.employee_id
      });

      const newStaffProfile = await WorkforceService.createStaffProfile(businessId, staffData, userId);

      res.status(201).json({
        success: true,
        message: 'Staff profile created successfully',
        data: newStaffProfile
      });

    } catch (error) {
      log.error('Staff profile creation controller error', error);
      next(error);
    }
  },

  async getStaffProfiles(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const {
        department_id,
        employment_type,
        is_active,
        page,
        limit
      } = req.query;

      const filters = {};
      if (department_id) filters.department_id = department_id;
      if (employment_type) filters.employment_type = employment_type;
      if (is_active !== undefined) filters.is_active = is_active === 'true';
      if (page) filters.page = parseInt(page);
      if (limit) filters.limit = parseInt(limit);

      const staffProfiles = await WorkforceService.getStaffProfiles(businessId, filters);

      res.json({
        success: true,
        data: staffProfiles,
        count: staffProfiles.length,
        message: 'Staff profiles fetched successfully'
      });

    } catch (error) {
      log.error('Staff profiles fetch controller error', error);
      next(error);
    }
  },

  async getStaffProfileById(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { id } = req.params;

      const staffProfile = await WorkforceService.getStaffProfileById(businessId, id);

      res.json({
        success: true,
        data: staffProfile,
        message: 'Staff profile fetched successfully'
      });

    } catch (error) {
      log.error('Staff profile fetch by ID controller error', error);
      next(error);
    }
  },

  async updateStaffProfile(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating staff profile', { businessId, userId, staffProfileId: id });

      const updatedProfile = await WorkforceService.updateStaffProfile(businessId, id, updateData, userId);

      res.json({
        success: true,
        message: 'Staff profile updated successfully',
        data: updatedProfile
      });

    } catch (error) {
      log.error('Staff profile update controller error', error);
      next(error);
    }
  },

  async createShiftTemplate(req, res, next) {
    try {
      const templateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating shift template', {
        businessId,
        userId,
        templateName: templateData.name
      });

      const newTemplate = await WorkforceService.createShiftTemplate(businessId, templateData, userId);

      res.status(201).json({
        success: true,
        message: 'Shift template created successfully',
        data: newTemplate
      });

    } catch (error) {
      log.error('Shift template creation controller error', error);
      next(error);
    }
  },

  async createShiftRoster(req, res, next) {
    try {
      const rosterData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating shift roster', {
        businessId,
        userId,
        staffProfileId: rosterData.staff_profile_id,
        shiftDate: rosterData.shift_date
      });

      const newRoster = await WorkforceService.createShiftRoster(businessId, rosterData, userId);

      res.status(201).json({
        success: true,
        message: 'Shift roster created successfully',
        data: newRoster
      });

    } catch (error) {
      log.error('Shift roster creation controller error', error);
      next(error);
    }
  },

  async processClockEvent(req, res, next) {
    try {
      const clockData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Processing clock event', {
        businessId,
        userId,
        staffProfileId: clockData.staff_profile_id,
        eventType: clockData.event_type
      });

      const result = await WorkforceService.processClockEvent(businessId, clockData, userId);

      res.json({
        success: true,
        message: result.message,
        data: { clock_event_id: result.clock_event_id }
      });

    } catch (error) {
      log.error('Clock event processing controller error', error);
      next(error);
    }
  },

  async getShifts(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const {
        start_date,
        end_date,
        department_id,
        staff_profile_id,
        shift_status
      } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          message: 'start_date and end_date are required'
        });
      }

      const filters = {
        start_date,
        end_date
      };

      if (department_id) filters.department_id = department_id;
      if (staff_profile_id) filters.staff_profile_id = staff_profile_id;
      if (shift_status) filters.shift_status = shift_status;

      const shifts = await WorkforceService.getShifts(businessId, filters);

      res.json({
        success: true,
        data: shifts,
        count: shifts.length,
        message: 'Shifts fetched successfully'
      });

    } catch (error) {
      log.error('Shifts fetch controller error', error);
      next(error);
    }
  }
};
