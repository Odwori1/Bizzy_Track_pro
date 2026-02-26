// File: ~/Bizzy_Track_pro/backend/app/services/discountRules.js
// PURPOSE: Dynamically evaluate which discounts apply to a transaction
// PHASE 10.1: FINAL WORKING VERSION - All tests passing
// DEPENDS ON: discountCore.js, database tables

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { DiscountCore } from './discountCore.js';

export class DiscountRules {

    /**
     * =====================================================
     * SECTION 1: MAIN ENTRY POINT
     * =====================================================
     */

    /**
     * Get all applicable discounts for a transaction
     */
    static async getApplicableDiscounts(businessId, context) {
        const startTime = Date.now();

        try {
            log.debug('Getting applicable discounts', {
                businessId,
                customerId: context.customerId,
                amount: context.amount,
                quantity: context.quantity,
                promoCode: context.promoCode
            });

            // Parse date once for all date-based queries
            const transactionDate = DiscountCore.parseAsDateOnly(context.transactionDate || new Date());

            // Create a fresh context with parsed date
            const evalContext = {
                ...context,
                transactionDate
            };

            // Get discounts from all sources in parallel
            const [
                promotions,
                volumeDiscounts,
                earlyPaymentTerms,
                categoryDiscounts,
                pricingRules
            ] = await Promise.allSettled([
                this.getActivePromotions(businessId, evalContext),
                this.getVolumeDiscounts(businessId, evalContext),
                this.getCustomerPaymentTerms(businessId, evalContext),
                this.getCategoryDiscounts(businessId, evalContext),
                this.getPricingRules(businessId, evalContext)
            ]);

            // Collect successful results
            const allDiscounts = [];

            if (promotions.status === 'fulfilled' && promotions.value) {
                if (Array.isArray(promotions.value)) {
                    allDiscounts.push(...promotions.value);
                } else if (promotions.value) {
                    allDiscounts.push(promotions.value);
                }
            }

            if (volumeDiscounts.status === 'fulfilled' && volumeDiscounts.value) {
                if (Array.isArray(volumeDiscounts.value)) {
                    allDiscounts.push(...volumeDiscounts.value);
                } else {
                    allDiscounts.push(volumeDiscounts.value);
                }
            }

            if (earlyPaymentTerms.status === 'fulfilled' && earlyPaymentTerms.value) {
                allDiscounts.push(earlyPaymentTerms.value);
            }

            if (categoryDiscounts.status === 'fulfilled' && categoryDiscounts.value) {
                if (Array.isArray(categoryDiscounts.value)) {
                    allDiscounts.push(...categoryDiscounts.value);
                }
            }

            if (pricingRules.status === 'fulfilled' && pricingRules.value) {
                if (Array.isArray(pricingRules.value)) {
                    allDiscounts.push(...pricingRules.value);
                }
            }

            // Apply filters
            const validDiscounts = this.filterExpired(allDiscounts, transactionDate);
            const qualifiedDiscounts = this.filterByMinimum(validDiscounts, evalContext);
            const sortedDiscounts = this.sortByType(qualifiedDiscounts);

            log.info('Discount rules evaluation complete', {
                businessId,
                totalFound: allDiscounts.length,
                validCount: validDiscounts.length,
                qualifiedCount: qualifiedDiscounts.length,
                finalCount: sortedDiscounts.length,
                duration: Date.now() - startTime
            });

            return sortedDiscounts;

        } catch (error) {
            log.error('Error in getApplicableDiscounts', {
                businessId,
                error: error.message,
                stack: error.stack
            });
            return [];
        }
    }

    /**
     * =====================================================
     * SECTION 2: PROMOTIONAL DISCOUNTS - FIXED
     * =====================================================
     */

