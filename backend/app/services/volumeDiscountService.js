// File: ~/Bizzy_Track_pro/backend/app/services/volumeDiscountService.js
// PURPOSE: Manage tiered volume discounts based on quantity or amount
// PHASE 10.5: Following patterns from promotionalDiscountService.js and earlyPaymentService.js
// DEPENDS ON: discountCore.js, volume_discount_tiers table

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';
import { DiscountCore } from './discountCore.js';

export class VolumeDiscountService {

    /**
     * =====================================================
     * SECTION 1: TIER MANAGEMENT (CRUD)
     * =====================================================
     */

    /**
     * Create a new volume discount tier
     */
    static async createTier(data, businessId, userId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            // Validate tier data
            if (!data.tier_name) {
                throw new Error('Tier name is required');
            }

            if (!data.discount_percentage || data.discount_percentage <= 0 || data.discount_percentage > 100) {
                throw new Error('Discount percentage must be between 0 and 100');
            }

            if (!data.min_quantity && !data.min_amount) {
                throw new Error('Either min_quantity or min_amount must be specified');
            }

            if (data.min_quantity && data.min_quantity < 0) {
                throw new Error('Minimum quantity cannot be negative');
            }

            if (data.min_amount && data.min_amount < 0) {
                throw new Error('Minimum amount cannot be negative');
            }

            const result = await client.query(
                `INSERT INTO volume_discount_tiers (
                    business_id, tier_name, min_quantity, min_amount,
                    discount_percentage, applies_to, target_category_id,
                    is_active, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
                RETURNING *`,
                [
                    businessId,
                    data.tier_name,
                    data.min_quantity || null,
                    data.min_amount || null,
                    data.discount_percentage,
                    data.applies_to || 'ALL',
                    data.target_category_id || null,
                    data.is_active !== false
                ]
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'volume_tier.created',
                resourceType: 'volume_discount_tiers',
                resourceId: result.rows[0].id,
                newValues: {
                    tier_name: data.tier_name,
                    discount_percentage: data.discount_percentage,
                    min_quantity: data.min_quantity,
                    min_amount: data.min_amount,
                    applies_to: data.applies_to
                }
            });

            log.info('Volume discount tier created', {
                businessId,
                userId,
                tierId: result.rows[0].id,
                tierName: data.tier_name
            });

