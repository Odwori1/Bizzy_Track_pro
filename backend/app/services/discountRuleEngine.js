// File: ~/Bizzy_Track_pro/backend/app/services/discountRuleEngine.js
// PURPOSE: Master orchestrator that combines all discount services
// PHASE 10.11: PRODUCTION FIX - Quantity propagation and discount discovery fixes
// UPDATED: Dynamic approval threshold from business settings
// PRODUCTION FIX: Added promo validation and error handling

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';
import { DiscountCore } from './discountCore.js';
import { DiscountRules } from './discountRules.js';
import { PromotionalDiscountService } from './promotionalDiscountService.js';
import { VolumeDiscountService } from './volumeDiscountService.js';
import { EarlyPaymentService } from './earlyPaymentService.js';
import { DiscountAllocationService } from './discountAllocationService.js';
import { DiscountAccountingService } from './discountAccountingService.js';
import { DiscountAnalyticsService } from './discountAnalyticsService.js';
import { DiscountSettingsService } from './discountSettingsService.js';
import { UUIDService } from './uuidService.js';

export class DiscountRuleEngine {

    /**
     * =====================================================
     * SECTION 1: MASTER CALCULATION
     * =====================================================
     */

    /**
     * MAIN ENTRY POINT - Calculate final price with all discounts
     * PRODUCTION FIX: Added promo validation and error handling
     */
    static async calculateFinalPrice(context) {
        const {
            businessId,
            userId,
            transactionDate = new Date(),
            client: externalClient,
            promoCode,
            promoValidation
        } = context;

        const startTime = Date.now();
        const shouldUseExternalClient = !!externalClient;
        const dbClient = externalClient || await getClient();

        try {
            if (!shouldUseExternalClient) {
                await dbClient.query('BEGIN');
            }

            log.info('Starting discount calculation', {
                businessId,
                customerId: context.customerId,
                amount: context.amount || context.subtotal,
                promoCode: context.promoCode,
                applyDiscounts: context.applyDiscounts
            });

            // PRODUCTION FIX: Check promo validation result from upstream
            if (promoValidation && !promoValidation.valid) {
                log.warn('Promo validation failed upstream, returning error', {
                    promoCode,
                    reason: promoValidation.reason
                });

                return {
                    success: false,
                    error: 'INVALID_PROMO_CODE',
                    errorMessage: promoValidation.reason,
                    originalAmount: context.amount || context.subtotal || 0,
                    totalDiscount: 0,
                    finalAmount: context.amount || context.subtotal || 0,
                    appliedDiscounts: [],
                    requiresApproval: false
                };
            }

            // Step 1: Validate input
            this.validateContext(context);

            // Step 2: Check cache for identical calculations (only if no external client)
            if (!shouldUseExternalClient) {
                const cacheKey = this._generateCacheKey(context);
                const cached = await this.getCachedResult(cacheKey);
                if (cached) {
                    log.debug('Returning cached result', { cacheKey });
                    return cached;
                }
            }

            // Step 3: Discover all applicable discounts
            const applicableDiscounts = await this.discoverDiscounts(context);

            // PRODUCTION FIX: Check for promo error markers in discovered discounts
            const promoError = applicableDiscounts.find(d => d._error && d._errorType === 'PROMO_NOT_FOUND');
            if (promoError) {
                log.error('Promo code not found in discount rules', { 
                    promoCode: promoError._promoCode,
                    businessId 
                });

                return {
                    success: false,
                    error: 'PROMO_NOT_FOUND',
                    errorMessage: `Promo code '${promoError._promoCode}' not found or inactive`,
                    originalAmount: context.amount || context.subtotal || 0,
                    totalDiscount: 0,
                    finalAmount: context.amount || context.subtotal || 0,
                    appliedDiscounts: [],
                    requiresApproval: false
                };
            }

            // Step 4: Check if any discounts require approval
            const approvalRequired = await this.checkApprovalRequired(applicableDiscounts, context);

            // Step 5: If approval required and not pre-approved, return approval request
            if (approvalRequired && !context.preApproved) {
                const approvalThreshold = await this._getApprovalThreshold(businessId);

                // Create approval request
                const approvalRequest = await this._createApprovalRequest(
                    context,
                    applicableDiscounts,
                    userId,
                    businessId,
                    dbClient
                );

                return {
                    success: false,
                    requiresApproval: true,
                    approval_id: approvalRequest.approvalId,
                    message: 'This discount requires approval',
                    discounts: applicableDiscounts,
                    approvalThreshold
                };
            }

            // Step 6: Get stacking configuration from settings
            const stackingConfig = await DiscountSettingsService.getStackingConfig(businessId);

            // PRODUCTION FIX: Determine stacking mode based on context
            let stackingMode = stackingConfig.stackingMode;

            // If promo code provided and valid, use exclusive_promo mode
            if (promoCode && promoValidation?.valid) {
                stackingMode = 'exclusive_promo';
                log.info('Using exclusive promo mode', { promoCode, stackingMode });
            }
            // If apply_discounts=true without promo, use exclusive_auto mode
            else if (context.applyDiscounts && !promoCode) {
                stackingMode = 'exclusive_auto';
                log.info('Using exclusive auto mode', { stackingMode });
            }

            // Step 7: Calculate stacked discount with configured mode
            const originalAmount = context.amount || context.subtotal || 0;
            const stackedResult = DiscountCore.calculateStackedDiscount(
                originalAmount,
                applicableDiscounts,
                {
                    stackingMode,
                    maxStackDepth: stackingConfig.maxStackDepth,
                    maxDiscountPercentage: stackingConfig.maxDiscountPercentage,
                    promoCode,
                    applyDiscounts: context.applyDiscounts || false
                }
            );

            // Step 8: Create allocation if discounts applied and not preview mode
            let allocation = null;
            if (stackedResult.appliedDiscounts.length > 0 &&
                context.createAllocation !== false &&
                context.previewMode !== true) {
                allocation = await this._createAllocationFromResult(
                    stackedResult,
                    context,
                    userId,
                    businessId,
                    dbClient
                );
            }

            // Step 9: Create journal entries if needed
            let accounting = null;
            if (allocation && context.createJournalEntries !== false) {
                accounting = await this._createJournalEntriesFromAllocation(
                    allocation,
                    stackedResult,
                    context,
                    userId,
                    businessId,
                    dbClient
                );
            }

            // Step 10: Update analytics (async - don't await)
            if (stackedResult.totalDiscount > 0) {
                this._updateAnalyticsAsync(stackedResult, context, businessId).catch(error => {
                    log.error('Error updating analytics', { error: error.message });
                });
            }

            // Step 11: Prepare final result
            const result = {
                success: true,
                originalAmount,
                totalDiscount: stackedResult.totalDiscount,
                finalAmount: stackedResult.finalAmount,
                appliedDiscounts: stackedResult.appliedDiscounts.map(d => ({
                    id: d.id,
                    type: d.rule_type,
                    name: d.name || d.promo_code || d.tier_name || d.term_name || 'Discount',
                    amount: d.calculatedDiscount,
                    percentage: originalAmount > 0 ? (d.calculatedDiscount / originalAmount) * 100 : 0,
                    description: d.description
                })),
                requiresApproval: false,
                calculationTime: Date.now() - startTime,
                stackingMode: stackedResult.stackingMode
            };

            // Add allocation if created
            if (allocation) {
                result.allocation = {
                    id: allocation.id,
                    number: allocation.allocation_number,
                    method: allocation.allocation_method
                };
            }

            // Add accounting if created
            if (accounting) {
                result.accounting = {
                    journalEntryId: accounting.journal_id,
                    entryNumber: accounting.reference_number
                };
            }

            // Cache the result (only for preview mode or no allocation, and no external client)
            if (!shouldUseExternalClient && (context.previewMode || !allocation)) {
                const cacheKey = this._generateCacheKey(context);
                await this.cacheResult(cacheKey, result, 300);
            }

            if (!shouldUseExternalClient) {
                await dbClient.query('COMMIT');
            }

            log.info('Discount calculation complete', {
                businessId,
                originalAmount,
                totalDiscount: stackedResult.totalDiscount,
                finalAmount: stackedResult.finalAmount,
                discountCount: stackedResult.appliedDiscounts.length,
                stackingMode: stackedResult.stackingMode,
                duration: Date.now() - startTime
            });

            return result;

        } catch (error) {
            if (!shouldUseExternalClient) {
                await dbClient.query('ROLLBACK');
            }
            log.error('Error in calculateFinalPrice', {
                error: error.message,
                stack: error.stack,
                context
            });
            throw error;
        } finally {
            if (!shouldUseExternalClient) {
                dbClient.release();
            }
        }
    }

