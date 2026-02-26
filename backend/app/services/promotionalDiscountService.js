// File: ~/Bizzy_Track_pro/backend/app/services/promotionalDiscountService.js
// PURPOSE: Manage customer-facing promotional codes
// PHASE 10.2: Following discountCore.js and discountRules.js patterns
// DEPENDS ON: discountCore.js, promotional_discounts table

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';
import { DiscountCore } from './discountCore.js';
import { DiscountRules } from './discountRules.js';

export class PromotionalDiscountService {

    /**
     * =====================================================
     * SECTION 1: CRUD OPERATIONS
     * =====================================================
     */

    /**
     * Create a new promotional campaign
     */
    static async createPromotion(data, userId, businessId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            // Validate dates
            if (data.valid_from && data.valid_to) {
                const fromDate = new Date(data.valid_from);
                const toDate = new Date(data.valid_to);
                if (fromDate > toDate) {
                    throw new Error('Valid from date must be before valid to date');
                }
            }

            // Generate promo code if not provided
            if (!data.promo_code) {
                data.promo_code = await this._generateUniquePromoCode(businessId);
            }

            // Check if promo code already exists
            const existing = await client.query(
                `SELECT id FROM promotional_discounts
                 WHERE business_id = $1 AND promo_code = $2`,
                [businessId, data.promo_code]
            );

            if (existing.rows.length > 0) {
                throw new Error(`Promo code '${data.promo_code}' already exists`);
            }

            const result = await client.query(
                `INSERT INTO promotional_discounts (
                    business_id, promo_code, description, discount_type,
                    discount_value, min_purchase, max_uses, per_customer_limit,
                    valid_from, valid_to, is_active, created_by, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
                RETURNING *`,
                [
                    businessId,
                    data.promo_code,
                    data.description || '',
                    data.discount_type || 'PERCENTAGE',
                    data.discount_value,
                    data.min_purchase || null,
                    data.max_uses || null,
                    data.per_customer_limit || null,
                    data.valid_from || null,
                    data.valid_to || null,
                    data.is_active !== false,
                    userId
                ]
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'promotion.created',
                resourceType: 'promotional_discount',
                resourceId: result.rows[0].id,
                newValues: {
                    promo_code: data.promo_code,
                    discount_type: data.discount_type,
                    discount_value: data.discount_value
                }
            });

            log.info('Promotional campaign created', {
                businessId,
                userId,
                promoId: result.rows[0].id,
                promoCode: data.promo_code
            });

