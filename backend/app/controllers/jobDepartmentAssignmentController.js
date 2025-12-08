import { JobDepartmentAssignmentService } from '../services/jobDepartmentAssignmentService.js';
import { log } from '../utils/logger.js';

export const jobDepartmentAssignmentController = {
  async createAssignment(req, res, next) {
    try {
      const assignmentData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating job department assignment', {
        businessId,
        userId,
        jobId: assignmentData.job_id,
        departmentId: assignmentData.department_id
      });

      const newAssignment = await JobDepartmentAssignmentService.createAssignment(
        businessId, 
        assignmentData, 
        userId
      );

      res.status(201).json({
        success: true,
        message: 'Department assignment created successfully',
        data: newAssignment
      });

    } catch (error) {
      log.error('Assignment creation controller error', error);
      next(error);
    }
  },

  async getAssignments(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      const assignments = await JobDepartmentAssignmentService.getAssignments(businessId, filters);

      res.json({
        success: true,
        data: assignments,
        count: assignments.length,
        message: 'Assignments fetched successfully'
      });

    } catch (error) {
      log.error('Assignments fetch controller error', error);
      next(error);
    }
  },

  async getAssignmentsByJob(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { jobId } = req.params;

      const assignments = await JobDepartmentAssignmentService.getAssignmentsByJob(
        businessId, 
        jobId
      );

      res.json({
        success: true,
        data: assignments,
        message: 'Job department assignments fetched successfully'
      });

    } catch (error) {
      log.error('Job assignments fetch controller error', error);
      next(error);
    }
  },

  async getAssignmentsByDepartment(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { departmentId } = req.params;
      const { status, date_from, date_to } = req.query;

      const filters = {};
      if (status) filters.status = status;
      if (date_from) filters.date_from = date_from;
      if (date_to) filters.date_to = date_to;

      const assignments = await JobDepartmentAssignmentService.getAssignmentsByDepartment(
        businessId, 
        departmentId,
        filters
      );

      res.json({
        success: true,
        data: assignments,
        message: 'Department assignments fetched successfully'
      });

    } catch (error) {
      log.error('Department assignments fetch controller error', error);
      next(error);
    }
  },

  async getAssignmentById(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { id } = req.params;

      const assignment = await JobDepartmentAssignmentService.getAssignmentById(businessId, id);

      res.json({
        success: true,
        data: assignment,
        message: 'Assignment fetched successfully'
      });

    } catch (error) {
      log.error('Assignment fetch by ID controller error', error);
      next(error);
    }
  },

  async updateAssignment(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating department assignment', { businessId, userId, assignmentId: id });

      const updatedAssignment = await JobDepartmentAssignmentService.updateAssignment(
        businessId, 
        id, 
        updateData, 
        userId
      );

      res.json({
        success: true,
        message: 'Assignment updated successfully',
        data: updatedAssignment
      });

    } catch (error) {
      log.error('Assignment update controller error', error);
      next(error);
    }
  },

  async deleteAssignment(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Deleting department assignment', { businessId, userId, assignmentId: id });

      await JobDepartmentAssignmentService.deleteAssignment(businessId, id, userId);

      res.json({
        success: true,
        message: 'Assignment deleted successfully'
      });

    } catch (error) {
      log.error('Assignment deletion controller error', error);
      next(error);
    }
  },

  // Hospital-style master ticket endpoints
  async createMasterTicket(req, res, next) {
    try {
      const masterTicketData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating master ticket', {
        businessId,
        userId,
        customerId: masterTicketData.customer_id
      });

      const masterTicket = await JobDepartmentAssignmentService.createMasterTicket(
        businessId,
        masterTicketData,
        userId
      );

      res.status(201).json({
        success: true,
        message: 'Master ticket created successfully',
        data: masterTicket
      });

    } catch (error) {
      log.error('Master ticket creation controller error', error);
      next(error);
    }
  },

  async getMasterTickets(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      const masterTickets = await JobDepartmentAssignmentService.getMasterTickets(businessId, filters);

      res.json({
        success: true,
        data: masterTickets,
        count: masterTickets.length,
        message: 'Master tickets fetched successfully'
      });

    } catch (error) {
      log.error('Master tickets fetch controller error', error);
      next(error);
    }
  },

  async getMasterTicketByNumber(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { ticketNumber } = req.params;

      const masterTicket = await JobDepartmentAssignmentService.getMasterTicketByNumber(
        businessId,
        ticketNumber
      );

      res.json({
        success: true,
        data: masterTicket,
        message: 'Master ticket fetched successfully'
      });

    } catch (error) {
      log.error('Master ticket fetch controller error', error);
      next(error);
    }
  }
};
