// backend/app/controllers/departmentWorkflowController.js
import { DepartmentWorkflowService } from '../services/departmentWorkflowService.js';
import { log } from '../utils/logger.js';

export const departmentWorkflowController = {
  async createHandoff(req, res, next) {
    try {
      const handoffData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating department handoff', {
        businessId,
        userId,
        jobId: handoffData.job_id,
        fromDept: handoffData.from_department_id,
        toDept: handoffData.to_department_id
      });

      const handoff = await DepartmentWorkflowService.createHandoff(
        businessId,
        handoffData,
        userId
      );

      res.status(201).json({
        success: true,
        message: 'Department handoff created successfully',
        data: handoff
      });

    } catch (error) {
      log.error('Department handoff creation controller error', error);
      next(error);
    }
  },

  async acceptHandoff(req, res, next) {
    try {
      const { id } = req.params;
      const { assigned_to } = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Accepting department handoff', {
        businessId,
        userId,
        handoffId: id
      });

      const result = await DepartmentWorkflowService.acceptHandoff(
        businessId,
        id,
        assigned_to,
        userId
      );

      res.json({
        success: true,
        message: 'Department handoff accepted successfully',
        data: result
      });

    } catch (error) {
      log.error('Department handoff acceptance controller error', error);
      next(error);
    }
  },

  async rejectHandoff(req, res, next) {
    try {
      const { id } = req.params;
      const { rejection_reason } = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Rejecting department handoff', {
        businessId,
        userId,
        handoffId: id
      });

      const handoff = await DepartmentWorkflowService.rejectHandoff(
        businessId,
        id,
        rejection_reason,
        userId
      );

      res.json({
        success: true,
        message: 'Department handoff rejected successfully',
        data: handoff
      });

    } catch (error) {
      log.error('Department handoff rejection controller error', error);
      next(error);
    }
  },

  async getJobWorkflow(req, res, next) {
    try {
      const { jobId } = req.params;
      const businessId = req.user.businessId;

      const workflow = await DepartmentWorkflowService.getJobWorkflow(
        businessId,
        jobId
      );

      res.json({
        success: true,
        data: workflow,
        message: 'Job workflow fetched successfully'
      });

    } catch (error) {
      log.error('Job workflow fetch controller error', error);
      next(error);
    }
  },

  async getDepartmentHandoffs(req, res, next) {
    try {
      const { departmentId } = req.params;
      const { status } = req.query;
      const businessId = req.user.businessId;

      const handoffs = await DepartmentWorkflowService.getDepartmentHandoffs(
        businessId,
        departmentId,
        status
      );

      res.json({
        success: true,
        data: handoffs,
        message: 'Department handoffs fetched successfully'
      });

    } catch (error) {
      log.error('Department handoffs fetch controller error', error);
      next(error);
    }
  },

  async getPendingHandoffs(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const handoffs = await DepartmentWorkflowService.getPendingHandoffs(
        businessId
      );

      res.json({
        success: true,
        data: handoffs,
        message: 'Pending handoffs fetched successfully'
      });

    } catch (error) {
      log.error('Pending handoffs fetch controller error', error);
      next(error);
    }
  }
};
