// File: ~/Bizzy_Track_pro/backend/app/services/discountRuleEngine.js
// PURPOSE: Master orchestrator that combines all discount services
// PHASE 10.9: FIXED VERSION - All tests passing

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

export class DiscountRuleEngine {

    /**
     * =====================================================
     * SECTION 1: MASTER CALCULATION
     * =====================================================
     */

    /**
     * MAIN ENTRY POINT - Calculate final price with all discounts
     */
    static async calculateFinalPrice(context) {
        const startTime = Date.now();
        const { businessId, userId, transactionDate = new Date() } = context;

        try {
            log.info('Starting discount calculation', {
                businessId,
                customerId: context.customerId,
                amount: context.amount || context.subtotal,
                promoCode: context.promoCode
            });

            // Step 1: Validate input
            this.validateContext(context);

            // Step 2: Check cache for identical calculations
            const cacheKey = this._generateCacheKey(context);
            const cached = await this.getCachedResult(cacheKey);
            if (cached) {
                log.debug('Returning cached result', { cacheKey });
                return cached;
            }

            // Step 3: Discover all applicable discounts
            const applicableDiscounts = await this.discoverDiscounts(context);

            // Step 4: Check if any discounts require approval
            const approvalRequired = await this.checkApprovalRequired(applicableDiscounts, context);

            // Step 5: If approval required and not pre-approved, return approval request
            if (approvalRequired && !context.preApproved) {
                return {
                    success: false,
                    requiresApproval: true,
                    message: 'This discount requires approval',
                    discounts: applicableDiscounts,
                    approvalThreshold: await this._getApprovalThreshold(businessId)
                };
            }

            // Step 6: Calculate stacked discount
            const originalAmount = context.amount || context.subtotal || 0;
            const stackedResult = DiscountCore.calculateStackedDiscount(
                originalAmount,
                applicableDiscounts
            );

            // Step 7: Create allocation if discounts applied and not preview mode
            let allocation = null;
            if (stackedResult.appliedDiscounts.length > 0 &&
                context.createAllocation !== false &&
                context.previewMode !== true) {
                allocation = await this._createAllocationFromResult(
                    stackedResult,
                    context,
                    userId,
                    businessId
                );
            }

            // Step 8: Create journal entries if needed
            let accounting = null;
            if (allocation && context.createJournalEntries !== false) {
                accounting = await this._createJournalEntriesFromAllocation(
                    allocation,
                    stackedResult,
                    context,
                    userId,
                    businessId
                );
            }

            // Step 9: Update analytics (async - don't await)
            if (stackedResult.totalDiscount > 0) {
                this._updateAnalyticsAsync(stackedResult, context, businessId).catch(error => {
                    log.error('Error updating analytics', { error: error.message });
                });
            }

            // Step 10: Prepare final result
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
                calculationTime: Date.now() - startTime
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

            // Cache the result (only for preview mode or no allocation)
            if (context.previewMode || !allocation) {
                await this.cacheResult(cacheKey, result, 300);
            }

            log.info('Discount calculation complete', {
                businessId,
                originalAmount,
                totalDiscount: stackedResult.totalDiscount,
                finalAmount: stackedResult.finalAmount,
                discountCount: stackedResult.appliedDiscounts.length,
                duration: Date.now() - startTime
            });

            return result;

        } catch (error) {
            log.error('Error in calculateFinalPrice', {
                error: error.message,
                stack: error.stack,
                context
            });
            throw error;
        }
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
     */
    static async discoverDiscounts(context) {
        const { businessId, customerId, amount, quantity, promoCode, transactionDate } = context;

        const ruleContext = {
            customerId,
            amount: amount || context.subtotal || 0,
            quantity: quantity || 1,
            promoCode,
            transactionDate: transactionDate || new Date(),
            categoryId: context.categoryId,
            serviceId: context.serviceId
        };

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

        return enrichedDiscounts;
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
     * SECTION 3: APPROVAL WORKFLOW - FIXED
     * =====================================================
     */

    /**
     * Check if any discount requires approval
     */
    static async checkApprovalRequired(discounts, context) {
        if (!discounts || discounts.length === 0) return false;

        const { amount } = context;

        // Use hardcoded threshold of 20% for now
        const threshold = 20;

        for (const discount of discounts) {
            const discountPercentage = parseFloat(discount.discount_value || 0);

            if (discount.discount_type === 'PERCENTAGE') {
                if (DiscountCore.requiresApproval(discountPercentage, threshold)) {
                    return true;
                }
            } else if (discount.discount_type === 'FIXED') {
                const totalAmount = parseFloat(amount || context.subtotal || 0);
                if (totalAmount > 0) {
                    const percentage = (discountPercentage / totalAmount) * 100;
                    if (DiscountCore.requiresApproval(percentage, threshold)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Get approval threshold
     */
    static async _getApprovalThreshold(businessId) {
        return 20; // Default threshold of 20%
    }

    /**
     * Submit discounts for approval
     * FIXED: Uses correct column names from discount_approvals table
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

            // Build approval data matching discount_approvals table structure
            const approvalData = {
                business_id: businessId,
                requested_by: userId,
                original_amount: amount,
                requested_discount: totalDiscount,
                discount_percentage: discountPercentage,
                reason: promoCode ? `Promo code: ${promoCode}` : 'Discount approval requested',
                status: 'pending',
                requires_approval: true,
                approval_threshold: 20
            };

            // Add customer info to reason if available
            if (customerId) {
                approvalData.reason = `${approvalData.reason} - Customer: ${customerId}`;
            }

            // Add transaction reference based on type
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

            // Store discount details in approval_notes
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
                    percentage: discountPercentage
                }
            });

            await client.query('COMMIT');

            return {
                success: true,
                approvalId,
                status: 'pending',
                message: 'Discount approval request submitted'
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
     * FIXED: Passes correct field names to allocation service
     */
    static async _createAllocationFromResult(stackedResult, context, userId, businessId) {
        const { items, transactionId, transactionType } = context;

        if (!items || items.length === 0) {
            return null;
        }

        // Prepare line items for allocation
        const lineItems = items.map(item => ({
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
            lines: allocations  // allocations now have correct fields
        };

        // Add discount rule ID (required by constraint)
        // Use volume/early/category for discount_rule_id
        const ruleDiscount = volumeDiscount || earlyDiscount || categoryDiscount;
        if (ruleDiscount) {
            allocationData.discount_rule_id = ruleDiscount.id;
        }

        // Use promotional for promotional_discount_id
        if (promoDiscount) {
            allocationData.promotional_discount_id = promoDiscount.id;
        }

        // If we have no discount IDs at all, throw error (required by constraint)
        if (!allocationData.discount_rule_id && !allocationData.promotional_discount_id) {
            throw new Error('Cannot create allocation: No discount rule or promotional discount ID provided');
        }

        return await DiscountAllocationService.createAllocation(
            allocationData,
            userId,
            businessId
        );
    }

    /**
     * Create journal entries from allocation
     */
    static async _createJournalEntriesFromAllocation(allocation, stackedResult, context, userId, businessId) {
        const transaction = {
            business_id: businessId,
            id: context.transactionId,
            type: context.transactionType || 'POS'
        };

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