    /**
     * Create approval request
     */
    static async _createApprovalRequest(context, discounts, userId, businessId, client) {
        const { amount, customerId, promoCode, transactionId, transactionType } = context;

        const totalDiscount = discounts.reduce((sum, d) => sum + parseFloat(d.discount_value || 0), 0);
        const discountPercentage = amount > 0 ? (totalDiscount / amount) * 100 : 0;
        const threshold = await this._getApprovalThreshold(businessId);

        // Build approval data
        const approvalData = {
            business_id: businessId,
            requested_by: userId,
            original_amount: amount,
            requested_discount: totalDiscount,
            discount_percentage: discountPercentage,
            reason: promoCode ? `Promo code: ${promoCode}` : 'Discount approval requested',
            status: 'pending',
            requires_approval: discountPercentage > threshold,
            approval_threshold: threshold
        };

        // Add customer info
        if (customerId) {
            approvalData.reason = `${approvalData.reason} - Customer: ${customerId}`;
        }

        // Add transaction reference
        if (transactionType === 'POS' && transactionId) {
            approvalData.pos_transaction_id = transactionId;
        } else if (transactionType === 'INVOICE' && transactionId) {
            approvalData.invoice_id = transactionId;
        }

        // Insert approval
        const columns = Object.keys(approvalData).join(', ');
        const values = Object.values(approvalData);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

        const approvalResult = await client.query(
            `INSERT INTO discount_approvals (${columns}, created_at, updated_at)
             VALUES (${placeholders}, NOW(), NOW())
             RETURNING id`,
            values
        );

        const approvalId = approvalResult.rows[0].id;

        // Store discount details
        await client.query(
            `UPDATE discount_approvals
             SET approval_notes = $1
             WHERE id = $2`,
            [JSON.stringify(discounts.map(d => ({
                type: d.rule_type,
                id: d.id,
                name: d.name || d.promo_code || d.tier_name || d.term_name,
                value: d.discount_value
            }))), approvalId]
        );

        return { approvalId };
    }

