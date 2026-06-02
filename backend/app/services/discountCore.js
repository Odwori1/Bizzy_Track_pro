// File: ~/Bizzy_Track_pro/backend/app/services/discountCore.js
// PURPOSE: Core discount calculations and utilities
// PHASE 10.11: PRODUCTION FIX - Stacking modes, priority sorting, governance
// DEPENDS ON: New database tables from migration 1003

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';

/**
 * DiscountCore - Core calculations and utilities for discount accounting
 *
 * This service provides the foundational calculations used by all
 * discount types in the system. It handles:
 * - Base discount calculations (percentage/fixed)
 * - Stacking logic with configurable modes
 * - Date validity checking
 * - Maximum limit enforcement
 * - Currency rounding and precision
 * - Logging and error handling
 */
export class DiscountCore {

    /**
     * =====================================================
     * SECTION 0: DATE HANDLING UTILITIES
     * =====================================================
     */

    static toUTCISOString(dateInput) {
        if (!dateInput) return new Date().toISOString();
        try {
            if (typeof dateInput === "string" && dateInput.includes("T")) return dateInput;
            if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
                return new Date(dateInput + "T00:00:00Z").toISOString();
            }
            const date = new Date(dateInput);
            return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
        } catch (error) {
            return new Date().toISOString();
        }
    }

    static toDateOnlyString(dateInput) {
        if (!dateInput) return new Date().toISOString().split("T")[0];
        try {
            const date = new Date(dateInput);
            return isNaN(date.getTime()) ? new Date().toISOString().split("T")[0] : date.toISOString().split("T")[0];
        } catch (error) {
            return new Date().toISOString().split("T")[0];
        }
    }

    static parseAsDateOnly(dateInput) {
        return this.toDateOnlyString(dateInput);
    }

    static getDateRange(period = 'month', referenceDate = new Date()) {
        const end = new Date(referenceDate);
        let start = new Date(referenceDate);
        switch (period) {
            case 'week': start.setDate(end.getDate() - 7); break;
            case 'month': start.setMonth(end.getMonth() - 1); break;
            case 'quarter': start.setMonth(end.getMonth() - 3); break;
            case 'year': start.setFullYear(end.getFullYear() - 1); break;
            case 'ytd': start = new Date(end.getFullYear(), 0, 1); break;
            default: start.setMonth(end.getMonth() - 1);
        }
        return { startDate: this.toDateOnlyString(start), endDate: this.toDateOnlyString(end) };
    }

    /**
     * =====================================================
     * SECTION 1: BASE CALCULATIONS
     * =====================================================
     */

    static calculateDiscount(amount, discountType, discountValue) {
        if (!amount || amount <= 0) {
            log.debug('Discount calculation skipped - invalid amount', { amount });
            return 0;
        }
        if (!discountValue || discountValue <= 0) {
            log.debug('Discount calculation skipped - invalid discount value', { discountValue });
            return 0;
        }

        let discountAmount = 0;
        if (discountType === 'PERCENTAGE') {
            const percentage = Math.min(discountValue, 100);
            discountAmount = (amount * percentage) / 100;
            log.debug('Percentage discount calculated', { amount, percentage, discountAmount });
        } else if (discountType === 'FIXED') {
            discountAmount = Math.min(discountValue, amount);
            log.debug('Fixed discount calculated', { amount, requestedDiscount: discountValue, discountAmount });
        } else {
            log.warn('Unknown discount type', { discountType });
            return 0;
        }
        return Math.round(discountAmount * 100) / 100;
    }

    static applyDiscount(originalAmount, discountAmount) {
        const finalAmount = Math.max(0, originalAmount - discountAmount);
        log.debug('Discount applied', { originalAmount, discountAmount, finalAmount });
        return Math.round(finalAmount * 100) / 100;
    }

    /**
     * =====================================================
     * SECTION 2: STACKING LOGIC - PRODUCTION FIX
     * =====================================================
     */

    /**
     * Check if a new discount can be stacked with existing discounts
     * PRODUCTION FIX: Added settings parameter for configurable stacking
     */
    static canStack(existingDiscounts, newDiscount, settings = {}) {
        if (!existingDiscounts || existingDiscounts.length === 0) return true;

        // Check if new discount is explicitly non-stackable
        if (newDiscount?.stackable === false) {
            log.debug('Discount cannot stack - new discount is non-stackable', {
                discountId: newDiscount.id,
                discountName: newDiscount.name
            });
            return false;
        }

        // Check if any existing discount is non-stackable
        const hasNonStackable = existingDiscounts.some(d => d?.stackable === false);
        if (hasNonStackable) {
            log.debug('Discount cannot stack - existing non-stackable discount present', {
                existingCount: existingDiscounts.length
            });
            return false;
        }

        // PRODUCTION FIX: Use settings-driven conflict types instead of hardcoded
        const conflictTypes = settings.conflictTypes || ['VOLUME', 'PROMOTIONAL', 'EARLY_PAYMENT'];

        for (const type of conflictTypes) {
            const existingOfType = existingDiscounts.filter(d => d?.rule_type === type);
            if (existingOfType.length > 0 && newDiscount?.rule_type === type) {
                log.debug('Discount cannot stack - conflicting types', {
                    type,
                    existingCount: existingOfType.length
                });
                return false;
            }
        }

        return true;
    }

    /**
     * Calculate total discount from multiple stacked discounts
     * PRODUCTION FIX: Added stackingMode parameter with governance
     * 
     * Stacking Modes:
     * - 'best_only': Apply only the single best discount
     * - 'exclusive_promo': If promo code provided, apply ONLY that promo
     * - 'exclusive_auto': Apply ONLY automatic discounts (no promo)
     * - 'cascade': Stack sequentially on remaining amount (default)
     * - 'parallel': Stack on original amount (additive)
     * - 'hybrid': Best auto + promo (if provided)
     */
    static calculateStackedDiscount(originalAmount, discounts, options = {}) {
        const {
            stackingMode = 'best_only',  // PRODUCTION FIX: Default to best_only for safety
            maxStackDepth = 1,
            maxDiscountPercentage = 50,
            promoCode = null,
            applyDiscounts = false
        } = options;

        if (!discounts || discounts.length === 0) {
            return {
                totalDiscount: 0,
                finalAmount: originalAmount,
                appliedDiscounts: [],
                remainingAmount: originalAmount,
                stackingMode
            };
        }

        // PRODUCTION FIX: Filter discounts based on stacking mode
        let eligibleDiscounts = this._filterDiscountsByMode(discounts, stackingMode, promoCode, applyDiscounts);

        if (eligibleDiscounts.length === 0) {
            return {
                totalDiscount: 0,
                finalAmount: originalAmount,
                appliedDiscounts: [],
                remainingAmount: originalAmount,
                stackingMode
            };
        }

        // PRODUCTION FIX: Sort by priority ASCENDING (lower number = higher priority)
        // This was previously sorting DESCENDING which caused wrong application order
        const sortedDiscounts = [...eligibleDiscounts].sort((a, b) =>
            (a.priority || 999) - (b.priority || 999)
        );

        log.debug('Discounts sorted by priority', {
            stackingMode,
            discountCount: sortedDiscounts.length,
            priorities: sortedDiscounts.map(d => ({ name: d.name, priority: d.priority, type: d.rule_type }))
        });

        let remainingAmount = originalAmount;
        const appliedDiscounts = [];
        let totalDiscount = 0;
        let stackDepth = 0;

        for (const discount of sortedDiscounts) {
            // Check max stack depth
            if (stackDepth >= maxStackDepth) {
                log.debug('Max stack depth reached', { maxStackDepth, currentDepth: stackDepth });
                break;
            }

            // Check if this discount can be stacked
            if (!this.canStack(appliedDiscounts, discount, options)) {
                log.debug('Discount skipped - cannot stack', {
                    discountId: discount.id,
                    discountName: discount.name
                });
                continue;
            }

            // Calculate discount
            const discountAmount = this.calculateDiscount(
                remainingAmount,
                discount.discount_type || discount.calculation_method,
                discount.discount_value
            );

            // Apply max discount limit
            const finalDiscountAmount = this.applyMaxDiscount(
                discountAmount,
                discount.max_discount_amount,
                remainingAmount
            );

            if (finalDiscountAmount > 0) {
                appliedDiscounts.push({
                    ...discount,
                    calculatedDiscount: finalDiscountAmount
                });

                totalDiscount += finalDiscountAmount;
                remainingAmount -= finalDiscountAmount;
                stackDepth++;

                log.debug('Discount applied', {
                    discountId: discount.id,
                    name: discount.name,
                    type: discount.rule_type,
                    amount: finalDiscountAmount,
                    remainingAmount
                });
            }
        }

        // PRODUCTION FIX: Enforce max discount percentage
        const maxAllowedDiscount = (originalAmount * maxDiscountPercentage) / 100;
        if (totalDiscount > maxAllowedDiscount) {
            log.warn('Total discount exceeds maximum allowed, capping', {
                totalDiscount,
                maxAllowedDiscount,
                maxDiscountPercentage
            });

            // Cap the last discount to meet the limit
            const excess = totalDiscount - maxAllowedDiscount;
            if (appliedDiscounts.length > 0) {
                appliedDiscounts[appliedDiscounts.length - 1].calculatedDiscount -= excess;
                totalDiscount = maxAllowedDiscount;
                remainingAmount = originalAmount - totalDiscount;
            }
        }

        return {
            totalDiscount: Math.round(totalDiscount * 100) / 100,
            finalAmount: Math.max(0, originalAmount - totalDiscount),
            appliedDiscounts,
            remainingAmount: Math.max(0, remainingAmount),
            stackingMode
        };
    }

    /**
     * PRODUCTION FIX: Filter discounts based on stacking mode
     */
    static _filterDiscountsByMode(discounts, stackingMode, promoCode, applyDiscounts) {
        const promotionalDiscounts = discounts.filter(d => d.rule_type === 'PROMOTIONAL');
        const autoDiscounts = discounts.filter(d => 
            ['VOLUME', 'CATEGORY', 'PRICING_RULE', 'EARLY_PAYMENT'].includes(d.rule_type)
        );

        switch (stackingMode) {
            case 'best_only':
                // Return only the single best discount
                return [this._findBestDiscount(discounts)];

            case 'exclusive_promo':
                // If promo code provided, return ONLY matching promo
                // If no promo match, return empty (error handled upstream)
                if (promoCode) {
                    const matchingPromo = promotionalDiscounts.find(d => 
                        d.promo_code?.toUpperCase() === promoCode.toUpperCase()
                    );
                    return matchingPromo ? [matchingPromo] : [];
                }
                // No promo code, return best auto discount
                return [this._findBestDiscount(autoDiscounts)];

            case 'exclusive_auto':
                // Return ONLY automatic discounts, no promos
                return autoDiscounts;

            case 'cascade':
                // Return all discounts (stack sequentially)
                return discounts;

            case 'parallel':
                // Return all discounts (stack on original amount)
                return discounts;

            case 'hybrid':
                // Best auto discount + matching promo (if provided)
                const bestAuto = this._findBestDiscount(autoDiscounts);
                const matchingPromo = promoCode ? promotionalDiscounts.find(d => 
                    d.promo_code?.toUpperCase() === promoCode.toUpperCase()
                ) : null;

                const hybridDiscounts = [];
                if (bestAuto) hybridDiscounts.push(bestAuto);
                if (matchingPromo) hybridDiscounts.push(matchingPromo);
                return hybridDiscounts;

            default:
                log.warn('Unknown stacking mode, defaulting to best_only', { stackingMode });
                return [this._findBestDiscount(discounts)];
        }
    }

    /**
     * Find the single best discount from a list
     */
    static _findBestDiscount(discounts) {
        if (!discounts || discounts.length === 0) return null;

        return discounts.reduce((best, current) => {
            const bestValue = parseFloat(best.discount_value || 0);
            const currentValue = parseFloat(current.discount_value || 0);
            return currentValue > bestValue ? current : best;
        });
    }

    /**
     * =====================================================
     * SECTION 3: LIMIT ENFORCEMENT
     * =====================================================
     */

    static applyMaxDiscount(calculatedDiscount, maxAmount, originalAmount) {
        let finalDiscount = calculatedDiscount;
        if (maxAmount && maxAmount > 0) {
            finalDiscount = Math.min(finalDiscount, maxAmount);
            log.debug('Max amount limit applied', { originalDiscount: calculatedDiscount, maxAmount, finalDiscount });
        }
        finalDiscount = Math.min(finalDiscount, originalAmount);
        return Math.round(finalDiscount * 100) / 100;
    }

    static requiresApproval(discountPercentage, threshold) {
        if (!discountPercentage || discountPercentage <= 0) return false;
        if (!threshold || threshold <= 0) return false;
        const requires = discountPercentage >= threshold;
        log.debug('Approval check', { discountPercentage, threshold, requiresApproval: requires });
        return requires;
    }

    /**
     * =====================================================
     * SECTION 4: VALIDATION
     * =====================================================
     */

    static isValid(validFrom, validTo) {
        const today = this.toDateOnlyString(new Date());
        const todayDate = new Date(today);
        const fromDateStr = validFrom ? this.toDateOnlyString(validFrom) : null;
        const toDateStr = validTo ? this.toDateOnlyString(validTo) : null;
        const fromDate = fromDateStr ? new Date(fromDateStr) : null;
        const toDate = toDateStr ? new Date(toDateStr) : null;

        if (fromDate && fromDate > todayDate) {
            log.debug('Discount not yet valid', { validFrom: fromDateStr, today });
            return false;
        }
        if (toDate && toDate < todayDate) {
            log.debug('Discount expired', { validTo: toDateStr, today });
            return false;
        }
        return true;
    }

    static validateDiscountValue(discountType, discountValue) {
        if (!discountValue) return { valid: false, reason: 'Discount value is required' };
        if (discountValue <= 0) return { valid: false, reason: 'Discount value must be positive' };
        if (discountType === 'PERCENTAGE' && discountValue > 100) {
            return { valid: false, reason: 'Percentage discount cannot exceed 100%' };
        }
        return { valid: true };
    }

    /**
     * =====================================================
     * SECTION 5: DATABASE UTILITIES
     * =====================================================
     */

    static async getDiscountRule(ruleId, businessId) {
        const client = await getClient();
        try {
            const result = await client.query(
                `SELECT * FROM discount_rules WHERE id = $1 AND business_id = $2 AND is_active = true`,
                [ruleId, businessId]
            );
            if (result.rows.length > 0) return result.rows[0];
            const categoryResult = await client.query(
                `SELECT * FROM category_discount_rules WHERE id = $1 AND business_id = $2`,
                [ruleId, businessId]
            );
            return categoryResult.rows[0] || null;
        } catch (error) {
            log.error('Error fetching discount rule', { ruleId, businessId, error: error.message });
            return null;
        } finally {
            client.release();
        }
    }

    static async logCalculation(calculation) {
        log.info('Discount calculation performed', {
            timestamp: this.toUTCISOString(new Date()),
            ...calculation
        });
    }

    /**
     * =====================================================
     * SECTION 6: FORMATTING
     * =====================================================
     */

    static formatDiscount(amount, currency = 'UGX') {
        if (!amount || amount <= 0) return `${currency} 0.00`;
        return `${currency} ${amount.toFixed(2)}`;
    }

    static formatPercentage(percentage) {
        if (!percentage || percentage <= 0) return '0.0%';
        return `${percentage.toFixed(1)}%`;
    }
}

export default DiscountCore;
