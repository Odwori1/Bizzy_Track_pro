// File: backend/app/services/refundApprovalService.js
// Production-grade dynamic refund approval service

import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class RefundApprovalService {

    /**
     * Get approval settings for a business
     * @param {string} businessId - Business ID
     * @returns {Promise<Object>} Settings
     */
    static async getSettings(businessId) {
        const client = await getClient();
        
        try {
            const result = await client.query(
                `SELECT * FROM refund_approval_settings WHERE business_id = $1`,
                [businessId]
            );
            
            if (result.rows.length === 0) {
                // Create default settings
                const insertResult = await client.query(
                    `INSERT INTO refund_approval_settings (business_id)
                     VALUES ($1)
                     RETURNING *`,
                    [businessId]
                );
                return insertResult.rows[0];
            }
            
            return result.rows[0];
        } finally {
            client.release();
        }
    }

    /**
     * Update approval settings
     * @param {string} businessId - Business ID
     * @param {Object} settings - New settings
     * @param {string} userId - User making change
     * @returns {Promise<Object>} Updated settings
     */
    static async updateSettings(businessId, settings, userId) {
        const client = await getClient();
        
        try {
            await client.query('BEGIN');
            
            const allowedFields = [
                'approval_type', 'threshold_amount', 'threshold_percentage',
                'requires_approval_for_refund', 'approver_roles',
                'auto_approve_if_below_threshold', 'notify_approvers',
                'notify_on_approval', 'notify_on_rejection', 'escalation_hours'
            ];
            
            const updates = [];
            const values = [businessId];
            let paramCount = 2;
            
            for (const field of allowedFields) {
                if (settings[field] !== undefined) {
                    updates.push(`${field} = $${paramCount}`);
                    values.push(settings[field]);
                    paramCount++;
                }
            }
            
            updates.push(`updated_by = $${paramCount}`);
            values.push(userId);
            paramCount++;
            
            updates.push(`updated_at = NOW()`);
            
            const query = `
                UPDATE refund_approval_settings
                SET ${updates.join(', ')}
                WHERE business_id = $1
                RETURNING *
            `;
            
            const result = await client.query(query, values);
            
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'refund.approval_settings.updated',
                resourceType: 'refund_approval_settings',
                resourceId: businessId,
                newValues: settings
            });
            
            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error updating approval settings:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Check if refund requires approval
     * @param {string} businessId - Business ID
     * @param {number} refundAmount - Amount being refunded
     * @param {number} monthlySales - Optional monthly sales (for testing)
     * @returns {Promise<Object>} Approval decision
     */
    static async requiresApproval(businessId, refundAmount, monthlySales = null) {
        const client = await getClient();
        
        try {
            const result = await client.query(
                `SELECT * FROM check_refund_approval_required($1, $2, $3)`,
                [businessId, refundAmount, monthlySales]
            );
            return result.rows[0];
        } finally {
            client.release();
        }
    }

    /**
     * Check if user can approve refunds
     * @param {string} userId - User ID
     * @param {string} businessId - Business ID
     * @returns {Promise<boolean>} Can approve
     */
    static async userCanApprove(userId, businessId) {
        const client = await getClient();
        
        try {
            const result = await client.query(
                `SELECT user_can_approve_refunds($1, $2) as can_approve`,
                [userId, businessId]
            );
            return result.rows[0].can_approve;
        } finally {
            client.release();
        }
    }

    /**
     * Create approval request for refund
     * @param {string} businessId - Business ID
     * @param {string} refundId - Refund ID
     * @param {string} userId - User requesting
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Approval request
     */
    static async createApprovalRequest(businessId, refundId, userId, options = {}) {
        const client = await getClient();
        
        try {
            await client.query('BEGIN');
            
            // Get refund details
            const refundResult = await client.query(
                `SELECT refund_number, total_refunded, refund_reason
                 FROM refunds
                 WHERE id = $1 AND business_id = $2`,
                [refundId, businessId]
            );
            
            if (refundResult.rows.length === 0) {
                throw new Error('Refund not found');
            }
            
            const refund = refundResult.rows[0];
            
            // Check if approval already exists
            const existing = await client.query(
                `SELECT * FROM refund_approval_queue 
                 WHERE refund_id = $1 AND approval_status = 'PENDING'`,
                [refundId]
            );
            
            if (existing.rows.length > 0) {
                await client.query('COMMIT');
                return existing.rows[0];
            }
            
            // Calculate expiry (default 48 hours)
            const expiryHours = options.expiryHours || 48;
            
            // Create approval record
            const result = await client.query(
                `INSERT INTO refund_approval_queue (
                    business_id, refund_id, requested_by, requested_amount,
                    request_reason, expires_at, metadata
                ) VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' hours')::INTERVAL, $7)
                RETURNING *`,
                [
                    businessId, refundId, userId, refund.total_refunded,
                    refund.refund_reason, expiryHours,
                    JSON.stringify(options.metadata || {})
                ]
            );
            
            const approval = result.rows[0];
            
            // Update refund status
            await client.query(
                `UPDATE refunds 
                 SET status = 'PENDING_APPROVAL',
                     requires_approval = true,
                     approval_id = $1,
                     updated_at = NOW()
                 WHERE id = $2`,
                [approval.id, refundId]
            );
            
            await client.query('COMMIT');
            
            log.info('Approval request created', {
                businessId,
                refundId,
                approvalId: approval.id,
                amount: refund.total_refunded
            });
            
            return approval;
        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error creating approval request:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Approve a refund
     * @param {string} approvalId - Approval queue ID
     * @param {string} userId - User approving
     * @param {string} notes - Approval notes
     * @returns {Promise<Object>} Approval result
     */
    static async approveRefund(approvalId, userId, notes = null) {
        const client = await getClient();
        
        try {
            await client.query('BEGIN');
            
            // Get approval details
            const approvalResult = await client.query(
                `SELECT raq.*, r.business_id, r.refund_number
                 FROM refund_approval_queue raq
                 JOIN refunds r ON raq.refund_id = r.id
                 WHERE raq.id = $1`,
                [approvalId]
            );
            
            if (approvalResult.rows.length === 0) {
                throw new Error('Approval request not found');
            }
            
            const approval = approvalResult.rows[0];
            
            if (approval.approval_status !== 'PENDING') {
                throw new Error(`Approval already ${approval.approval_status}`);
            }
            
            if (approval.expires_at < new Date()) {
                throw new Error('Approval request has expired');
            }
            
            // Update approval status
            await client.query(
                `UPDATE refund_approval_queue
                 SET approval_status = 'APPROVED',
                     approved_by = $1,
                     approved_at = NOW(),
                     approval_notes = $2,
                     updated_at = NOW()
                 WHERE id = $3`,
                [userId, notes, approvalId]
            );
            
            // Add to history
            await client.query(
                `INSERT INTO refund_approval_history (
                    business_id, refund_approval_queue_id, action,
                    action_by, previous_status, new_status, notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    approval.business_id, approvalId, 'APPROVED',
                    userId, 'PENDING', 'APPROVED', notes
                ]
            );
            
            // Update refund status
            await client.query(
                `UPDATE refunds 
                 SET status = 'APPROVED',
                     approved_by = $1,
                     approved_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $2`,
                [userId, approval.refund_id]
            );
            
            await client.query('COMMIT');
            
            // Process the refund (import dynamically to avoid circular dependency)
            const { RefundService } = await import('./refundService.js');
            const processResult = await RefundService.processRefund(
                approval.refund_id,
                userId,
                approval.business_id
            );
            
            return {
                success: true,
                approval: approval,
                refund: processResult.refund,
                message: 'Refund approved and processed'
            };
        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error approving refund:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Reject a refund
     * @param {string} approvalId - Approval queue ID
     * @param {string} userId - User rejecting
     * @param {string} reason - Rejection reason
     * @returns {Promise<Object>} Rejection result
     */
    static async rejectRefund(approvalId, userId, reason) {
        const client = await getClient();
        
        try {
            await client.query('BEGIN');
            
            // Get approval details
            const approvalResult = await client.query(
                `SELECT raq.*, r.business_id, r.refund_number
                 FROM refund_approval_queue raq
                 JOIN refunds r ON raq.refund_id = r.id
                 WHERE raq.id = $1`,
                [approvalId]
            );
            
            if (approvalResult.rows.length === 0) {
                throw new Error('Approval request not found');
            }
            
            const approval = approvalResult.rows[0];
            
            // Update approval status
            await client.query(
                `UPDATE refund_approval_queue
                 SET approval_status = 'REJECTED',
                     rejected_by = $1,
                     rejected_at = NOW(),
                     rejection_reason = $2,
                     updated_at = NOW()
                 WHERE id = $3`,
                [userId, reason, approvalId]
            );
            
            // Add to history
            await client.query(
                `INSERT INTO refund_approval_history (
                    business_id, refund_approval_queue_id, action,
                    action_by, previous_status, new_status, notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    approval.business_id, approvalId, 'REJECTED',
                    userId, 'PENDING', 'REJECTED', reason
                ]
            );
            
            // Update refund status
            await client.query(
                `UPDATE refunds 
                 SET status = 'REJECTED',
                     notes = COALESCE(notes, '') || '\nRejected: ' || $1,
                     updated_at = NOW()
                 WHERE id = $2`,
                [reason, approval.refund_id]
            );
            
            await client.query('COMMIT');
            
            return {
                success: true,
                approval: approval,
                message: 'Refund rejected'
            };
        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error rejecting refund:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get pending approvals for a business
     * @param {string} businessId - Business ID
     * @param {Object} options - Pagination options
     * @returns {Promise<Object>} Pending approvals
     */
    static async getPendingApprovals(businessId, options = {}) {
        const client = await getClient();
        const limit = options.limit || 50;
        const offset = options.offset || 0;
        
        try {
            const result = await client.query(
                `SELECT * FROM get_pending_refund_approvals(NULL, $1, $2, $3)`,
                [businessId, limit, offset]
            );
            
            const countResult = await client.query(
                `SELECT COUNT(*) FROM refund_approval_queue
                 WHERE business_id = $1 AND approval_status = 'PENDING' AND expires_at > NOW()`,
                [businessId]
            );
            
            return {
                approvals: result.rows,
                total: parseInt(countResult.rows[0].count),
                limit,
                offset
            };
        } finally {
            client.release();
        }
    }

    /**
     * Get pending approvals for a specific user
     * @param {string} userId - User ID
     * @param {string} businessId - Business ID
     * @param {Object} options - Pagination options
     * @returns {Promise<Object>} Pending approvals
     */
    static async getUserPendingApprovals(userId, businessId, options = {}) {
        const client = await getClient();
        const limit = options.limit || 50;
        const offset = options.offset || 0;
        
        try {
            const result = await client.query(
                `SELECT * FROM get_pending_refund_approvals($1, $2, $3, $4)`,
                [userId, businessId, limit, offset]
            );
            
            return {
                approvals: result.rows,
                total: result.rows.length,
                limit,
                offset
            };
        } finally {
            client.release();
        }
    }

    /**
     * Get approval details by ID
     * @param {string} approvalId - Approval queue ID
     * @param {string} businessId - Business ID
     * @returns {Promise<Object>} Approval details
     */
    static async getApprovalById(approvalId, businessId) {
        const client = await getClient();
        
        try {
            const result = await client.query(
                `SELECT raq.*, 
                        r.refund_number, r.total_refunded, r.refund_reason,
                        r.created_at as refund_created_at,
                        req.full_name as requested_by_name,
                        app.full_name as approved_by_name,
                        rej.full_name as rejected_by_name
                 FROM refund_approval_queue raq
                 JOIN refunds r ON raq.refund_id = r.id
                 LEFT JOIN users req ON raq.requested_by = req.id
                 LEFT JOIN users app ON raq.approved_by = app.id
                 LEFT JOIN users rej ON raq.rejected_by = rej.id
                 WHERE raq.id = $1 AND raq.business_id = $2`,
                [approvalId, businessId]
            );
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const approval = result.rows[0];
            
            // Get history
            const historyResult = await client.query(
                `SELECT * FROM refund_approval_history
                 WHERE refund_approval_queue_id = $1
                 ORDER BY action_at DESC`,
                [approvalId]
            );
            
            approval.history = historyResult.rows;
            
            return approval;
        } finally {
            client.release();
        }
    }

    /**
     * Auto-expire old pending approvals
     * @returns {Promise<number>} Number expired
     */
    static async autoExpireApprovals() {
        const client = await getClient();
        
        try {
            const result = await client.query(
                `SELECT auto_expire_pending_refund_approvals() as expired_count`
            );
            return result.rows[0].expired_count;
        } finally {
            client.release();
        }
    }

    /**
     * Get approval statistics
     * @param {string} businessId - Business ID
     * @param {string} period - 'day', 'week', 'month', 'year'
     * @returns {Promise<Object>} Statistics
     */
    static async getApprovalStats(businessId, period = 'month') {
        const client = await getClient();
        
        let interval;
        switch (period) {
            case 'day': interval = '1 day'; break;
            case 'week': interval = '7 days'; break;
            case 'month': interval = '30 days'; break;
            case 'year': interval = '365 days'; break;
            default: interval = '30 days';
        }
        
        try {
            const result = await client.query(
                `SELECT
                    COUNT(*) FILTER (WHERE approval_status = 'PENDING') as pending_count,
                    COUNT(*) FILTER (WHERE approval_status = 'APPROVED') as approved_count,
                    COUNT(*) FILTER (WHERE approval_status = 'REJECTED') as rejected_count,
                    COUNT(*) FILTER (WHERE approval_status = 'EXPIRED') as expired_count,
                    COALESCE(SUM(requested_amount) FILTER (WHERE approval_status = 'APPROVED'), 0) as approved_amount,
                    COALESCE(SUM(requested_amount) FILTER (WHERE approval_status = 'REJECTED'), 0) as rejected_amount,
                    AVG(EXTRACT(HOUR FROM (approved_at - requested_at))) FILTER (WHERE approval_status = 'APPROVED') as avg_approval_hours
                 FROM refund_approval_queue
                 WHERE business_id = $1
                   AND requested_at >= NOW() - ($2 || ' days')::INTERVAL`,
                [businessId, interval]
            );
            
            return result.rows[0];
        } finally {
            client.release();
        }
    }
}

export default RefundApprovalService;
