// File: ~/Bizzy_Track_pro/backend/app/services/discountSettingsService.js
// PURPOSE: Manage business-specific discount settings with stacking governance
// UPDATED: 2026-06-02 - Added stacking mode configuration

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

export class DiscountSettingsService {

    /**
     * Get discount settings for a business
     * If no settings exist, creates default settings with stacking governance
     */
    static async getSettings(businessId, client = null) {
        const shouldCloseClient = !client;
        const dbClient = client || await getClient();

        try {
            const result = await dbClient.query(
                `SELECT * FROM discount_settings WHERE business_id = $1`,
                [businessId]
            );

            if (result.rows.length > 0) {
                return result.rows[0];
            }

            // Create default settings with stacking governance
            const insertResult = await dbClient.query(
                `INSERT INTO discount_settings (
                    business_id,
                    approval_threshold,
                    auto_approve_up_to,
                    require_approval_for_stacked,
                    max_discount_per_transaction,
                    default_allocation_method,
                    stacking_mode,
                    allow_volume_promo_stack,
                    allow_auto_promo_stack,
                    max_stack_depth,
                    max_discount_percentage
                ) VALUES ($1, 20.00, 0, false, NULL, 'PRO_RATA_AMOUNT', 'best_only', false, false, 1, 50.00)
                RETURNING *`,
                [businessId]
            );

            return insertResult.rows[0];

        } catch (error) {
            log.error('Error getting discount settings', { error: error.message, businessId });
            throw error;
        } finally {
            if (shouldCloseClient) dbClient.release();
        }
    }

    /**
     * Update discount settings for a business
     * UPDATED: Added stacking configuration fields
     */
    static async updateSettings(businessId, settings, userId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            const updates = [];
            const values = [businessId];
            let paramCount = 2;

            const allowedFields = [
                'approval_threshold',
                'auto_approve_up_to',
                'require_approval_for_stacked',
                'max_discount_per_transaction',
                'default_allocation_method',
                'stacking_mode',
                'allow_volume_promo_stack',
                'allow_auto_promo_stack',
                'max_stack_depth',
                'max_discount_percentage'
            ];

            for (const field of allowedFields) {
                if (settings[field] !== undefined) {
                    updates.push(`${field} = $${paramCount++}`);
                    values.push(settings[field]);
                }
            }

            if (updates.length === 0) {
                return await this.getSettings(businessId, client);
            }

            updates.push(`updated_by = $${paramCount}`);
            values.push(userId);
            paramCount++;

            updates.push(`updated_at = NOW()`);

            const query = `
                UPDATE discount_settings
                SET ${updates.join(', ')}
                WHERE business_id = $1
                RETURNING *
            `;

            const result = await client.query(query, values);

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'discount_settings.updated',
                resourceType: 'discount_settings',
                resourceId: result.rows[0].id,
                newValues: settings
            });

            await client.query('COMMIT');

            log.info('Discount settings updated', { businessId, userId, settings });
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error updating discount settings', { error: error.message, businessId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get stacking configuration for a business
     * NEW METHOD: Returns structured stacking config for the engine
     */
    static async getStackingConfig(businessId) {
        try {
            const settings = await this.getSettings(businessId);

            return {
                stackingMode: settings.stacking_mode || 'best_only',
                allowVolumePromoStack: settings.allow_volume_promo_stack || false,
                allowAutoPromoStack: settings.allow_auto_promo_stack || false,
                maxStackDepth: parseInt(settings.max_stack_depth) || 1,
                maxDiscountPercentage: parseFloat(settings.max_discount_percentage) || 50,
                maxDiscountPerTransaction: settings.max_discount_per_transaction ? 
                    parseFloat(settings.max_discount_per_transaction) : null,
                requireApprovalForStacked: settings.require_approval_for_stacked || false
            };

        } catch (error) {
            log.error('Error getting stacking config', { error: error.message, businessId });
            // Return safe defaults
            return {
                stackingMode: 'best_only',
                allowVolumePromoStack: false,
                allowAutoPromoStack: false,
                maxStackDepth: 1,
                maxDiscountPercentage: 50,
                maxDiscountPerTransaction: null,
                requireApprovalForStacked: false
            };
        }
    }

    /**
     * Get approval threshold for a business
     */
    static async getApprovalThreshold(businessId) {
        try {
            const settings = await this.getSettings(businessId);
            return parseFloat(settings.approval_threshold);
        } catch (error) {
            log.error('Error getting approval threshold', { error: error.message, businessId });
            return 20.00;
        }
    }

    /**
     * Check if a discount requires approval based on business settings
     */
    static async requiresApproval(businessId, discountPercentage, stackedDiscounts = []) {
        const settings = await this.getSettings(businessId);
        const threshold = parseFloat(settings.approval_threshold);

        if (discountPercentage > threshold) return true;

        if (settings.require_approval_for_stacked && stackedDiscounts.length > 1) {
            const totalPercentage = stackedDiscounts.reduce((sum, d) => sum + d.percentage, 0);
            if (totalPercentage > threshold) return true;
        }

        if (settings.auto_approve_up_to > 0 && discountPercentage <= settings.auto_approve_up_to) {
            return false;
        }

        return false;
    }

    /**
     * Validate if discount is within business limits
     */
    static async validateDiscountLimit(businessId, discountPercentage) {
        const settings = await this.getSettings(businessId);
        const maxPercentage = parseFloat(settings.max_discount_percentage) || 50;

        if (discountPercentage > maxPercentage) {
            return {
                valid: false,
                reason: `Discount exceeds maximum allowed (${maxPercentage}%)`,
                maxAllowed: maxPercentage
            };
        }

        return { valid: true };
    }

    /**
     * Reset settings to defaults
     */
    static async resetToDefaults(businessId, userId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            const result = await client.query(
                `UPDATE discount_settings
                 SET approval_threshold = 20.00,
                     auto_approve_up_to = 0,
                     require_approval_for_stacked = false,
                     max_discount_per_transaction = NULL,
                     default_allocation_method = 'PRO_RATA_AMOUNT',
                     stacking_mode = 'best_only',
                     allow_volume_promo_stack = false,
                     allow_auto_promo_stack = false,
                     max_stack_depth = 1,
                     max_discount_percentage = 50.00,
                     updated_by = $2,
                     updated_at = NOW()
                 WHERE business_id = $1
                 RETURNING *`,
                [businessId, userId]
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'discount_settings.reset',
                resourceType: 'discount_settings',
                resourceId: result.rows[0].id,
                newValues: { reset_to_defaults: true }
            });

            await client.query('COMMIT');

            log.info('Discount settings reset to defaults', { businessId, userId });
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error resetting discount settings', { error: error.message, businessId });
            throw error;
        } finally {
            client.release();
        }
    }
}

export default DiscountSettingsService;
