// File: backend/app/controllers/refundApprovalController.js
// Dynamic refund approval controller

import { RefundApprovalService } from '../services/refundApprovalService.js';
import { log } from '../utils/logger.js';

export class RefundApprovalController {

    /**
     * GET /api/refund-approval/settings
     * Get approval settings for current business
     */
    static async getSettings(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const settings = await RefundApprovalService.getSettings(businessId);
            
            res.json({
                success: true,
                data: settings
            });
        } catch (error) {
            log.error('Error getting approval settings:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * PUT /api/refund-approval/settings
     * Update approval settings
     */
    static async updateSettings(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            
            const settings = await RefundApprovalService.updateSettings(
                businessId,
                req.body,
                userId
            );
            
            res.json({
                success: true,
                data: settings,
                message: 'Approval settings updated successfully'
            });
        } catch (error) {
            log.error('Error updating approval settings:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * GET /api/refund-approval/pending
     * Get pending approval requests
     */
    static async getPendingApprovals(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            
            const result = await RefundApprovalService.getPendingApprovals(businessId, { limit, offset });
            
            res.json({
                success: true,
                data: result.approvals,
                pagination: {
                    total: result.total,
                    limit: result.limit,
                    offset: result.offset
                }
            });
        } catch (error) {
            log.error('Error getting pending approvals:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * GET /api/refund-approval/my-pending
     * Get pending approvals for current user
     */
    static async getUserPendingApprovals(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            
            const result = await RefundApprovalService.getUserPendingApprovals(userId, businessId, { limit, offset });
            
            res.json({
                success: true,
                data: result.approvals,
                pagination: {
                    total: result.total,
                    limit: result.limit,
                    offset: result.offset
                }
            });
        } catch (error) {
            log.error('Error getting user pending approvals:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * GET /api/refund-approval/:approvalId
     * Get approval details by ID
     */
    static async getApprovalById(req, res) {
        try {
            const { approvalId } = req.params;
            const businessId = req.user.businessId || req.user.business_id;
            
            const approval = await RefundApprovalService.getApprovalById(approvalId, businessId);
            
            if (!approval) {
                return res.status(404).json({
                    success: false,
                    message: 'Approval request not found'
                });
            }
            
            res.json({
                success: true,
                data: approval
            });
        } catch (error) {
            log.error('Error getting approval:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * POST /api/refund-approval/:approvalId/approve
     * Approve a refund
     */
    static async approveRefund(req, res) {
        try {
            const { approvalId } = req.params;
            const userId = req.user.userId || req.user.id;
            const { notes } = req.body;
            
            // Check if user can approve
            const businessId = req.user.businessId || req.user.business_id;
            const canApprove = await RefundApprovalService.userCanApprove(userId, businessId);
            
            if (!canApprove) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to approve refunds'
                });
            }
            
            const result = await RefundApprovalService.approveRefund(approvalId, userId, notes);
            res.json(result);
        } catch (error) {
            log.error('Error approving refund:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * POST /api/refund-approval/:approvalId/reject
     * Reject a refund
     */
    static async rejectRefund(req, res) {
        try {
            const { approvalId } = req.params;
            const userId = req.user.userId || req.user.id;
            const { reason } = req.body;
            
            if (!reason) {
                return res.status(400).json({
                    success: false,
                    message: 'Rejection reason is required'
                });
            }
            
            // Check if user can approve (same permission)
            const businessId = req.user.businessId || req.user.business_id;
            const canApprove = await RefundApprovalService.userCanApprove(userId, businessId);
            
            if (!canApprove) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to reject refunds'
                });
            }
            
            const result = await RefundApprovalService.rejectRefund(approvalId, userId, reason);
            res.json(result);
        } catch (error) {
            log.error('Error rejecting refund:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * GET /api/refund-approval/stats
     * Get approval statistics
     */
    static async getApprovalStats(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const period = req.query.period || 'month';
            
            const stats = await RefundApprovalService.getApprovalStats(businessId, period);
            
            res.json({
                success: true,
                data: stats,
                period
            });
        } catch (error) {
            log.error('Error getting approval stats:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * POST /api/refund-approval/check
     * Check if a refund amount would require approval (preview)
     */
    static async checkApprovalRequired(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { amount, monthly_sales } = req.body;
            
            if (!amount) {
                return res.status(400).json({
                    success: false,
                    message: 'Amount is required'
                });
            }
            
            const result = await RefundApprovalService.requiresApproval(businessId, amount, monthly_sales);
            
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            log.error('Error checking approval requirement:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

export default RefundApprovalController;