            await client.query('COMMIT');
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error creating volume tier', { error: error.message, businessId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get all volume discount tiers with filters
     */
    static async getTiers(businessId, filters = {}) {
        const client = await getClient();

        try {
            let query = `
                SELECT * FROM volume_discount_tiers
                WHERE business_id = $1
            `;
            const params = [businessId];
            let paramCount = 1;

            if (filters.is_active !== undefined) {
                query += ` AND is_active = $${++paramCount}`;
                params.push(filters.is_active);
            }

            if (filters.applies_to) {
                query += ` AND applies_to = $${++paramCount}`;
                params.push(filters.applies_to);
            }

            if (filters.min_quantity_min) {
                query += ` AND min_quantity >= $${++paramCount}`;
                params.push(filters.min_quantity_min);
            }

            if (filters.min_amount_min) {
                query += ` AND min_amount >= $${++paramCount}`;
                params.push(filters.min_amount_min);
            }

            if (filters.search) {
                query += ` AND tier_name ILIKE $${++paramCount}`;
                params.push(`%${filters.search}%`);
            }

            // Order by most relevant first
            query += ` ORDER BY 
                CASE WHEN min_quantity IS NOT NULL THEN 0 ELSE 1 END,
                min_quantity ASC NULLS LAST,
                min_amount ASC NULLS LAST,
                discount_percentage DESC,
                created_at DESC`;

            const result = await client.query(query, params);
            return result.rows;

        } catch (error) {
            log.error('Error getting volume tiers', { error: error.message, businessId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get tier by ID
     */
    static async getTierById(id, businessId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT * FROM volume_discount_tiers
                 WHERE id = $1 AND business_id = $2`,
                [id, businessId]
            );

            return result.rows[0] || null;

        } catch (error) {
            log.error('Error getting tier by ID', { error: error.message, id });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update volume discount tier
     */
    static async updateTier(id, data, businessId, userId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            const existing = await client.query(
                `SELECT * FROM volume_discount_tiers WHERE id = $1 AND business_id = $2`,
                [id, businessId]
            );

            if (existing.rows.length === 0) {
                throw new Error('Volume discount tier not found');
            }

            const updates = [];
            const params = [];
            let paramCount = 1;

            const allowedFields = [
                'tier_name', 'min_quantity', 'min_amount', 'discount_percentage',
                'applies_to', 'target_category_id', 'is_active'
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
                UPDATE volume_discount_tiers
                SET ${updates.join(', ')}
                WHERE id = $${paramCount++} AND business_id = $${paramCount}
                RETURNING *
            `;

            const result = await client.query(query, params);

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'volume_tier.updated',
                resourceType: 'volume_discount_tiers',
                resourceId: id,
                oldValues: existing.rows[0],
                newValues: result.rows[0]
            });

            log.info('Volume discount tier updated', { businessId, userId, tierId: id });

            await client.query('COMMIT');
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error updating volume tier', { error: error.message, id });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Delete/deactivate volume discount tier
     */
    static async deleteTier(id, businessId, userId) {
        return this.updateTier(id, { is_active: false }, businessId, userId);
    }

    /**
     * =====================================================
     * SECTION 2: APPLICABILITY & SELECTION
     * =====================================================
     */

    /**
     * Get ALL applicable volume discount tiers for a context
     * Returns array of all tiers that match the criteria
     */
    static async getApplicableTiers(businessId, context) {
        const client = await getClient();

        try {
            const { quantity, amount, categoryId, transactionDate } = context;

            if ((!quantity || quantity <= 0) && (!amount || amount <= 0)) {
                return [];
            }

            // Get all tiers that meet quantity OR amount thresholds
            const query = `
                SELECT *
                FROM volume_discount_tiers
                WHERE business_id = $1
                    AND is_active = true
                    AND (
                        (min_quantity IS NOT NULL AND $2 >= min_quantity)
                        OR
                        (min_amount IS NOT NULL AND $3 >= min_amount)
                    )
                ORDER BY
                    -- Higher discount first
                    discount_percentage DESC,
                    -- Higher thresholds first
                    min_quantity DESC NULLS LAST,
                    min_amount DESC NULLS LAST
            `;

            const result = await client.query(query, [
                businessId,
                quantity || 0,
                amount || 0
            ]);

            if (result.rows.length === 0) {
                return [];
            }

            // Filter by category if needed
            const applicableTiers = [];
            for (const tier of result.rows) {
                if (await this._tierAppliesToCategory(tier, categoryId)) {
                    applicableTiers.push(this._normalizeTier(tier));
                }
            }

            return applicableTiers;

        } catch (error) {
            log.error('Error getting applicable tiers', { error: error.message, businessId });
            return [];
        } finally {
            client.release();
        }
    }

    /**
     * Get the BEST applicable volume discount tier
     * Returns the single best tier based on business rules
     */
    static async getBestVolumeDiscount(businessId, context) {
        const tiers = await this.getApplicableTiers(businessId, context);
        
        if (tiers.length === 0) {
            return null;
        }

        // Best tier is the one with highest discount percentage
        // (already sorted by discount_percentage DESC from query)
        return tiers[0];
    }

    /**
     * Check if tier applies to a specific category
     */
    static async _tierAppliesToCategory(tier, categoryId) {
        // If tier applies to ALL, always true
        if (tier.applies_to === 'ALL') {
            return true;
        }

        // If tier applies to CATEGORY, must match category
        if (tier.applies_to === 'CATEGORY') {
            return tier.target_category_id === categoryId;
        }

        // If tier applies to SPECIFIC (future use), implement logic
        return true;
    }

    /**
     * =====================================================
     * SECTION 3: CALCULATION
     * =====================================================
     */

    /**
     * Calculate discount for a single line item
     */
    static calculateLineDiscount(lineAmount, tier) {
        if (!lineAmount || lineAmount <= 0) {
            return 0;
        }

        return DiscountCore.calculateDiscount(
            lineAmount,
            'PERCENTAGE',
            parseFloat(tier.discount_percentage)
        );
    }

    /**
     * Calculate volume discount for multiple line items
     * Returns breakdown by item
     */
    static async calculateVolumeDiscount(businessId, lineItems) {
        if (!lineItems || lineItems.length === 0) {
            return {
                totalOriginalAmount: 0,
                totalDiscount: 0,
                finalAmount: 0,
                lineDiscounts: []
            };
        }

        // Calculate totals
        const totalOriginalAmount = lineItems.reduce((sum, item) => 
            sum + (parseFloat(item.amount) * (item.quantity || 1)), 0
        );

        const totalQuantity = lineItems.reduce((sum, item) => 
            sum + (item.quantity || 1), 0
        );

        // Find best tier for this transaction
        const context = {
            quantity: totalQuantity,
            amount: totalOriginalAmount,
            categoryId: lineItems[0]?.categoryId // Use first item's category as default
        };

        const bestTier = await this.getBestVolumeDiscount(businessId, context);

        if (!bestTier) {
            return {
                totalOriginalAmount,
                totalDiscount: 0,
                finalAmount: totalOriginalAmount,
                tier: null,
                lineDiscounts: lineItems.map(item => ({
                    ...item,
                    discount: 0,
                    finalAmount: parseFloat(item.amount) * (item.quantity || 1)
                }))
            };
        }

        // Calculate discount for each line
        const lineDiscounts = [];
        let totalDiscount = 0;

        for (const item of lineItems) {
            const itemAmount = parseFloat(item.amount) * (item.quantity || 1);
            const itemDiscount = this.calculateLineDiscount(itemAmount, bestTier);
            
            lineDiscounts.push({
                ...item,
                originalAmount: itemAmount,
                discount: itemDiscount,
                finalAmount: itemAmount - itemDiscount,
                tier_applied: bestTier.tier_name
            });

            totalDiscount += itemDiscount;
        }

        return {
            totalOriginalAmount,
            totalDiscount,
            finalAmount: totalOriginalAmount - totalDiscount,
            tier: bestTier,
            lineDiscounts
        };
    }

    /**
     * Find the best tier for a given quantity/amount combination
     */
    static _findBestTier(tiers, quantity, amount) {
        if (!tiers || tiers.length === 0) {
            return null;
        }

        // Filter tiers that meet criteria
        const qualifyingTiers = tiers.filter(tier => {
            const meetsQuantity = !tier.min_quantity || quantity >= tier.min_quantity;
            const meetsAmount = !tier.min_amount || amount >= tier.min_amount;
            return meetsQuantity && meetsAmount;
        });

        if (qualifyingTiers.length === 0) {
            return null;
        }

        // Sort by discount percentage (highest first)
        qualifyingTiers.sort((a, b) => 
            parseFloat(b.discount_percentage) - parseFloat(a.discount_percentage)
        );

        return qualifyingTiers[0];
    }

    /**
     * =====================================================
     * SECTION 4: ANALYTICS & REPORTING
     * =====================================================
     */

    /**
     * Get volume discount usage statistics
     */
    static async getVolumeDiscountStats(businessId, period) {
        const client = await getClient();

        try {
            const { startDate, endDate } = DiscountCore.getDateRange(period);

            const result = await client.query(
                `SELECT 
                    COUNT(DISTINCT da.id) as total_uses,
                    COALESCE(SUM(da.total_discount_amount), 0) as total_discount_amount,
                    AVG(da.total_discount_amount) as avg_discount_amount,
                    COUNT(DISTINCT 
                        CASE 
                            WHEN pt.customer_id IS NOT NULL THEN pt.customer_id
                            WHEN i.customer_id IS NOT NULL THEN i.customer_id
                        END
                    ) as unique_customers,
                    vdt.tier_name,
                    vdt.discount_percentage,
                    vdt.min_quantity,
                    vdt.min_amount
                 FROM discount_allocations da
                 JOIN volume_discount_tiers vdt ON da.discount_rule_id = vdt.id
                 LEFT JOIN pos_transactions pt ON da.pos_transaction_id = pt.id
                 LEFT JOIN invoices i ON da.invoice_id = i.id
                 WHERE da.business_id = $1
                    AND da.status = 'APPLIED'
                    AND da.created_at BETWEEN $2 AND $3
                 GROUP BY vdt.id, vdt.tier_name, vdt.discount_percentage, 
                          vdt.min_quantity, vdt.min_amount
                 ORDER BY total_uses DESC`,
                [businessId, startDate, endDate]
            );

            return {
                period: { startDate, endDate },
                total_tiers_used: result.rows.length,
                tiers: result.rows,
                summary: {
                    total_uses: result.rows.reduce((sum, r) => sum + parseInt(r.total_uses), 0),
                    total_discount: result.rows.reduce((sum, r) => sum + parseFloat(r.total_discount_amount), 0),
                    unique_customers: Math.max(...result.rows.map(r => parseInt(r.unique_customers)))
                }
            };

        } catch (error) {
            log.error('Error getting volume discount stats', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get most used volume discount tiers
     */
    static async getTopTiers(businessId, limit = 5) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT 
                    vdt.*,
                    COUNT(da.id) as usage_count,
                    COALESCE(SUM(da.total_discount_amount), 0) as total_discount_given
                 FROM volume_discount_tiers vdt
                 LEFT JOIN discount_allocations da ON vdt.id = da.discount_rule_id
                 WHERE vdt.business_id = $1
                    AND vdt.is_active = true
                 GROUP BY vdt.id
                 ORDER BY usage_count DESC
                 LIMIT $2`,
                [businessId, limit]
            );

            return result.rows;

        } catch (error) {
            log.error('Error getting top tiers', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 5: BULK OPERATIONS
     * =====================================================
     */

    /**
     * Bulk import volume discount tiers
     */
    static async bulkImportTiers(tiers, businessId, userId) {
        const client = await getClient();
        const results = [];

        try {
            await client.query('BEGIN');

            for (const tier of tiers) {
                try {
                    // Validate required fields
                    if (!tier.tier_name || !tier.discount_percentage) {
                        throw new Error('Tier name and discount percentage are required');
                    }

                    if (!tier.min_quantity && !tier.min_amount) {
                        throw new Error('Either min_quantity or min_amount must be specified');
                    }

                    const result = await client.query(
                        `INSERT INTO volume_discount_tiers (
                            business_id, tier_name, min_quantity, min_amount,
                            discount_percentage, applies_to, target_category_id,
                            is_active, created_at, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
                        RETURNING id, tier_name`,
                        [
                            businessId,
                            tier.tier_name,
                            tier.min_quantity || null,
                            tier.min_amount || null,
                            tier.discount_percentage,
                            tier.applies_to || 'ALL',
                            tier.target_category_id || null,
                            tier.is_active !== false
                        ]
                    );

                    results.push({
                        success: true,
                        id: result.rows[0].id,
                        tier_name: result.rows[0].tier_name
                    });

                } catch (error) {
                    results.push({
                        success: false,
                        tier_name: tier.tier_name || 'unknown',
                        error: error.message
                    });
                }
            }

            const bulkUuid = '00000000-0000-0000-0000-' + Date.now().toString().padStart(12, '0').slice(-12);
            
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'volume_tiers.bulk_imported',
                resourceType: 'volume_discount_tiers',
                resourceId: bulkUuid,
                newValues: {
                    total: tiers.length,
                    successful: results.filter(r => r.success).length,
                    failed: results.filter(r => !r.success).length
                }
            });

            await client.query('COMMIT');
            return results;

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error bulk importing tiers', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Export volume discount tiers to CSV
     */
    static async exportTiers(businessId) {
        const tiers = await this.getTiers(businessId);

        const csvRows = [];
        
        // Headers
        csvRows.push([
            'ID', 'Tier Name', 'Min Quantity', 'Min Amount', 'Discount %',
            'Applies To', 'Target Category ID', 'Is Active', 'Created At'
        ].join(','));

        // Data rows
        for (const tier of tiers) {
            csvRows.push([
                tier.id,
                `"${tier.tier_name}"`,
                tier.min_quantity || '',
                tier.min_amount || '',
                tier.discount_percentage,
                tier.applies_to,
                tier.target_category_id || '',
                tier.is_active,
                new Date(tier.created_at).toISOString()
            ].join(','));
        }

        return csvRows.join('\n');
    }

    /**
     * =====================================================
     * SECTION 6: UTILITY METHODS
     * =====================================================
     */

    /**
     * Normalize tier object for consistent output
     */
    static _normalizeTier(tier) {
        return {
            id: tier.id,
            tier_name: tier.tier_name,
            min_quantity: tier.min_quantity ? parseInt(tier.min_quantity) : null,
            min_amount: tier.min_amount ? parseFloat(tier.min_amount) : null,
            discount_percentage: parseFloat(tier.discount_percentage),
            applies_to: tier.applies_to,
            target_category_id: tier.target_category_id,
            is_active: tier.is_active,
            created_at: tier.created_at,
            updated_at: tier.updated_at,
            // Add display fields
            display_name: `${tier.tier_name} (${tier.discount_percentage}% off)`,
            requirement: tier.min_quantity ? 
                `${tier.min_quantity}+ items` : 
                `${tier.min_amount}+ amount`
        };
    }

    /**
     * Validate tier data
     */
    static validateTier(data) {
        const errors = [];

        if (!data.tier_name) {
            errors.push('Tier name is required');
        }

        if (!data.discount_percentage || data.discount_percentage <= 0) {
            errors.push('Discount percentage must be greater than 0');
        } else if (data.discount_percentage > 100) {
            errors.push('Discount percentage cannot exceed 100');
        }

        if (!data.min_quantity && !data.min_amount) {
            errors.push('Either minimum quantity or minimum amount must be specified');
        }

        if (data.min_quantity && data.min_quantity < 0) {
            errors.push('Minimum quantity cannot be negative');
        }

        if (data.min_amount && data.min_amount < 0) {
            errors.push('Minimum amount cannot be negative');
        }

        if (data.applies_to === 'CATEGORY' && !data.target_category_id) {
            errors.push('Target category ID is required when applies_to is CATEGORY');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Get tiers that will expire soon (for notifications)
     */
    static async getTiersNeedingReview(businessId, monthsThreshold = 3) {
        const client = await getClient();

        try {
            const thresholdDate = new Date();
            thresholdDate.setMonth(thresholdDate.getMonth() + monthsThreshold);

            const result = await client.query(
                `SELECT * FROM volume_discount_tiers
                 WHERE business_id = $1
                    AND is_active = true
                    AND (created_at <= NOW() - INTERVAL '6 months')
                 ORDER BY created_at ASC`,
                [businessId]
            );

            return result.rows;

        } catch (error) {
            log.error('Error getting tiers needing review', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }
}

export default VolumeDiscountService;