    /**
     * Get active promotional discounts
     */
    static async getActivePromotions(businessId, context) {
        const client = await getClient();

        try {
            const { transactionDate, promoCode, customerId, amount } = context;

            let query = `
                SELECT 
                    id,
                    promo_code,
                    description,
                    discount_type,
                    discount_value,
                    min_purchase,
                    max_uses,
                    times_used,
                    per_customer_limit,
                    valid_from,
                    valid_to,
                    is_active,
                    'PROMOTIONAL' as rule_type
                FROM promotional_discounts
                WHERE business_id = $1
                    AND is_active = true
                    AND (valid_from IS NULL OR valid_from::date <= $2::date)
                    AND (valid_to IS NULL OR valid_to::date >= $2::date)
            `;

            const params = [businessId, transactionDate];

            if (promoCode) {
                query += ` AND promo_code = $${params.length + 1}`;
                params.push(promoCode);
            }

            // Check global usage limits
            query += ` AND (max_uses IS NULL OR times_used < max_uses)`;

            // Check minimum purchase
            if (amount) {
                query += ` AND (min_purchase IS NULL OR $${params.length + 1} >= min_purchase)`;
                params.push(amount);
            }

            const result = await client.query(query, params);

            // Further filter by customer limits if needed
            const promotions = [];
            for (const row of result.rows) {
                if (row.per_customer_limit && customerId) {
                    const customerUsage = await this._getCustomerPromoUsage(
                        businessId,
                        row.id,
                        customerId
                    );
                    if (customerUsage >= row.per_customer_limit) {
                        continue;
                    }
                }
                promotions.push(this.normalizeDiscount(row, 'PROMOTIONAL'));
            }

            return promotions;

        } catch (error) {
            log.error('Error getting active promotions', { 
                businessId,
                error: error.message 
            });
            return [];
        } finally {
            client.release();
        }
    }

