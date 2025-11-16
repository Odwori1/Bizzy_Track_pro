import { JobAssignmentService } from '../services/jobAssignmentService.js';
import { log } from '../utils/logger.js';

export const jobAssignmentController = {
  async assignJobToDepartment(req, res, next) {
    try {
      const assignmentData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Assigning job to department', {
        businessId,
        userId,
        jobId: assignmentData.job_id,
        departmentId: assignmentData.department_id
      });

      const assignment = await JobAssignmentService.assignJobToDepartment(businessId, assignmentData, userId);

      res.status(201).json({
        success: true,
        message: 'Job successfully assigned to department',
        data: assignment
      });

    } catch (error) {
      log.error('Job assignment controller error', error);
      next(error);
    }
  },

  async processDepartmentHandoff(req, res, next) {
    try {
      const handoffData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Processing department handoff', {
        businessId,
        userId,
        jobId: handoffData.job_id,
        fromDepartment: handoffData.from_department_id,
        toDepartment: handoffData.to_department_id
      });

      const workflowState = await JobAssignmentService.processDepartmentHandoff(businessId, handoffData, userId);

      res.status(201).json({
        success: true,
        message: 'Department handoff processed successfully',
        data: workflowState
      });

    } catch (error) {
      log.error('Department handoff controller error', error);
      next(error);
    }
  },

  async getJobAssignments(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { jobId } = req.params;

      const assignments = await JobAssignmentService.getJobAssignments(businessId, jobId);

      res.json({
        success: true,
        data: assignments,
        message: 'Job assignments fetched successfully'
      });

    } catch (error) {
      log.error('Job assignments fetch controller error', error);
      next(error);
    }
  },

  async getDepartmentAssignments(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { departmentId } = req.params;
      const { status, priority, limit } = req.query;

      const filters = {};
      if (status) filters.status = status;
      if (priority) filters.priority = priority;
      if (limit) filters.limit = parseInt(limit);

      const assignments = await JobAssignmentService.getDepartmentAssignments(businessId, departmentId, filters);

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

  async updateJobAssignment(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating job assignment', { businessId, userId, assignmentId: id });

      const updatedAssignment = await JobAssignmentService.updateJobAssignment(businessId, id, updateData, userId);

      res.json({
        success: true,
        message: 'Job assignment updated successfully',
        data: updatedAssignment
      });

    } catch (error) {
      log.error('Job assignment update controller error', error);
      next(error);
    }
  }
};