    /**
     * Quick calculation without allocation or accounting
     */
    static async quickCalculate(context) {
        return await this.calculateFinalPrice({
            ...context,
            createAllocation: false,
            createJournalEntries: false,
            previewMode: true
        });
    }

    /**
     * Preview discounts without applying them
     */
    static async previewDiscounts(context) {
        try {
            const discounts = await this.discoverDiscounts(context);
            const originalAmount = context.amount || context.subtotal || 0;
            const previews = [];

            for (const discount of discounts) {
                const discountAmount = DiscountCore.calculateDiscount(
                    originalAmount,
                    discount.discount_type,
                    discount.discount_value
                );

                previews.push({
                    id: discount.id,
                    type: discount.rule_type,
                    name: discount.name || discount.promo_code || discount.tier_name || discount.term_name,
                    discountAmount,
                    finalAmount: originalAmount - discountAmount,
                    percentage: originalAmount > 0 ? (discountAmount / originalAmount) * 100 : 0,
                    stackable: discount.stackable !== false,
                    priority: discount.priority || this._getTypePriority(discount.rule_type)
                });
            }

            // Sort by priority
            previews.sort((a, b) => a.priority - b.priority);

            return {
                success: true,
                originalAmount,
                discounts: previews,
                totalPossibleDiscount: previews.reduce((sum, d) => sum + d.discountAmount, 0),
                bestSingleDiscount: previews.length > 0 ? previews[0] : null
            };

        } catch (error) {
            log.error('Error in previewDiscounts', { error: error.message });
            throw error;
        }
    }

    /**
     * Find the best combination of discounts
     */
    static async findBestCombination(context) {
        try {
            const discounts = await this.discoverDiscounts(context);
            const originalAmount = context.amount || context.subtotal || 0;

            // Group by type (can't stack same type)
            const byType = {};
            discounts.forEach(d => {
                const type = d.rule_type;
                if (!byType[type]) byType[type] = [];
                byType[type].push(d);
            });

            // Take best from each type
            const combination = [];
            for (const type in byType) {
                const sorted = byType[type].sort((a, b) => {
                    const aVal = parseFloat(a.discount_value || 0);
                    const bVal = parseFloat(b.discount_value || 0);
                    return bVal - aVal;
                });

                if (sorted.length > 0) {
                    combination.push(sorted[0]);
                }
            }

            // Calculate stacked discount
            const stackedResult = DiscountCore.calculateStackedDiscount(originalAmount, combination);

            return {
                success: true,
                originalAmount,
                bestCombination: combination.map(d => ({
                    id: d.id,
                    type: d.rule_type,
                    name: d.name || d.promo_code || d.tier_name || d.term_name,
                    value: d.discount_value,
                    typeLabel: d.discount_type
                })),
                totalDiscount: stackedResult.totalDiscount,
                finalAmount: stackedResult.finalAmount,
                savings: originalAmount > 0 ? ((stackedResult.totalDiscount / originalAmount) * 100).toFixed(2) + '%' : '0%'
            };

        } catch (error) {
            log.error('Error in findBestCombination', { error: error.message });
            throw error;
        }
    }

    /**
     * =====================================================
     * SECTION 2: DISCOVERY & ORCHESTRATION
     * =====================================================
     */

    /**
     * Discover all applicable discounts from all sources
     * FIX PHASE 1: Properly propagate quantity and applyDiscounts from context
     */
    static async discoverDiscounts(context) {
        const { businessId, customerId, amount, quantity, promoCode, transactionDate } = context;

        // FIX: Build ruleContext with explicit quantity and applyDiscounts
        // Ensure quantity is properly extracted from context or computed from items
        let effectiveQuantity = quantity;
        if (!effectiveQuantity && context.items && Array.isArray(context.items)) {
            effectiveQuantity = context.items.reduce((sum, item) =>
                sum + (parseInt(item.quantity) || 1), 0);
        }

        const ruleContext = {
            customerId,
            amount: amount || context.subtotal || 0,
            quantity: effectiveQuantity || 1,  // ← FIX: Use computed or passed quantity
            promoCode,
            transactionDate: transactionDate || new Date(),
            categoryId: context.categoryId,
            serviceId: context.serviceId,
            applyDiscounts: context.applyDiscounts || false,  // ← FIX: Pass through
            items: context.items || []  // ← Pass items array for defensive calc
        };

        log.debug('Discovering discounts with context', {
            businessId,
            customerId,
            amount: ruleContext.amount,
            quantity: ruleContext.quantity,
            promoCode: ruleContext.promoCode,
            applyDiscounts: ruleContext.applyDiscounts,
            itemCount: ruleContext.items?.length
        });

        const discounts = await DiscountRules.getApplicableDiscounts(businessId, ruleContext);

        // Enrich with names
        const enrichedDiscounts = discounts.map(discount => {
            const enriched = { ...discount };

            if (discount.rule_type === 'PROMOTIONAL' && discount.promo_code) {
                enriched.name = discount.promo_code;
            } else if (discount.rule_type === 'VOLUME' && discount.tier_name) {
                enriched.name = discount.tier_name;
            } else if (discount.rule_type === 'EARLY_PAYMENT' && discount.term_name) {
                enriched.name = discount.term_name;
            } else if (discount.rule_type === 'CATEGORY') {
                enriched.name = 'Category Discount';
            }

            enriched.priority = this._getTypePriority(discount.rule_type);
            return enriched;
        });

        log.info('Discounts discovered', {
            businessId,
            totalFound: enrichedDiscounts.length,
            types: enrichedDiscounts.map(d => d.rule_type),
            names: enrichedDiscounts.map(d => d.name)
        });

        return enrichedDiscounts;
    }