    /**
     * Get customer's usage of a specific promotion
     */
    static async _getCustomerPromoUsage(businessId, promoId, customerId) {
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
     * =====================================================
     * SECTION 3: VOLUME DISCOUNTS - FIXED
     * =====================================================
     */

    /**
     * Get applicable volume discount tiers
     * FIXED: Now returns ALL matching tiers, not just one
     */
    static async getVolumeDiscounts(businessId, context) {
        const client = await getClient();

        try {
            const { quantity, amount, categoryId, transactionDate } = context;

            if ((!quantity || quantity <= 0) && (!amount || amount <= 0)) {
                return [];
            }

            // Find ALL matching tiers
            const query = `
                SELECT 
                    id,
                    tier_name,
                    min_quantity,
                    min_amount,
                    discount_percentage,
                    applies_to,
                    target_category_id,
                    is_active,
                    created_at,
                    updated_at,
                    'PERCENTAGE' as discount_type,
                    discount_percentage as discount_value,
                    'VOLUME' as rule_type
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
                    -- Higher quantity threshold first
                    min_quantity DESC NULLS LAST,
                    -- Higher amount threshold first
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
            const validTiers = [];
            for (const tier of result.rows) {
                // Check if tier applies to this category
                if (tier.applies_to === 'CATEGORY' &&
                    tier.target_category_id &&
                    tier.target_category_id !== categoryId) {
                    continue;
                }
                validTiers.push(this.normalizeDiscount(tier, 'VOLUME'));
            }

            return validTiers;

        } catch (error) {
            log.error('Error getting volume discounts', { 
                businessId,
                error: error.message 
            });
            return [];
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 4: EARLY PAYMENT TERMS
     * =====================================================
     */

    /**
     * Get early payment terms for a customer
     */
    static async getCustomerPaymentTerms(businessId, context) {
        const client = await getClient();

        try {
            const { customerId, transactionDate } = context;

            if (!customerId) return null;

            // Get the best active terms for the business
            const query = `
                SELECT 
                    id,
                    term_name,
                    discount_percentage,
                    discount_days,
                    net_days,
                    is_active,
                    created_at,
                    updated_at,
                    'PERCENTAGE' as discount_type,
                    discount_percentage as discount_value,
                    'EARLY_PAYMENT' as rule_type
                FROM early_payment_terms
                WHERE business_id = $1
                    AND is_active = true
                ORDER BY discount_percentage DESC
                LIMIT 1
            `;

            const result = await client.query(query, [businessId]);

            if (result.rows.length === 0) {
                return null;
            }

            return this.normalizeDiscount(result.rows[0], 'EARLY_PAYMENT');

        } catch (error) {
            log.error('Error getting customer payment terms', {
                businessId,
                customerId: context.customerId,
                error: error.message
            });
            return null;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 5: CATEGORY DISCOUNTS - FIXED
     * =====================================================
     */

    /**
     * Get category-based discount rules
     */
    static async getCategoryDiscounts(businessId, context) {
        const client = await getClient();

        try {
            const { serviceId, categoryId, amount, transactionDate } = context;

            if (!categoryId && !serviceId) return [];

            const query = `
                SELECT 
                    id,
                    category_id,
                    service_id,
                    discount_type,
                    discount_value,
                    min_amount,
                    max_discount,
                    is_active,
                    valid_from,
                    valid_until,
                    created_by,
                    created_at,
                    updated_at,
                    'CATEGORY' as rule_type
                FROM category_discount_rules
                WHERE business_id = $1
                    AND is_active = true
                    AND (category_id = $2 OR service_id = $3)
                    AND (valid_from IS NULL OR valid_from::date <= $4::date)
                    AND (valid_until IS NULL OR valid_until::date >= $4::date)
                    AND (min_amount IS NULL OR $5 >= min_amount)
                ORDER BY 
                    CASE 
                        WHEN discount_type = 'percentage' THEN discount_value
                        ELSE 0 
                    END DESC,
                    created_at DESC
            `;

            const result = await client.query(query, [
                businessId, 
                categoryId, 
                serviceId,
                transactionDate,
                amount || 0
            ]);

            const discounts = [];
            for (const row of result.rows) {
                // Apply max_discount if needed
                if (row.max_discount && row.discount_value > row.max_discount) {
                    row.discount_value = row.max_discount;
                }
                discounts.push(this.normalizeDiscount(row, 'CATEGORY'));
            }

            return discounts;

        } catch (error) {
            log.error('Error getting category discounts', {
                businessId,
                error: error.message
            });
            return [];
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 6: PRICING RULES
     * =====================================================
     */

    /**
     * Get pricing rules from existing system
     */
    static async getPricingRules(businessId, context) {
        const client = await getClient();

        try {
            const { customerId, serviceId, customerCategoryId, quantity, transactionDate } = context;

            const query = `
                SELECT 
                    id,
                    name,
                    description,
                    rule_type,
                    conditions,
                    adjustment_type,
                    adjustment_value,
                    target_entity,
                    target_id,
                    priority,
                    is_active,
                    valid_from,
                    valid_until,
                    created_at,
                    updated_at
                FROM pricing_rules
                WHERE business_id = $1
                    AND is_active = true
                    AND (valid_from IS NULL OR valid_from::date <= $2::date)
                    AND (valid_until IS NULL OR valid_until::date >= $2::date)
                ORDER BY priority DESC NULLS LAST, created_at DESC
            `;

            const result = await client.query(query, [businessId, transactionDate]);

            const applicableRules = [];

            for (const rule of result.rows) {
                if (this._doesPricingRuleApply(rule, context)) {
                    // Convert to discount format
                    const discount = {
                        id: rule.id,
                        name: rule.name,
                        description: rule.description,
                        rule_type: 'PRICING_RULE',
                        discount_type: rule.adjustment_type === 'percentage' ? 'PERCENTAGE' : 
                                       rule.adjustment_type === 'fixed' ? 'FIXED' : 'PERCENTAGE',
                        discount_value: parseFloat(rule.adjustment_value),
                        source: 'pricing_rules',
                        valid_from: rule.valid_from,
                        valid_to: rule.valid_until,
                        priority: rule.priority,
                        metadata: {
                            rule_type: rule.rule_type,
                            adjustment_type: rule.adjustment_type,
                            target_entity: rule.target_entity,
                            target_id: rule.target_id
                        }
                    };
                    applicableRules.push(discount);
                }
            }

            return applicableRules;

        } catch (error) {
            log.error('Error getting pricing rules', { 
                businessId,
                error: error.message 
            });
            return [];
        } finally {
            client.release();
        }
    }

    /**
     * Check if a pricing rule applies to the current context
     */
    static _doesPricingRuleApply(rule, context) {
        const conditions = rule.conditions || {};

        // Customer category rule
        if (rule.rule_type === 'customer_category') {
            if (conditions.customer_category_id && 
                conditions.customer_category_id !== context.customerCategoryId) {
                return false;
            }
        }

        // Quantity rule
        if (rule.rule_type === 'quantity') {
            if (conditions.min_quantity && context.quantity < conditions.min_quantity) {
                return false;
            }
            if (conditions.max_quantity && context.quantity > conditions.max_quantity) {
                return false;
            }
            if (conditions.min_amount && context.amount < conditions.min_amount) {
                return false;
            }
        }

        // Time-based rule
        if (rule.rule_type === 'time_based') {
            const now = new Date();
            if (conditions.day_of_week && conditions.day_of_week.length > 0) {
                if (!conditions.day_of_week.includes(now.getDay())) {
                    return false;
                }
            }
            if (conditions.hour_start && conditions.hour_end) {
                const hour = now.getHours();
                if (hour < conditions.hour_start || hour > conditions.hour_end) {
                    return false;
                }
            }
        }

        // Target entity checks
        if (rule.target_entity === 'service' && 
            rule.target_id && 
            rule.target_id !== context.serviceId) {
            return false;
        }

        if (rule.target_entity === 'customer' && 
            rule.target_id && 
            rule.target_id !== context.customerId) {
            return false;
        }

        if (rule.target_entity === 'category' && 
            rule.target_id && 
            rule.target_id !== context.categoryId) {
            return false;
        }

        return true;
    }

    /**
     * =====================================================
     * SECTION 7: PROCESSING METHODS - FIXED
     * =====================================================
     */

    /**
     * Sort discounts by type priority
     * FIXED: Now handles empty arrays properly
     */
    static sortByType(discounts) {
        if (!discounts || !Array.isArray(discounts) || discounts.length === 0) {
            return [];
        }

        // Define type priority (lower number = higher priority)
        const typePriority = {
            'EARLY_PAYMENT': 10,  // Highest priority - affects payment terms
            'VOLUME': 20,          // Volume discounts next
            'CATEGORY': 30,        // Category-specific discounts
            'PROMOTIONAL': 40,     // Promotional codes
            'PRICING_RULE': 50     // General pricing rules
        };

        return [...discounts].sort((a, b) => {
            // First by type priority
            const aPriority = typePriority[a.rule_type] || 999;
            const bPriority = typePriority[b.rule_type] || 999;
            
            if (aPriority !== bPriority) {
                return aPriority - bPriority;
            }

            // Then by discount value (higher first for same type)
            const aValue = parseFloat(a.discount_value || 0);
            const bValue = parseFloat(b.discount_value || 0);
            
            return bValue - aValue;
        });
    }

    /**
     * Filter out expired discounts
     * FIXED: Now correctly handles date comparisons
     */
    static filterExpired(discounts, referenceDate) {
        if (!discounts || !Array.isArray(discounts) || discounts.length === 0) {
            return [];
        }

        return discounts.filter(discount => {
            // If no dates, it's always valid
            if (!discount.valid_from && !discount.valid_to) {
                return true;
            }

            // Parse dates for comparison
            const today = new Date(referenceDate);
            today.setHours(0, 0, 0, 0);

            if (discount.valid_from) {
                const fromDate = new Date(discount.valid_from);
                fromDate.setHours(0, 0, 0, 0);
                if (fromDate > today) {
                    return false;
                }
            }

            if (discount.valid_to) {
                const toDate = new Date(discount.valid_to);
                toDate.setHours(0, 0, 0, 0);
                if (toDate < today) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Filter discounts by minimum purchase requirements
     * FIXED: Now properly checks all minimum conditions
     */
    static filterByMinimum(discounts, context) {
        if (!discounts || !Array.isArray(discounts) || discounts.length === 0) {
            return [];
        }

        const { amount, quantity } = context;

        return discounts.filter(discount => {
            // Check min_purchase (promotional_discounts)
            if (discount.min_purchase && amount < parseFloat(discount.min_purchase)) {
                return false;
            }

            // Check min_amount (category_discount_rules, volume_discount_tiers)
            if (discount.min_amount && amount < parseFloat(discount.min_amount)) {
                return false;
            }

            // Check min_quantity (volume_discount_tiers)
            if (discount.min_quantity && quantity < parseInt(discount.min_quantity)) {
                return false;
            }

            // Check conditions object
            if (discount.conditions) {
                if (discount.conditions.min_amount && amount < discount.conditions.min_amount) {
                    return false;
                }
                if (discount.conditions.min_quantity && quantity < discount.conditions.min_quantity) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * =====================================================
     * SECTION 8: NORMALIZATION
     * =====================================================
     */

    /**
     * Normalize discount from database row to standard object
     */
    static normalizeDiscount(dbRow, sourceType) {
        const normalized = {
            id: dbRow.id,
            rule_type: sourceType,
            discount_type: dbRow.discount_type?.toUpperCase() || 'PERCENTAGE',
            discount_value: parseFloat(dbRow.discount_value || 0),
            valid_from: dbRow.valid_from,
            valid_to: dbRow.valid_to || dbRow.valid_until,
            created_at: dbRow.created_at,
            metadata: {}
        };

        // Add source-specific fields
        switch (sourceType) {
            case 'PROMOTIONAL':
                normalized.promo_code = dbRow.promo_code;
                normalized.name = dbRow.promo_code;
                normalized.description = dbRow.description;
                normalized.min_purchase = dbRow.min_purchase ? parseFloat(dbRow.min_purchase) : null;
                normalized.per_customer_limit = dbRow.per_customer_limit;
                normalized.max_uses = dbRow.max_uses;
                normalized.times_used = dbRow.times_used;
                break;

            case 'VOLUME':
                normalized.name = dbRow.tier_name;
                normalized.tier_name = dbRow.tier_name;
                normalized.min_quantity = dbRow.min_quantity;
                normalized.min_amount = dbRow.min_amount ? parseFloat(dbRow.min_amount) : null;
                normalized.applies_to = dbRow.applies_to;
                normalized.target_category_id = dbRow.target_category_id;
                break;

            case 'EARLY_PAYMENT':
                normalized.name = dbRow.term_name;
                normalized.term_name = dbRow.term_name;
                normalized.discount_percentage = parseFloat(dbRow.discount_percentage);
                normalized.discount_days = dbRow.discount_days;
                normalized.net_days = dbRow.net_days;
                break;

            case 'CATEGORY':
                // Get service name if available for better display
                normalized.name = `Category Discount`;
                normalized.category_id = dbRow.category_id;
                normalized.service_id = dbRow.service_id;
                normalized.min_amount = dbRow.min_amount ? parseFloat(dbRow.min_amount) : null;
                normalized.max_discount = dbRow.max_discount ? parseFloat(dbRow.max_discount) : null;
                normalized.valid_from = dbRow.valid_from;
                normalized.valid_to = dbRow.valid_until;
                break;

            case 'PRICING_RULE':
                normalized.name = dbRow.name;
                normalized.description = dbRow.description;
                normalized.priority = dbRow.priority;
                break;
        }

        return normalized;
    }

    /**
     * =====================================================
     * SECTION 9: UTILITY METHODS
     * =====================================================
     */

    /**
     * Build context object from transaction data
     */
    static buildContextFromTransaction(transactionData) {
        return {
            businessId: transactionData.business_id,
            customerId: transactionData.customer_id,
            customerCategoryId: transactionData.customer_category_id,
            serviceId: transactionData.service_id,
            categoryId: transactionData.category_id,
            quantity: transactionData.quantity || 1,
            amount: transactionData.amount || transactionData.subtotal || 0,
            transactionDate: transactionData.transaction_date || transactionData.date || new Date(),
            promoCode: transactionData.promo_code,
            locationId: transactionData.location_id,
            userId: transactionData.user_id
        };
    }

    /**
     * Check if there's any data in discount tables
     */
    static async checkDiscountData(businessId) {
        const client = await getClient();

        try {
            const results = {};

            const promo = await client.query(
                'SELECT COUNT(*) FROM promotional_discounts WHERE business_id = $1',
                [businessId]
            );
            results.promotional_discounts = parseInt(promo.rows[0].count);

            const volume = await client.query(
                'SELECT COUNT(*) FROM volume_discount_tiers WHERE business_id = $1',
                [businessId]
            );
            results.volume_discount_tiers = parseInt(volume.rows[0].count);

            const early = await client.query(
                'SELECT COUNT(*) FROM early_payment_terms WHERE business_id = $1',
                [businessId]
            );
            results.early_payment_terms = parseInt(early.rows[0].count);

            const category = await client.query(
                'SELECT COUNT(*) FROM category_discount_rules WHERE business_id = $1',
                [businessId]
            );
            results.category_discount_rules = parseInt(category.rows[0].count);

            const pricing = await client.query(
                'SELECT COUNT(*) FROM pricing_rules WHERE business_id = $1',
                [businessId]
            );
            results.pricing_rules = parseInt(pricing.rows[0].count);

            log.info('Discount data check', { businessId, results });
            return results;

        } catch (error) {
            log.error('Error checking discount data', { error: error.message });
            return null;
        } finally {
            client.release();
        }
    }
}

export default DiscountRules;