            await client.query('COMMIT');
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error creating promotion', { error: error.message, businessId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get all promotions with filters
     */
    static async getPromotions(businessId, filters = {}) {
        const client = await getClient();

        try {
            let query = `
                SELECT * FROM promotional_discounts
                WHERE business_id = $1
            `;
            const params = [businessId];
            let paramCount = 1;

            // Apply filters
            if (filters.is_active !== undefined) {
                query += ` AND is_active = $${++paramCount}`;
                params.push(filters.is_active);
            }

            if (filters.promo_code) {
                query += ` AND promo_code ILIKE $${++paramCount}`;
                params.push(`%${filters.promo_code}%`);
            }

            if (filters.valid_from) {
                query += ` AND valid_from >= $${++paramCount}`;
                params.push(filters.valid_from);
            }

            if (filters.valid_to) {
                query += ` AND valid_to <= $${++paramCount}`;
                params.push(filters.valid_to);
            }

            if (filters.has_uses_remaining) {
                query += ` AND (max_uses IS NULL OR times_used < max_uses)`;
            }

            query += ` ORDER BY created_at DESC`;

            const result = await client.query(query, params);
            return result.rows;

        } catch (error) {
            log.error('Error getting promotions', { error: error.message, businessId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get promotion by ID
     */
    static async getPromotionById(id, businessId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT * FROM promotional_discounts
                 WHERE id = $1 AND business_id = $2`,
                [id, businessId]
            );

            return result.rows[0] || null;

        } catch (error) {
            log.error('Error getting promotion by ID', { error: error.message, id });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update promotion
     */
    static async updatePromotion(id, data, userId, businessId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            // Get existing promotion
            const existing = await client.query(
                `SELECT * FROM promotional_discounts WHERE id = $1 AND business_id = $2`,
                [id, businessId]
            );

            if (existing.rows.length === 0) {
                throw new Error('Promotion not found');
            }

            // Build dynamic update query
            const updates = [];
            const params = [];
            let paramCount = 1;

            const allowedFields = [
                'promo_code', 'description', 'discount_type', 'discount_value',
                'min_purchase', 'max_uses', 'per_customer_limit', 'valid_from',
                'valid_to', 'is_active'
            ];

            for (const field of allowedFields) {
                if (data[field] !== undefined) {
                    updates.push(`${field} = $${paramCount++}`);
                    params.push(data[field]);
                }
            }

            updates.push(`updated_at = NOW()`);
            params.push(id, businessId);

            const query = `
                UPDATE promotional_discounts
                SET ${updates.join(', ')}
                WHERE id = $${paramCount++} AND business_id = $${paramCount}
                RETURNING *
            `;

            const result = await client.query(query, params);

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'promotion.updated',
                resourceType: 'promotional_discount',
                resourceId: id,
                oldValues: existing.rows[0],
                newValues: result.rows[0]
            });

            log.info('Promotion updated', { businessId, userId, promoId: id });

            await client.query('COMMIT');
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error updating promotion', { error: error.message, id });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Deactivate promotion (soft delete)
     */
    static async deactivatePromotion(id, businessId, userId) {
        return this.updatePromotion(id, { is_active: false }, userId, businessId);
    }

    /**
     * =====================================================
     * SECTION 2: VALIDATION & APPLICATION
     * =====================================================
     */

    /**
     * Validate and apply promo code to amount
     * FIXED: Ensure amount is a number before using toFixed()
     */
    static async validateAndApplyPromo(businessId, promoCode, amount, customerId) {
        const client = await getClient();

        try {
            // Ensure amount is a number
            const numericAmount = parseFloat(amount);
            if (isNaN(numericAmount)) {
                return {
                    valid: false,
                    reason: 'Invalid amount provided',
                    discount: 0
                };
            }

            // Find active promotion
            const result = await client.query(
                `SELECT * FROM promotional_discounts
                 WHERE business_id = $1
                    AND promo_code = $2
                    AND is_active = true
                    AND (valid_from IS NULL OR valid_from <= NOW())
                    AND (valid_to IS NULL OR valid_to >= NOW())`,
                [businessId, promoCode]
            );

            if (result.rows.length === 0) {
                return {
                    valid: false,
                    reason: 'Invalid or expired promo code',
                    discount: 0
                };
            }

            const promo = result.rows[0];

            // Check global usage limit
            if (promo.max_uses && promo.times_used >= promo.max_uses) {
                return {
                    valid: false,
                    reason: 'Promo code has reached maximum usage',
                    discount: 0
                };
            }

            // Check minimum purchase - FIXED: Ensure proper numeric comparison
            if (promo.min_purchase) {
                const minPurchase = parseFloat(promo.min_purchase);
                if (numericAmount < minPurchase) {
                    return {
                        valid: false,
                        reason: `Minimum purchase of ${DiscountCore.formatDiscount(minPurchase)} required`,
                        discount: 0
                    };
                }
            }

            // Check per-customer limit
            if (promo.per_customer_limit && customerId) {
                const customerUsage = await this.getCustomerPromoUsage(
                    businessId,
                    promo.id,
                    customerId
                );

                if (customerUsage >= promo.per_customer_limit) {
                    return {
                        valid: false,
                        reason: `You have already used this promo code ${promo.per_customer_limit} time(s)`,
                        discount: 0
                    };
                }
            }

            // Calculate discount - FIXED: Pass numeric amount
            const discountAmount = DiscountCore.calculateDiscount(
                numericAmount,
                promo.discount_type,
                parseFloat(promo.discount_value)
            );

            return {
                valid: true,
                promo: promo,
                discountAmount: discountAmount,
                finalAmount: numericAmount - discountAmount,
                reason: 'Valid promo code'
            };

        } catch (error) {
            log.error('Error validating promo code', { error: error.message, promoCode });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get customer's usage of a specific promotion
     */
    static async getCustomerPromoUsage(businessId, promoId, customerId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT COUNT(*) as usage_count
                 FROM discount_allocations da
                 LEFT JOIN pos_transactions pt ON da.pos_transaction_id = pt.id
                 LEFT JOIN invoices i ON da.invoice_id = i.id
                 WHERE da.business_id = $1
                    AND da.promotional_discount_id = $2
                    AND (pt.customer_id = $3 OR i.customer_id = $3)
                    AND da.status = 'APPLIED'`,
                [businessId, promoId, customerId]
            );

            return parseInt(result.rows[0]?.usage_count || 0);

        } catch (error) {
            log.error('Error getting customer promo usage', { error: error.message });
            return 0;
        } finally {
            client.release();
        }
    }

    /**
     * Increment promo code usage
     */
    static async incrementPromoUsage(promoId, businessId) {
        const client = await getClient();

        try {
            await client.query(
                `UPDATE promotional_discounts
                 SET times_used = times_used + 1,
                     updated_at = NOW()
                 WHERE id = $1 AND business_id = $2`,
                [promoId, businessId]
            );

            log.debug('Incremented promo usage', { promoId, businessId });

        } catch (error) {
            log.error('Error incrementing promo usage', { error: error.message, promoId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 3: STATISTICS & ANALYTICS
     * =====================================================
     */

    /**
     * Get promotion usage statistics
     */
    static async getPromotionStats(promoId, businessId) {
        const client = await getClient();

        try {
            // Get promotion details
            const promoResult = await client.query(
                `SELECT * FROM promotional_discounts
                 WHERE id = $1 AND business_id = $2`,
                [promoId, businessId]
            );

            if (promoResult.rows.length === 0) {
                return null;
            }

            const promo = promoResult.rows[0];

            // Get allocation stats
            const statsResult = await client.query(
                `SELECT
                    COUNT(*) as total_uses,
                    COALESCE(SUM(total_discount_amount), 0) as total_discount_amount,
                    COUNT(DISTINCT
                        CASE
                            WHEN pt.customer_id IS NOT NULL THEN pt.customer_id
                            WHEN i.customer_id IS NOT NULL THEN i.customer_id
                        END
                    ) as unique_customers,
                    MIN(da.applied_at) as first_use,
                    MAX(da.applied_at) as last_use
                 FROM discount_allocations da
                 LEFT JOIN pos_transactions pt ON da.pos_transaction_id = pt.id
                 LEFT JOIN invoices i ON da.invoice_id = i.id
                 WHERE da.business_id = $1
                    AND da.promotional_discount_id = $2
                    AND da.status = 'APPLIED'`,
                [businessId, promoId]
            );

            const stats = statsResult.rows[0];

            return {
                ...promo,
                usage_stats: {
                    total_uses: parseInt(stats.total_uses || 0),
                    total_discount_amount: parseFloat(stats.total_discount_amount || 0),
                    unique_customers: parseInt(stats.unique_customers || 0),
                    first_use: stats.first_use,
                    last_use: stats.last_use,
                    remaining_uses: promo.max_uses ?
                        promo.max_uses - (promo.times_used || 0) : null,
                    usage_percentage: promo.max_uses ?
                        ((promo.times_used || 0) / promo.max_uses * 100).toFixed(2) + '%' : null
                }
            };

        } catch (error) {
            log.error('Error getting promotion stats', { error: error.message, promoId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 4: BULK OPERATIONS
     * =====================================================
     */

    /**
     * Bulk create promotions from array
     * FIXED: Use proper UUID format for audit log
     */
    static async bulkCreatePromotions(promotions, userId, businessId) {
        const client = await getClient();
        const results = [];

        try {
            await client.query('BEGIN');

            for (const promo of promotions) {
                try {
                    // Generate promo code if not provided
                    if (!promo.promo_code) {
                        promo.promo_code = await this._generateUniquePromoCode(businessId);
                    }

                    const result = await client.query(
                        `INSERT INTO promotional_discounts (
                            business_id, promo_code, description, discount_type,
                            discount_value, min_purchase, max_uses, per_customer_limit,
                            valid_from, valid_to, is_active, created_by, created_at, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
                        RETURNING id, promo_code`,
                        [
                            businessId,
                            promo.promo_code,
                            promo.description || '',
                            promo.discount_type || 'PERCENTAGE',
                            promo.discount_value,
                            promo.min_purchase || null,
                            promo.max_uses || null,
                            promo.per_customer_limit || null,
                            promo.valid_from || null,
                            promo.valid_to || null,
                            promo.is_active !== false,
                            userId
                        ]
                    );

                    results.push({
                        success: true,
                        id: result.rows[0].id,
                        promo_code: result.rows[0].promo_code
                    });

                } catch (error) {
                    results.push({
                        success: false,
                        promo_code: promo.promo_code || 'unknown',
                        error: error.message
                    });
                }
            }

            // Generate a UUID-compatible string for bulk operation
            const timestamp = Date.now().toString().padStart(12, '0').slice(-12);
            const bulkUuid = `00000000-0000-0000-0000-${timestamp}`;

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'promotions.bulk_created',
                resourceType: 'promotional_discount',
                resourceId: bulkUuid,
                newValues: {
                    total: promotions.length,
                    successful: results.filter(r => r.success).length,
                    failed: results.filter(r => !r.success).length
                }
            });

            await client.query('COMMIT');
            return results;

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error in bulk create promotions', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Export promotions to CSV format
     */
    static async exportPromotions(businessId, filters = {}) {
        const promotions = await this.getPromotions(businessId, filters);

        const csvRows = [];

        // Headers
        csvRows.push([
            'ID', 'Promo Code', 'Description', 'Discount Type', 'Discount Value',
            'Min Purchase', 'Max Uses', 'Times Used', 'Per Customer Limit',
            'Valid From', 'Valid To', 'Is Active', 'Created At'
        ].join(','));

        // Data rows
        for (const promo of promotions) {
            csvRows.push([
                promo.id,
                `"${promo.promo_code}"`,
                `"${promo.description || ''}"`,
                promo.discount_type,
                promo.discount_value,
                promo.min_purchase || '',
                promo.max_uses || '',
                promo.times_used || 0,
                promo.per_customer_limit || '',
                promo.valid_from ? new Date(promo.valid_from).toISOString().split('T')[0] : '',
                promo.valid_to ? new Date(promo.valid_to).toISOString().split('T')[0] : '',
                promo.is_active,
                new Date(promo.created_at).toISOString()
            ].join(','));
        }

        return csvRows.join('\n');
    }

    /**
     * =====================================================
     * SECTION 5: UTILITY METHODS
     * =====================================================
     */

    /**
     * Generate a unique promo code
     */
    static async _generateUniquePromoCode(businessId) {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const length = 8;
        let isUnique = false;
        let attempts = 0;
        let promoCode;

        while (!isUnique && attempts < 10) {
            promoCode = '';
            for (let i = 0; i < length; i++) {
                promoCode += characters.charAt(Math.floor(Math.random() * characters.length));
            }

            const existing = await getClient().then(async client => {
                try {
                    const result = await client.query(
                        `SELECT id FROM promotional_discounts
                         WHERE business_id = $1 AND promo_code = $2`,
                        [businessId, promoCode]
                    );
                    return result.rows.length === 0;
                } finally {
                    client.release();
                }
            });

            isUnique = existing;
            attempts++;
        }

        if (!isUnique) {
            // Fallback to timestamp-based code
            promoCode = 'PROMO' + Date.now().toString().slice(-8);
        }

        return promoCode;
    }

    /**
     * Validate promotion dates
     */
    static validatePromotionDates(validFrom, validTo) {
        const errors = [];

        if (validFrom && validTo) {
            const from = new Date(validFrom);
            const to = new Date(validTo);

            if (from > to) {
                errors.push('Valid from date must be before valid to date');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Get expiring promotions
     */
    static async getExpiringPromotions(businessId, daysThreshold = 7) {
        const client = await getClient();

        try {
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

            const result = await client.query(
                `SELECT * FROM promotional_discounts
                 WHERE business_id = $1
                    AND is_active = true
                    AND valid_to IS NOT NULL
                    AND valid_to <= $2
                    AND valid_to >= NOW()
                 ORDER BY valid_to ASC`,
                [businessId, thresholdDate]
            );

            return result.rows;

        } catch (error) {
            log.error('Error getting expiring promotions', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }
}

export default PromotionalDiscountService;
