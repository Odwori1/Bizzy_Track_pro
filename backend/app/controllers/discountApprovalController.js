import { DiscountApprovalService } from '../services/discountApprovalService.js';
import { log } from '../utils/logger.js';

export const discountApprovalController = {
  async create(req, res, next) {
    try {
      const approvalData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating discount approval', {
        businessId,
        userId,
        jobId: approvalData.job_id,
        discountPercentage: approvalData.discount_percentage
      });

      const newApproval = await DiscountApprovalService.createDiscountApproval(
        businessId,
        approvalData,
        userId
      );

      res.status(201).json({
        success: true,
        message: 'Discount approval created successfully',
        data: newApproval
      });

    } catch (error) {
      log.error('Discount approval creation controller error', error);
      next(error);
    }
  },

  async getPending(req, res, next) {
    try {
      const businessId = req.user.businessId;

      log.info('Fetching pending discount approvals', {
        businessId
      });

      const pendingApprovals = await DiscountApprovalService.getPendingApprovals(businessId);

      res.json({
        success: true,
        data: pendingApprovals,
        count: pendingApprovals.length,
        message: 'Pending approvals fetched successfully'
      });

    } catch (error) {
      log.error('Pending approvals fetch controller error', error);
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      log.info('Fetching discount approval by ID', {
        businessId,
        approvalId: id
      });

      const approval = await DiscountApprovalService.getApprovalById(businessId, id);

      if (!approval) {
        return res.status(404).json({
          success: false,
          message: 'Discount approval not found'
        });
      }

      res.json({
        success: true,
        data: approval,
        message: 'Discount approval fetched successfully'
      });

    } catch (error) {
      log.error('Discount approval fetch by ID controller error', error);
      next(error);
    }
  },

  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating discount approval status', {
        businessId,
        userId,
        approvalId: id,
        newStatus: updateData.status
      });

      const updatedApproval = await DiscountApprovalService.updateApprovalStatus(
        businessId,
        id,
        updateData,
        userId
      );

      if (!updatedApproval) {
        return res.status(404).json({
          success: false,
          message: 'Discount approval not found'
        });
      }

      res.json({
        success: true,
        message: `Discount approval ${updateData.status} successfully`,
        data: updatedApproval
      });

    } catch (error) {
      log.error('Discount approval status update controller error', error);
      next(error);
    }
  },

  async getHistory(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { status, job_id } = req.query;

      log.info('Fetching discount approval history', {
        businessId,
        filters: { status, job_id }
      });

      const filters = {};
      if (status) filters.status = status;
      if (job_id) filters.job_id = job_id;

      const history = await DiscountApprovalService.getApprovalHistory(businessId, filters);

      res.json({
        success: true,
        data: history,
        count: history.length,
        message: 'Discount approval history fetched successfully'
      });

    } catch (error) {
      log.error('Discount approval history fetch controller error', error.message);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to fetch discount approval history';
      if (error.message.includes('timeout') || error.message.includes('connect')) {
        errorMessage = 'Database connection timeout. Please try again.';
      }
      
      res.status(500).json({
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  async getStats(req, res, next) {
    try {
      const businessId = req.user.businessId;

      log.info('Fetching discount approval statistics', {
        businessId
      });

      const stats = await DiscountApprovalService.getApprovalStats(businessId);

      res.json({
        success: true,
        data: stats,
        message: 'Discount approval statistics fetched successfully'
      });

    } catch (error) {
      log.error('Discount approval stats fetch controller error', error);
      next(error);
    }
  },

  async checkApprovalRequired(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { discount_percentage, threshold } = req.body;

      log.info('Checking if discount requires approval', {
        businessId,
        discount_percentage,
        threshold
      });

      const requiresApproval = await DiscountApprovalService.checkDiscountRequiresApproval(
        businessId,
        discount_percentage,
        threshold
      );

      res.json({
        success: true,
        data: {
          discount_percentage,
          threshold: threshold || 20,
          requires_approval: requiresApproval
        },
        message: 'Discount approval check completed successfully'
      });

    } catch (error) {
      log.error('Discount approval check controller error', error);
      next(error);
    }
  }
};
