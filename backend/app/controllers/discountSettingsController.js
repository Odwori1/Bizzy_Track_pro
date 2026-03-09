// File: ~/Bizzy_Track_pro/backend/app/controllers/discountSettingsController.js
// PURPOSE: Handle discount settings API endpoints
// CREATED: February 28, 2026

import { DiscountSettingsService } from '../services/discountSettingsService.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class DiscountSettingsController {

    /**
     * GET /api/discounts/settings
     * Get discount settings for current business
     */
    static async getSettings(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Getting discount settings', { businessId });

            const settings = await DiscountSettingsService.getSettings(businessId);

            return res.json({
                success: true,
                data: settings,
                message: 'Discount settings retrieved'
            });

        } catch (error) {
            log.error('Error getting discount settings:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get discount settings',
                details: error.message
            });
        }
    }

    /**
     * PUT /api/discounts/settings
     * Update discount settings
     */
    static async updateSettings(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const settings = req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            // Check permissions - only admin/owner can change settings
            if (!['owner', 'admin'].includes(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Permission denied. Only owners and admins can modify discount settings.'
                });
            }

            log.info('Updating discount settings', {
                businessId,
                userId,
                settings
            });

            const result = await DiscountSettingsService.updateSettings(
                businessId,
                settings,
                userId
            );

            return res.json({
                success: true,
                data: result,
                message: 'Discount settings updated successfully'
            });

        } catch (error) {
            log.error('Error updating discount settings:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to update discount settings',
                details: error.message
            });
        }
    }

    /**
     * POST /api/discounts/settings/reset
     * Reset settings to defaults
     */
    static async resetSettings(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            // Check permissions - only admin/owner can reset settings
            if (!['owner', 'admin'].includes(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Permission denied. Only owners and admins can reset discount settings.'
                });
            }

            log.info('Resetting discount settings to defaults', {
                businessId,
                userId
            });

            const result = await DiscountSettingsService.resetToDefaults(
                businessId,
                userId
            );

            return res.json({
                success: true,
                data: result,
                message: 'Discount settings reset to defaults'
            });

        } catch (error) {
            log.error('Error resetting discount settings:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to reset discount settings',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/settings/threshold
     * Quick endpoint to get just the approval threshold
     */
    static async getApprovalThreshold(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const threshold = await DiscountSettingsService.getApprovalThreshold(businessId);

            return res.json({
                success: true,
                data: { approval_threshold: threshold },
                message: 'Approval threshold retrieved'
            });

        } catch (error) {
            log.error('Error getting approval threshold:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get approval threshold',
                details: error.message
            });
        }
    }
}

export default DiscountSettingsController;