    /**
     * Get all applicable discounts for a transaction
     * FIX PHASE 1: Defensive quantity calculation from items array
     */
    static async getApplicableDiscounts(businessId, context) {
        const startTime = Date.now();

        try {
            // FIX: Defensive quantity calculation from items array
            if ((!context.quantity || context.quantity <= 0) && context.items && Array.isArray(context.items)) {
                context.quantity = context.items.reduce((sum, item) =>
                    sum + (parseInt(item.quantity) || 1), 0);
                log.debug('Computed quantity from items array', {
                    computedQuantity: context.quantity,
                    itemCount: context.items.length
                });
            }

            log.debug('Getting applicable discounts', {
                businessId,
                customerId: context.customerId,
                amount: context.amount,
                quantity: context.quantity,  // ← Now shows actual quantity
                promoCode: context.promoCode,
                applyDiscounts: context.applyDiscounts
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
                discountTypes: sortedDiscounts.map(d => d.rule_type),
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
     * Get applicable volume discount tiers
     * FIXED: Now properly receives and uses quantity from context
     * FIXED: Enhanced logging to trace why discounts are found or not found
     */
    static async getVolumeDiscounts(businessId, context) {
        const client = await getClient();

        try {
            const { quantity, amount, categoryId, transactionDate } = context;

            // FIX: Better validation - accept quantity OR amount
            const effectiveQuantity = parseInt(quantity) || 0;
            const effectiveAmount = parseFloat(amount) || 0;

            log.debug('Evaluating volume discounts', {
                businessId,
                quantity: effectiveQuantity,
                amount: effectiveAmount,
                categoryId,
                transactionDate
            });

            if (effectiveQuantity <= 0 && effectiveAmount <= 0) {
                log.debug('Volume discounts skipped - no quantity or amount', {
                    quantity: effectiveQuantity,
                    amount: effectiveAmount
                });
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
                effectiveQuantity,
                effectiveAmount
            ]);

            log.debug('Volume discount query result', {
                businessId,
                quantity: effectiveQuantity,
                amount: effectiveAmount,
                tiersFound: result.rows.length,
                tierNames: result.rows.map(r => r.tier_name),
                tierMinQuantities: result.rows.map(r => r.min_quantity)
            });

            if (result.rows.length === 0) {
                log.info('No volume discount tiers match criteria', {
                    businessId,
                    quantity: effectiveQuantity,
                    amount: effectiveAmount,
                    reason: 'No tiers meet min_quantity or min_amount thresholds'
                });
                return [];
            }

            // Filter by category if needed
            const validTiers = [];
            for (const tier of result.rows) {
                // Check if tier applies to this category
                if (tier.applies_to === 'CATEGORY' &&
                    tier.target_category_id &&
                    tier.target_category_id !== categoryId) {
                    log.debug('Volume tier filtered out - category mismatch', {
                        tierName: tier.tier_name,
                        appliesTo: tier.applies_to,
                        targetCategoryId: tier.target_category_id,
                        itemCategoryId: categoryId
                    });
                    continue;
                }

                // FIX: Check applies_to = 'PRODUCTS' vs item type
                if (tier.applies_to === 'PRODUCTS' && context.itemType && context.itemType !== 'product') {
                    log.debug('Volume tier filtered out - product type mismatch', {
                        tierName: tier.tier_name,
                        appliesTo: tier.applies_to,
                        itemType: context.itemType
                    });
                    continue;
                }

                // FIX: Check applies_to = 'SERVICES' vs item type
                if (tier.applies_to === 'SERVICES' && context.itemType && context.itemType !== 'service') {
                    log.debug('Volume tier filtered out - service type mismatch', {
                        tierName: tier.tier_name,
                        appliesTo: tier.applies_to,
                        itemType: context.itemType
                    });
                    continue;
                }

                validTiers.push(this.normalizeDiscount(tier, 'VOLUME'));
            }

            log.info('Volume discounts evaluated', {
                businessId,
                tiersQueried: result.rows.length,
                tiersValid: validTiers.length,
                tierNames: validTiers.map(t => t.tier_name)
            });

            return validTiers;

        } catch (error) {
            log.error('Error getting volume discounts', {
                businessId,
                error: error.message,
                stack: error.stack
            });
            return [];
        } finally {
            client.release();
        }
    }

    /**
     * Get active promotions
     */
    static async getActivePromotions(businessId, context) {
        const client = await getClient();

        try {
            const { promoCode, amount, transactionDate } = context;

            if (!promoCode) {
                return [];
            }

            const query = `
                SELECT 
                    pd.id,
                    pd.promo_code,
                    pd.name,
                    pd.discount_type,
                    pd.discount_value,
                    pd.min_purchase_amount,
                    pd.start_date,
                    pd.end_date,
                    pd.usage_limit,
                    pd.used_count,
                    pd.is_active,
                    'PROMOTIONAL' as rule_type
                FROM promotional_discounts pd
                WHERE pd.business_id = $1
                    AND pd.promo_code = $2
                    AND pd.is_active = true
                    AND pd.start_date <= $3
                    AND (pd.end_date IS NULL OR pd.end_date >= $3)
                    AND (pd.usage_limit IS NULL OR pd.used_count < pd.usage_limit)
                    AND (pd.min_purchase_amount IS NULL OR $4 >= pd.min_purchase_amount)
            `;

            const result = await client.query(query, [
                businessId,
                promoCode,
                transactionDate || new Date(),
                amount || 0
            ]);

            if (result.rows.length === 0) {
                log.info('No active promo found', { businessId, promoCode });
                return [];
            }

            return result.rows.map(row => this.normalizeDiscount(row, 'PROMOTIONAL'));

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
     * Get customer payment terms
     */
    static async getCustomerPaymentTerms(businessId, context) {
        const client = await getClient();

        try {
            const { customerId, transactionDate } = context;

            if (!customerId) {
                return null;
            }

            const query = `
                SELECT 
                    pet.id,
                    pet.term_name,
                    pet.discount_percentage,
                    pet.days_until_due,
                    pet.is_active,
                    'EARLY_PAYMENT' as rule_type,
                    'PERCENTAGE' as discount_type,
                    pet.discount_percentage as discount_value
                FROM payment_terms pet
                JOIN customers c ON c.payment_term_id = pet.id
                WHERE c.id = $1
                    AND c.business_id = $2
                    AND pet.is_active = true
                    AND (pet.effective_from IS NULL OR pet.effective_from <= $3)
                    AND (pet.effective_to IS NULL OR pet.effective_to >= $3)
                LIMIT 1
            `;

            const result = await client.query(query, [
                customerId,
                businessId,
                transactionDate || new Date()
            ]);

            if (result.rows.length === 0) {
                return null;
            }

            return this.normalizeDiscount(result.rows[0], 'EARLY_PAYMENT');

        } catch (error) {
            log.error('Error getting customer payment terms', {
                businessId,
                error: error.message
            });
            return null;
        } finally {
            client.release();
        }
    }

    /**
     * Get category discounts
     */
    static async getCategoryDiscounts(businessId, context) {
        const client = await getClient();

        try {
            const { categoryId, transactionDate } = context;

            if (!categoryId) {
                return [];
            }

            const query = `
                SELECT 
                    cd.id,
                    cd.name,
                    cd.discount_percentage,
                    cd.start_date,
                    cd.end_date,
                    cd.is_active,
                    'CATEGORY' as rule_type,
                    'PERCENTAGE' as discount_type,
                    cd.discount_percentage as discount_value
                FROM category_discounts cd
                WHERE cd.business_id = $1
                    AND cd.category_id = $2
                    AND cd.is_active = true
                    AND cd.start_date <= $3
                    AND (cd.end_date IS NULL OR cd.end_date >= $3)
            `;

            const result = await client.query(query, [
                businessId,
                categoryId,
                transactionDate || new Date()
            ]);

            return result.rows.map(row => this.normalizeDiscount(row, 'CATEGORY'));

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
     * Get pricing rules
     */
    static async getPricingRules(businessId, context) {
        // Placeholder for future pricing rules
        return [];
    }

    /**
     * Normalize discount to common format
     */
    static normalizeDiscount(discount, ruleType) {
        return {
            ...discount,
            rule_type: ruleType,
            discount_type: discount.discount_type || 'PERCENTAGE',
            discount_value: parseFloat(discount.discount_value || discount.discount_percentage || 0),
            stackable: discount.stackable !== false
        };
    }

    /**
     * Filter expired discounts
     */
    static filterExpired(discounts, transactionDate) {
        return discounts.filter(discount => {
            if (discount.end_date && new Date(discount.end_date) < transactionDate) {
                return false;
            }
            if (discount.start_date && new Date(discount.start_date) > transactionDate) {
                return false;
            }
            return true;
        });
    }

    /**
     * Filter by minimum requirements
     */
    static filterByMinimum(discounts, context) {
        const { amount, quantity } = context;

        return discounts.filter(discount => {
            if (discount.min_purchase_amount && parseFloat(amount) < parseFloat(discount.min_purchase_amount)) {
                return false;
            }
            if (discount.min_quantity && parseInt(quantity) < parseInt(discount.min_quantity)) {
                return false;
            }
            return true;
        });
    }

    /**
     * Sort discounts by type priority
     */
    static sortByType(discounts) {
        return this.prioritizeDiscounts(discounts);
    }

    /**
     * Sort discounts by priority
     */
    static prioritizeDiscounts(discounts) {
        if (!discounts || !Array.isArray(discounts)) return [];

        return [...discounts].sort((a, b) => {
            const aPriority = a.priority || this._getTypePriority(a.rule_type);
            const bPriority = b.priority || this._getTypePriority(b.rule_type);
            return aPriority - bPriority;
        });
    }

    /**
     * Get priority for discount type
     */
    static _getTypePriority(type) {
        const priorities = {
            'EARLY_PAYMENT': 10,
            'VOLUME': 20,
            'CATEGORY': 30,
            'PROMOTIONAL': 40,
            'PRICING_RULE': 50
        };
        return priorities[type] || 999;
    }

    /**
     * =====================================================
     * SECTION 3: APPROVAL WORKFLOW - NOW DYNAMIC
     * =====================================================
     */

    /**
     * Check if any discount requires approval
     * UPDATED: Uses dynamic threshold from business settings
     */
    static async checkApprovalRequired(discounts, context) {
        if (!discounts || discounts.length === 0) return false;

        const { businessId, amount } = context;

        // Get dynamic threshold from business settings
        const threshold = await DiscountSettingsService.getApprovalThreshold(businessId);

        for (const discount of discounts) {
            const discountValue = parseFloat(discount.discount_value || 0);

            if (discount.discount_type === 'PERCENTAGE') {
                if (DiscountCore.requiresApproval(discountValue, threshold)) {
                    log.debug('Discount requires approval', {
                        discountId: discount.id,
                        percentage: discountValue,
                        threshold
                    });
                    return true;
                }
            } else if (discount.discount_type === 'FIXED') {
                const totalAmount = parseFloat(amount || context.subtotal || 0);
                if (totalAmount > 0) {
                    const percentage = (discountValue / totalAmount) * 100;
                    if (DiscountCore.requiresApproval(percentage, threshold)) {
                        log.debug('Fixed discount requires approval', {
                            discountId: discount.id,
                            amount: discountValue,
                            percentage,
                            threshold
                        });
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Get approval threshold for a business
     * UPDATED: Fetches from database instead of hardcoded
     */
    static async _getApprovalThreshold(businessId) {
        return await DiscountSettingsService.getApprovalThreshold(businessId);
    }

    /**
     * Submit discounts for approval
     * UPDATED: Uses dynamic threshold in approval record
     */
    static async submitForApproval(context, userId) {
        const { businessId, amount, items, promoCode, transactionId, transactionType, customerId } = context;
        const client = await getClient();

        try {
            await client.query('BEGIN');

            // Get applicable discounts
            const discounts = await this.discoverDiscounts(context);
            const totalDiscount = discounts.reduce((sum, d) => sum + parseFloat(d.discount_value || 0), 0);
            const discountPercentage = amount > 0 ? (totalDiscount / amount) * 100 : 0;

            // Get dynamic threshold
            const threshold = await DiscountSettingsService.getApprovalThreshold(businessId);

            // Build approval data
            const approvalData = {
                business_id: businessId,
                requested_by: userId,
                original_amount: amount,
                requested_discount: totalDiscount,
                discount_percentage: discountPercentage,
                reason: promoCode ? `Promo code: ${promoCode}` : 'Discount approval requested',
                status: 'pending',
                requires_approval: discountPercentage > threshold,
                approval_threshold: threshold
            };

            if (customerId) {
                approvalData.reason = `${approvalData.reason} - Customer: ${customerId}`;
            }

            if (transactionType === 'POS' && transactionId) {
                approvalData.pos_transaction_id = transactionId;
            } else if (transactionType === 'INVOICE' && transactionId) {
                approvalData.invoice_id = transactionId;
            }

            // Insert approval
            const columns = Object.keys(approvalData).join(', ');
            const values = Object.values(approvalData);
            const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

            const approvalResult = await client.query(
                `INSERT INTO discount_approvals (${columns}, created_at, updated_at)
                 VALUES (${placeholders}, NOW(), NOW())
                 RETURNING id`,
                values
            );

            const approvalId = approvalResult.rows[0].id;

            // Store discount details
            if (discounts.length > 0) {
                await client.query(
                    `UPDATE discount_approvals
                     SET approval_notes = $1
                     WHERE id = $2`,
                    [JSON.stringify(discounts.map(d => ({
                        type: d.rule_type,
                        id: d.id,
                        name: d.name || d.promo_code || d.tier_name || d.term_name,
                        value: d.discount_value
                    }))), approvalId]
                );
            }

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'discount_approval.requested',
                resourceType: 'discount_approvals',
                resourceId: approvalId,
                newValues: {
                    amount,
                    discount: totalDiscount,
                    percentage: discountPercentage,
                    threshold
                }
            });

            await client.query('COMMIT');

            return {
                success: true,
                approvalId,
                status: 'pending',
                message: 'Discount approval request submitted',
                requiresApproval: discountPercentage > threshold,
                threshold
            };

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error submitting for approval', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Process an approval decision
     */
    static async processApproval(approvalId, decision, approverId, reason = null) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            const status = decision === 'APPROVE' ? 'approved' : 'rejected';

            const result = await client.query(
                `UPDATE discount_approvals
                 SET status = $1,
                     approved_by = $2,
                     approved_at = NOW(),
                     rejection_reason = $3,
                     updated_at = NOW()
                 WHERE id = $4
                 RETURNING *`,
                [status, approverId, reason, approvalId]
            );

            if (result.rows.length === 0) {
                throw new Error('Approval not found');
            }

            const approval = result.rows[0];

            await auditLogger.logAction({
                businessId: approval.business_id,
                userId: approverId,
                action: `discount_approval.${decision.toLowerCase()}`,
                resourceType: 'discount_approvals',
                resourceId: approvalId,
                newValues: { status, reason }
            });

            await client.query('COMMIT');

            return {
                success: true,
                approvalId,
                status,
                message: `Discount ${decision.toLowerCase()}d`
            };

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error processing approval', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get approval status
     */
    static async getApprovalStatus(approvalId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT * FROM discount_approvals WHERE id = $1`,
                [approvalId]
            );

            return result.rows[0] || null;

        } catch (error) {
            log.error('Error getting approval status', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 4: ALLOCATION HELPERS - FIXED
     * =====================================================
     */

    /**
     * Create allocation from calculation result
     * UPDATED: Accepts client parameter and validates line items
     */
    static async _createAllocationFromResult(stackedResult, context, userId, businessId, client = null) {
        const { items, transactionId, transactionType } = context;

        if (!items || items.length === 0) {
            log.warn('Cannot create allocation: No items provided', { transactionId });
            return null;
        }

        // Ensure all line items have valid UUIDs
        const validItems = items.filter(item => item.id && UUIDService.isValidUUID(item.id));

        if (validItems.length === 0) {
            log.error('Cannot create allocation: No valid line item IDs', {
                transactionId,
                items: items.map(i => ({ id: i.id, type: i.type }))
            });
            return null;
        }

        log.debug('Creating allocation with valid items', {
            transactionId,
            validItemCount: validItems.length,
            validItemIds: validItems.map(i => i.id)
        });

        // Prepare line items for allocation
        const lineItems = validItems.map(item => ({
            id: item.id,
            type: item.type || 'service',
            amount: item.amount,
            quantity: item.quantity || 1
        }));

        // Use pro-rata allocation
        const allocations = DiscountAllocationService.allocateByLineAmount(
            lineItems,
            stackedResult.totalDiscount
        );

        // Get discount IDs from applied discounts
        const volumeDiscount = stackedResult.appliedDiscounts.find(d => d.rule_type === 'VOLUME');
        const earlyDiscount = stackedResult.appliedDiscounts.find(d => d.rule_type === 'EARLY_PAYMENT');
        const categoryDiscount = stackedResult.appliedDiscounts.find(d => d.rule_type === 'CATEGORY');
        const promoDiscount = stackedResult.appliedDiscounts.find(d => d.rule_type === 'PROMOTIONAL');

        // Create allocation data
        const allocationData = {
            [transactionType === 'POS' ? 'pos_transaction_id' : 'invoice_id']: transactionId,
            total_discount_amount: stackedResult.totalDiscount,
            allocation_method: 'PRO_RATA_AMOUNT',
            status: 'APPLIED',
            applied_at: new Date(),
            lines: allocations.map(alloc => ({
                ...alloc,
                line_item_id: alloc.line_item_id // This must match the actual database ID
            }))
        };

        // Add discount rule ID (required by constraint)
        const ruleDiscount = volumeDiscount || earlyDiscount || categoryDiscount;
        if (ruleDiscount) {
            allocationData.discount_rule_id = ruleDiscount.id;
        }

        if (promoDiscount) {
            allocationData.promotional_discount_id = promoDiscount.id;
        }

        // If we have no discount IDs at all, throw error (required by constraint)
        if (!allocationData.discount_rule_id && !allocationData.promotional_discount_id) {
            throw new Error('Cannot create allocation: No discount rule or promotional discount ID provided');
        }

        // Use the provided client if available
        if (client) {
            return await DiscountAllocationService.createAllocationWithClient(
                allocationData,
                userId,
                businessId,
                client
            );
        } else {
            return await DiscountAllocationService.createAllocation(
                allocationData,
                userId,
                businessId
            );
        }
    }

    /**
     * Create journal entries from allocation
     * UPDATED: Accepts client parameter
     */
    static async _createJournalEntriesFromAllocation(allocation, stackedResult, context, userId, businessId, client = null) {
        const transaction = {
            business_id: businessId,
            id: context.transactionId,
            type: context.transactionType || 'POS'
        };

        if (client) {
            // Use client if provided
            const { DiscountAccountingService } = await import('./discountAccountingService.js');
            return await DiscountAccountingService.createBulkDiscountJournalEntriesWithClient(
                transaction,
                stackedResult.appliedDiscounts.map(d => ({
                    rule_type: d.rule_type,
                    discount_amount: d.calculatedDiscount,
                    allocation_id: allocation.id,
                    name: d.name || d.promo_code || d.tier_name || d.term_name
                })),
                userId,
                client
            );
        } else {
            const { DiscountAccountingService } = await import('./discountAccountingService.js');
            return await DiscountAccountingService.createBulkDiscountJournalEntries(
                transaction,
                stackedResult.appliedDiscounts.map(d => ({
                    rule_type: d.rule_type,
                    discount_amount: d.calculatedDiscount,
                    allocation_id: allocation.id,
                    name: d.name || d.promo_code || d.tier_name || d.term_name
                })),
                userId
            );
        }
    }

    /**
     * Update analytics asynchronously
     */
    static async _updateAnalyticsAsync(stackedResult, context, businessId) {
        try {
            await DiscountAnalyticsService.updateDailyAnalytics(businessId);

            if (stackedResult.totalDiscount > 100000) {
                log.info('Significant discount applied', {
                    businessId,
                    customerId: context.customerId,
                    amount: context.amount,
                    discount: stackedResult.totalDiscount,
                    percentage: context.amount > 0 ? (stackedResult.totalDiscount / context.amount) * 100 : 0
                });
            }
        } catch (error) {
            // Don't throw - async operation
            log.error('Error updating analytics async', { error: error.message });
        }
    }

    /**
     * =====================================================
     * SECTION 5: VALIDATION & CACHING
     * =====================================================
     */

    /**
     * Validate transaction context
     */
    static validateContext(context) {
        const errors = [];

        if (!context.businessId) {
            errors.push('businessId is required');
        }

        if (!context.amount && !context.subtotal) {
            errors.push('amount or subtotal is required');
        }

        if (context.amount && isNaN(parseFloat(context.amount))) {
            errors.push('amount must be a number');
        }

        if (context.subtotal && isNaN(parseFloat(context.subtotal))) {
            errors.push('subtotal must be a number');
        }

        if (errors.length > 0) {
            throw new Error(`Validation failed: ${errors.join(', ')}`);
        }

        return true;
    }

    /**
     * Check for conflicts between discounts
     */
    static checkConflicts(discounts) {
        const conflicts = [];

        // Group by type
        const byType = {};
        discounts.forEach(d => {
            const type = d.rule_type;
            if (!byType[type]) byType[type] = [];
            byType[type].push(d);
        });

        // Check for multiple of same type
        const conflictTypes = ['VOLUME', 'EARLY_PAYMENT', 'CATEGORY'];
        for (const type of conflictTypes) {
            if (byType[type] && byType[type].length > 1) {
                conflicts.push({
                    type: 'DUPLICATE_TYPE',
                    message: `Multiple ${type} discounts cannot be combined`,
                    discounts: byType[type]
                });
            }
        }

        // Check for non-stackable discounts
        discounts.forEach(d => {
            if (d.stackable === false) {
                conflicts.push({
                    type: 'NON_STACKABLE',
                    message: `${d.name || d.id} is non-stackable and cannot be combined`,
                    discount: d
                });
            }
        });

        return {
            hasConflicts: conflicts.length > 0,
            conflicts
        };
    }

    /**
     * Generate cache key
     */
    static _generateCacheKey(context) {
        const { businessId, customerId, amount, promoCode } = context;
        return `discount:${businessId}:${customerId}:${amount}:${promoCode || ''}`;
    }

    /**
     * Cache result
     */
    static async cacheResult(key, result, ttlSeconds = 300) {
        if (!global._discountCache) {
            global._discountCache = new Map();
        }

        global._discountCache.set(key, {
            result,
            expires: Date.now() + (ttlSeconds * 1000)
        });

        // Clean up expired entries
        if (Math.random() < 0.01) {
            this._cleanupCache();
        }
    }

    /**
     * Get cached result
     */
    static async getCachedResult(key) {
        if (!global._discountCache) return null;

        const cached = global._discountCache.get(key);
        if (!cached) return null;

        if (cached.expires < Date.now()) {
            global._discountCache.delete(key);
            return null;
        }

        return cached.result;
    }

    /**
     * Invalidate cache for a business
     */
    static async invalidateCache(businessId) {
        if (!global._discountCache) return;

        const prefix = `discount:${businessId}:`;
        for (const [key] of global._discountCache.entries()) {
            if (key.startsWith(prefix)) {
                global._discountCache.delete(key);
            }
        }
    }

    /**
     * Clean up expired cache entries
     */
    static _cleanupCache() {
        if (!global._discountCache) return;

        const now = Date.now();
        for (const [key, value] of global._discountCache.entries()) {
            if (value.expires < now) {
                global._discountCache.delete(key);
            }
        }
    }

    /**
     * =====================================================
     * SECTION 6: INTEGRATION HELPERS
     * =====================================================
     */

    /**
     * Format result for POS system
     */
    static prepareForPOS(engineResult) {
        return {
            transaction_id: engineResult.allocation?.id,
            total_discount: engineResult.totalDiscount,
            final_amount: engineResult.finalAmount,
            discount_breakdown: engineResult.appliedDiscounts.map(d => ({
                type: d.type,
                code: d.name,
                amount: d.amount,
                percentage: d.percentage.toFixed(2)
            })),
            allocation_number: engineResult.allocation?.number,
            journal_entry: engineResult.accounting?.entryNumber
        };
    }

    /**
     * Format result for Invoice system
     */
    static prepareForInvoice(engineResult) {
        return {
            invoice_id: engineResult.allocation?.id,
            total_discount: engineResult.totalDiscount,
            net_amount: engineResult.finalAmount,
            discount_details: engineResult.appliedDiscounts.map(d => ({
                type: d.type,
                description: d.name,
                amount: d.amount,
                rate: d.percentage.toFixed(2) + '%'
            })),
            allocation_reference: engineResult.allocation?.number,
            accounting_reference: engineResult.accounting?.entryNumber
        };
    }

    /**
     * Format result for Accounting system
     */
    static prepareForAccounting(engineResult) {
        return {
            journal_entry_id: engineResult.accounting?.journalEntryId,
            entry_number: engineResult.accounting?.entryNumber,
            total_discount: engineResult.totalDiscount,
            source: {
                type: 'DISCOUNT_ALLOCATION',
                id: engineResult.allocation?.id,
                number: engineResult.allocation?.number
            }
        };
    }
}

export default DiscountRuleEngine;
