// File: ~/Bizzy_Track_pro/backend/app/services/discountCore.js
// PURPOSE: Core discount calculations and utilities
// PHASE 10: DAY 1 - Foundation for Discount Accounting System
// DEPENDS ON: New database tables from migration 1003

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';

/**
 * DiscountCore - Core calculations and utilities for discount accounting
 *
 * This service provides the foundational calculations used by all
 * discount types in the system. It handles:
 * - Base discount calculations (percentage/fixed)
 * - Stacking logic and conflict resolution
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

    /**
     * Convert any date input to UTC ISO string for database storage
     * (Matches taxDashboardService pattern)
     */
    static toUTCISOString(dateInput) {
        if (!dateInput) {
            return new Date().toISOString();
        }

        try {
            // If it's already a string in ISO format, return as-is
            if (typeof dateInput === "string" && dateInput.includes("T")) {
                return dateInput;
            }

            // If it's a date-only string (YYYY-MM-DD), add time component
            if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
                return new Date(dateInput + "T00:00:00Z").toISOString();
            }

            // Otherwise, create Date object and convert to ISO
            const date = new Date(dateInput);
            if (isNaN(date.getTime())) {
                return new Date().toISOString();
            }
            return date.toISOString();

        } catch (error) {
            return new Date().toISOString();
        }
    }

    /**
     * Convert any date input to date-only string (YYYY-MM-DD)
     * (Matches taxDashboardService pattern for tax calculations)
     */
    static toDateOnlyString(dateInput) {
        if (!dateInput) {
            return new Date().toISOString().split("T")[0];
        }

        try {
            const date = new Date(dateInput);
            if (isNaN(date.getTime())) {
                return new Date().toISOString().split("T")[0];
            }
            return date.toISOString().split("T")[0];
        } catch (error) {
            return new Date().toISOString().split("T")[0];
        }
    }

    /**
     * Parse date to YYYY-MM-DD format (legacy method - kept for backward compatibility)
     */
    static parseAsDateOnly(dateInput) {
        return this.toDateOnlyString(dateInput);
    }

    /**
     * Get date range based on period
     */
    static getDateRange(period = 'month', referenceDate = new Date()) {
        const end = new Date(referenceDate);
        let start = new Date(referenceDate);

        switch (period) {
            case 'week':
                start.setDate(end.getDate() - 7);
                break;
            case 'month':
                start.setMonth(end.getMonth() - 1);
                break;
            case 'quarter':
                start.setMonth(end.getMonth() - 3);
                break;
            case 'year':
                start.setFullYear(end.getFullYear() - 1);
                break;
            case 'ytd':
                start = new Date(end.getFullYear(), 0, 1); // Jan 1st
                break;
            default:
                start.setMonth(end.getMonth() - 1); // Default to month
        }

        return {
            startDate: this.toDateOnlyString(start),
            endDate: this.toDateOnlyString(end)
        };
    }

    /**
     * =====================================================
     * SECTION 1: BASE CALCULATIONS
     * =====================================================
     */

    /**
     * Calculate discount amount based on type and value
     *
     * @param {number} amount - Original amount to apply discount to
     * @param {string} discountType - 'PERCENTAGE' or 'FIXED'
     * @param {number} discountValue - Percentage (0-100) or fixed amount
     * @returns {number} Calculated discount amount
     */
    static calculateDiscount(amount, discountType, discountValue) {
        // Input validation
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
            // Percentage discount (e.g., 15% = 0.15)
            const percentage = Math.min(discountValue, 100); // Cap at 100%
            discountAmount = (amount * percentage) / 100;
            log.debug('Percentage discount calculated', {
                amount,
                percentage,
                discountAmount
            });
        } else if (discountType === 'FIXED') {
            // Fixed amount discount (can't exceed original amount)
            discountAmount = Math.min(discountValue, amount);
            log.debug('Fixed discount calculated', {
                amount,
                requestedDiscount: discountValue,
                discountAmount
            });
        } else {
            log.warn('Unknown discount type', { discountType });
            return 0;
        }

        // Round to 2 decimal places (currency standard)
        return Math.round(discountAmount * 100) / 100;
    }

    /**
     * Calculate discounted amount after applying discount
     *
     * @param {number} originalAmount - Original amount before discount
     * @param {number} discountAmount - Calculated discount amount
     * @returns {number} Final amount after discount
     */
    static applyDiscount(originalAmount, discountAmount) {
        const finalAmount = Math.max(0, originalAmount - discountAmount);

        log.debug('Discount applied', {
            originalAmount,
            discountAmount,
            finalAmount
        });

        return Math.round(finalAmount * 100) / 100;
    }

    /**
     * =====================================================
     * SECTION 2: STACKING LOGIC
     * =====================================================
     */

    /**
     * Check if a new discount can be stacked with existing discounts
     *
     * @param {Array} existingDiscounts - Currently applied discounts
     * @param {Object} newDiscount - Proposed discount to add
     * @returns {boolean} True if discounts can stack
     */
    static canStack(existingDiscounts, newDiscount) {
        // If no existing discounts, definitely can stack
        if (!existingDiscounts || existingDiscounts.length === 0) {
            return true;
        }

        // Check if new discount is stackable
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

        // Check for conflicting rule types (e.g., two volume discounts)
        const conflictTypes = ['VOLUME', 'PROMOTIONAL', 'EARLY_PAYMENT'];
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
     * Ensures total discount doesn't exceed original amount
     *
     * @param {number} originalAmount - Original amount before any discounts
     * @param {Array} discounts - Array of discount objects to apply
     * @returns {Object} Stacked discount result
     */
    static calculateStackedDiscount(originalAmount, discounts) {
        if (!discounts || discounts.length === 0) {
            return {
                totalDiscount: 0,
                finalAmount: originalAmount,
                appliedDiscounts: [],
                remainingAmount: originalAmount
            };
        }

        let remainingAmount = originalAmount;
        const appliedDiscounts = [];
        let totalDiscount = 0;

        // Sort by priority (higher priority first)
        const sortedDiscounts = [...discounts].sort((a, b) =>
            (b.priority || 0) - (a.priority || 0)
        );

        for (const discount of sortedDiscounts) {
            // Check if this discount can be applied
            if (!this.canStack(appliedDiscounts, discount)) {
                log.debug('Discount skipped - cannot stack', {
                    discountId: discount.id,
                    discountName: discount.name
                });
                continue;
            }

            // Calculate discount on remaining amount
            const discountAmount = this.calculateDiscount(
                remainingAmount,
                discount.discount_type || discount.calculation_method,
                discount.discount_value
            );

            // Apply max discount limit if specified
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
            }
        }

        return {
            totalDiscount: Math.round(totalDiscount * 100) / 100,
            finalAmount: Math.max(0, originalAmount - totalDiscount),
            appliedDiscounts,
            remainingAmount: Math.max(0, remainingAmount)
        };
    }

    /**
     * =====================================================
     * SECTION 3: LIMIT ENFORCEMENT
     * =====================================================
     */

    /**
     * Apply maximum discount limits
     *
     * @param {number} calculatedDiscount - Initially calculated discount
     * @param {number} maxAmount - Maximum allowed discount amount
     * @param {number} originalAmount - Original amount (for absolute limits)
     * @returns {number} Discount amount capped by limits
     */
    static applyMaxDiscount(calculatedDiscount, maxAmount, originalAmount) {
        let finalDiscount = calculatedDiscount;

        // Apply maximum amount limit
        if (maxAmount && maxAmount > 0) {
            finalDiscount = Math.min(finalDiscount, maxAmount);
            log.debug('Max amount limit applied', {
                originalDiscount: calculatedDiscount,
                maxAmount,
                finalDiscount
            });
        }

        // Can never discount more than the original amount
        finalDiscount = Math.min(finalDiscount, originalAmount);

        return Math.round(finalDiscount * 100) / 100;
    }

    /**
     * Check if a discount exceeds approval threshold
     *
     * @param {number} discountPercentage - Discount percentage (0-100)
     * @param {number} threshold - Approval threshold percentage
     * @returns {boolean} True if approval required
     */
    static requiresApproval(discountPercentage, threshold) {
        // Validate inputs
        if (!discountPercentage || discountPercentage <= 0) return false;
        if (!threshold || threshold <= 0) return false;

        const requires = discountPercentage >= threshold;

        log.debug('Approval check', {
            discountPercentage,
            threshold,
            requiresApproval: requires
        });

        return requires;
    }

    /**
     * =====================================================
     * SECTION 4: VALIDATION
     * =====================================================
     */

    /**
     * Validate discount dates against current date
     * Uses toDateOnlyString for consistent date comparison
     *
     * @param {Date|string} validFrom - Start date
     * @param {Date|string} validTo - End date
     * @returns {boolean} True if discount is currently valid
     */
    static isValid(validFrom, validTo) {
        const today = this.toDateOnlyString(new Date());
        const todayDate = new Date(today);

        // Parse dates to date-only strings for comparison
        const fromDateStr = validFrom ? this.toDateOnlyString(validFrom) : null;
        const toDateStr = validTo ? this.toDateOnlyString(validTo) : null;

        const fromDate = fromDateStr ? new Date(fromDateStr) : null;
        const toDate = toDateStr ? new Date(toDateStr) : null;

        // Check valid_from
        if (fromDate && fromDate > todayDate) {
            log.debug('Discount not yet valid', {
                validFrom: fromDateStr,
                today: today
            });
            return false;
        }

        // Check valid_to
        if (toDate && toDate < todayDate) {
            log.debug('Discount expired', {
                validTo: toDateStr,
                today: today
            });
            return false;
        }

        return true;
    }

    /**
     * Validate discount value based on type
     *
     * @param {string} discountType - 'PERCENTAGE' or 'FIXED'
     * @param {number} discountValue - Value to validate
     * @returns {Object} Validation result
     */
    static validateDiscountValue(discountType, discountValue) {
        // Check for null/undefined
        if (!discountValue) {
            return {
                valid: false,
                reason: 'Discount value is required'
            };
        }

        // Check positive
        if (discountValue <= 0) {
            return {
                valid: false,
                reason: 'Discount value must be positive'
            };
        }

        // Type-specific validation
        if (discountType === 'PERCENTAGE') {
            if (discountValue > 100) {
                return {
                    valid: false,
                    reason: 'Percentage discount cannot exceed 100%'
                };
            }
        }

        return { valid: true };
    }

    /**
     * =====================================================
     * SECTION 5: DATABASE UTILITIES
     * =====================================================
     */

    /**
     * Get discount rule by ID from database
     *
     * @param {string} ruleId - Discount rule ID
     * @param {string} businessId - Business ID
     * @returns {Promise<Object>} Discount rule object
     */
    static async getDiscountRule(ruleId, businessId) {
        const client = await getClient();

        try {
            // Check in discount_rules table first
            const result = await client.query(
                `SELECT * FROM discount_rules
                 WHERE id = $1 AND business_id = $2 AND is_active = true`,
                [ruleId, businessId]
            );

            if (result.rows.length > 0) {
                return result.rows[0];
            }

            // Fall back to category_discount_rules
            const categoryResult = await client.query(
                `SELECT * FROM category_discount_rules
                 WHERE id = $1 AND business_id = $2`,
                [ruleId, businessId]
            );

            return categoryResult.rows[0] || null;

        } catch (error) {
            log.error('Error fetching discount rule', {
                ruleId,
                businessId,
                error: error.message
            });
            return null;
        } finally {
            client.release();
        }
    }

    /**
     * Log discount calculation for audit trail
     *
     * @param {Object} calculation - Calculation details
     */
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

    /**
     * Format discount amount for display
     *
     * @param {number} amount - Discount amount
     * @param {string} currency - Currency code (e.g., 'UGX')
     * @returns {string} Formatted discount string
     */
    static formatDiscount(amount, currency = 'UGX') {
        if (!amount || amount <= 0) return `${currency} 0.00`;
        return `${currency} ${amount.toFixed(2)}`;
    }

    /**
     * Format discount percentage for display
     *
     * @param {number} percentage - Discount percentage
     * @returns {string} Formatted percentage string
     */
    static formatPercentage(percentage) {
        if (!percentage || percentage <= 0) return '0.0%';
        return `${percentage.toFixed(1)}%`;
    }
}

export default DiscountCore;
