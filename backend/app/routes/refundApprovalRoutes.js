// File: backend/app/routes/refundApprovalRoutes.js
// Dynamic refund approval routes with ABAC (using your permission system)

import express from 'express';
import { RefundApprovalController } from '../controllers/refundApprovalController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import Joi from 'joi';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Settings routes - requires configure permission
router.get('/settings', requirePermission('refund_approval:configure'), RefundApprovalController.getSettings);
router.put('/settings', requirePermission('refund_approval:configure'), RefundApprovalController.updateSettings);

// Check route - anyone can check (no permission required for preview)
router.post('/check', 
    validateRequest(Joi.object({
        amount: Joi.number().positive().required(),
        monthly_sales: Joi.number().min(0).optional()
    })),
    RefundApprovalController.checkApprovalRequired
);

// Pending approvals - requires view permission
router.get('/pending', requirePermission('refund_approval:view_pending'), RefundApprovalController.getPendingApprovals);
router.get('/my-pending', RefundApprovalController.getUserPendingApprovals);

// Approval by ID
router.get('/:approvalId', RefundApprovalController.getApprovalById);

// Statistics - requires stats permission
router.get('/stats', requirePermission('refund_approval:view_stats'), RefundApprovalController.getApprovalStats);

// Approval actions - requires approve/reject permissions
router.post('/:approvalId/approve', requirePermission('refund_approval:approve'), RefundApprovalController.approveRefund);
router.post('/:approvalId/reject', requirePermission('refund_approval:reject'), RefundApprovalController.rejectRefund);

export default router;
