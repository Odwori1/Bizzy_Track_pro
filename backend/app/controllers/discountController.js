// File: backend/app/controllers/discountController.js
// PURPOSE: Handle all discount-related HTTP requests
// PHASE 10.10: Following patterns from accountingController.js

import { DiscountRuleEngine } from '../services/discountRuleEngine.js';
import { PromotionalDiscountService } from '../services/promotionalDiscountService.js';
import { EarlyPaymentService } from '../services/earlyPaymentService.js';
import { VolumeDiscountService } from '../services/volumeDiscountService.js';
import { DiscountAllocationService } from '../services/discountAllocationService.js';
import { DiscountAccountingService } from '../services/discountAccountingService.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

/**
 * DISCOUNT CONTROLLER
 * Following patterns from accountingController.js
 * All methods are static - no instance state
 */
export class DiscountController {

    // =====================================================
    // SECTION 1: DISCOUNT CALCULATION ENDPOINTS
    // =====================================================

    /**
     * POST /api/discounts/calculate
     * Calculate final price with all applicable discounts
     */
    static async calculateFinalPrice(req, res) {
        try {
            // Extract user info (handle both camelCase and snake_case)
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            // Use validated data from middleware OR request body
            const context = req.validatedData || req.body;

            log.info('Calculating final price with discounts', {
                businessId,
                customerId: context.customerId,
                amount: context.amount || context.subtotal,
                promoCode: context.promoCode
            });

            // Add user and business context
            const result = await DiscountRuleEngine.calculateFinalPrice({
                ...context,
                businessId,
                userId
            });

            // Log audit trail for significant discounts
            if (result.totalDiscount > 100000) { // Log large discounts
                await auditLogger.logAction({
                    businessId,
                    userId,
                    action: 'discount.calculated',
                    resourceType: 'discount_calculation',
                    resourceId: result.allocation?.id || null,
                    newValues: {
                        originalAmount: result.originalAmount,
                        totalDiscount: result.totalDiscount,
                        finalAmount: result.finalAmount,
                        discountCount: result.appliedDiscounts.length
                    }
                });
            }

            return res.json({
                success: true,
                data: result,
                message: 'Discount calculation completed successfully'
            });

        } catch (error) {
            log.error('Error calculating final price:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to calculate discounts',
                details: error.message
            });
        }
    }

    /**
     * POST /api/discounts/preview
     * Preview discounts without applying them
     */
    static async previewDiscounts(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const context = req.validatedData || req.body;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Previewing discounts', {
                businessId,
                customerId: context.customerId,
                amount: context.amount || context.subtotal,
                promoCode: context.promoCode
            });

            const result = await DiscountRuleEngine.previewDiscounts({
                ...context,
                businessId
            });

            return res.json({
                success: true,
                data: result,
                message: 'Discount preview generated'
            });

        } catch (error) {
            log.error('Error previewing discounts:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to preview discounts',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/available
     * Get available discounts for current context
     */
    static async getAvailableDiscounts(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { customerId, amount, categoryId, serviceId } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!customerId) {
                return res.status(400).json({
                    success: false,
                    message: 'Customer ID is required'
                });
            }

            log.info('Getting available discounts', {
                businessId,
                customerId,
                amount,
                categoryId,
                serviceId
            });

            const discounts = await DiscountRuleEngine.discoverDiscounts({
                businessId,
                customerId,
                amount: amount ? parseFloat(amount) : 0,
                categoryId,
                serviceId,
                transactionDate: new Date()
            });

            return res.json({
                success: true,
                data: discounts,
                message: 'Available discounts retrieved'
            });

        } catch (error) {
            log.error('Error getting available discounts:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get available discounts',
                details: error.message
            });
        }
    }

    /**
     * POST /api/discounts/find-best
     * Find best combination of discounts
     */
    static async findBestCombination(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const context = req.validatedData || req.body;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Finding best discount combination', {
                businessId,
                customerId: context.customerId,
                amount: context.amount
            });

            const result = await DiscountRuleEngine.findBestCombination({
                ...context,
                businessId
            });

            return res.json({
                success: true,
                data: result,
                message: 'Best discount combination found'
            });

        } catch (error) {
            log.error('Error finding best combination:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to find best discount combination',
                details: error.message
            });
        }
    }

    // =====================================================
    // SECTION 2: PROMOTIONAL DISCOUNTS
    // =====================================================

    /**
     * POST /api/discounts/promotions
     * Create new promotional discount
     */
    static async createPromotion(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const promotionData = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Creating promotional discount', {
                businessId,
                userId,
                promoCode: promotionData.promoCode
            });

            const result = await PromotionalDiscountService.createPromotion(
                promotionData,
                userId,
                businessId
            );

            // Log audit trail
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'promotional_discount.created',
                resourceType: 'promotional_discounts',
                resourceId: result.id,
                newValues: {
                    promoCode: result.promo_code,
                    discountType: result.discount_type,
                    discountValue: result.discount_value,
                    validFrom: result.valid_from,
                    validTo: result.valid_to
                }
            });

            return res.status(201).json({
                success: true,
                data: result,
                message: 'Promotional discount created successfully'
            });

        } catch (error) {
            log.error('Error creating promotion:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to create promotional discount',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/promotions
     * List all promotions with filters
     */
    static async getPromotions(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { isActive, validFrom, validTo, page = 1, limit = 10 } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Fetching promotions', { businessId, isActive });

            const filters = {
                isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
                validFrom,
                validTo,
                page: parseInt(page),
                limit: parseInt(limit)
            };

            const result = await PromotionalDiscountService.getPromotions(businessId, filters);

            return res.json({
                success: true,
                data: result,
                message: 'Promotions retrieved successfully'
            });

        } catch (error) {
            log.error('Error getting promotions:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve promotions',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/promotions/:id
     * Get specific promotion details
     */
    static async getPromotionById(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { id } = req.params;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Fetching promotion by ID', { businessId, promotionId: id });

            const promotion = await PromotionalDiscountService.getPromotionById(id, businessId);

            if (!promotion) {
                return res.status(404).json({
                    success: false,
                    message: 'Promotion not found'
                });
            }

            return res.json({
                success: true,
                data: promotion,
                message: 'Promotion retrieved successfully'
            });

        } catch (error) {
            log.error('Error getting promotion by ID:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve promotion',
                details: error.message
            });
        }
    }

    /**
     * PUT /api/discounts/promotions/:id
     * Update promotion
     */
    static async updatePromotion(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { id } = req.params;
            const updateData = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Updating promotion', {
                businessId,
                userId,
                promotionId: id
            });

            const result = await PromotionalDiscountService.updatePromotion(
                id,
                updateData,
                userId,
                businessId
            );

            // Log audit trail
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'promotional_discount.updated',
                resourceType: 'promotional_discounts',
                resourceId: id,
                newValues: updateData
            });

            return res.json({
                success: true,
                data: result,
                message: 'Promotion updated successfully'
            });

        } catch (error) {
            log.error('Error updating promotion:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to update promotion',
                details: error.message
            });
        }
    }

    /**
     * DELETE /api/discounts/promotions/:id
     * Deactivate promotion (soft delete)
     */
    static async deactivatePromotion(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { id } = req.params;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Deactivating promotion', {
                businessId,
                userId,
                promotionId: id
            });

            const result = await PromotionalDiscountService.deactivatePromotion(
                id,
                userId,
                businessId
            );

            // Log audit trail
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'promotional_discount.deactivated',
                resourceType: 'promotional_discounts',
                resourceId: id,
                newValues: { is_active: false }
            });

            return res.json({
                success: true,
                data: result,
                message: 'Promotion deactivated successfully'
            });

        } catch (error) {
            log.error('Error deactivating promotion:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to deactivate promotion',
                details: error.message
            });
        }
    }

    /**
     * POST /api/discounts/promotions/validate
     * Validate a promo code without applying
     */
    static async validatePromoCode(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { promoCode, amount, customerId } = req.validatedData || req.body;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Validating promo code', {
                businessId,
                promoCode,
                amount,
                customerId
            });

            const result = await PromotionalDiscountService.validateAndApplyPromo(
                businessId,
                promoCode,
                { amount, customerId }
            );

            return res.json({
                success: true,
                data: result,
                message: result.valid ? 'Promo code is valid' : 'Promo code is invalid'
            });

        } catch (error) {
            log.error('Error validating promo code:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to validate promo code',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/promotions/:id/stats
     * Get usage statistics for a promotion
     */
    static async getPromotionStats(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { id } = req.params;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Getting promotion stats', { businessId, promotionId: id });

            const stats = await PromotionalDiscountService.getPromotionStats(id, businessId);

            return res.json({
                success: true,
                data: stats,
                message: 'Promotion statistics retrieved'
            });

        } catch (error) {
            log.error('Error getting promotion stats:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get promotion statistics',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/promotions/expiring
     * Get promotions expiring soon
     */
    static async getExpiringPromotions(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { daysThreshold = 7 } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Getting expiring promotions', {
                businessId,
                daysThreshold: parseInt(daysThreshold)
            });

            const promotions = await PromotionalDiscountService.getExpiringPromotions(
                businessId,
                parseInt(daysThreshold)
            );

            return res.json({
                success: true,
                data: promotions,
                message: 'Expiring promotions retrieved'
            });

        } catch (error) {
            log.error('Error getting expiring promotions:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get expiring promotions',
                details: error.message
            });
        }
    }

    /**
     * POST /api/discounts/promotions/bulk
     * Bulk create promotions
     */
    static async bulkCreatePromotions(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const promotions = req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            if (!Array.isArray(promotions)) {
                return res.status(400).json({
                    success: false,
                    message: 'Request body must be an array of promotions'
                });
            }

            log.info('Bulk creating promotions', {
                businessId,
                userId,
                count: promotions.length
            });

            const results = await PromotionalDiscountService.bulkCreatePromotions(
                promotions,
                userId,
                businessId
            );

            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            return res.status(201).json({
                success: true,
                data: {
                    results,
                    summary: {
                        total: results.length,
                        successful: successCount,
                        failed: failCount
                    }
                },
                message: `Created ${successCount} promotions, ${failCount} failed`
            });

        } catch (error) {
            log.error('Error bulk creating promotions:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to bulk create promotions',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/promotions/export
     * Export promotions to CSV
     */
    static async exportPromotions(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { format = 'csv' } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Exporting promotions', { businessId, format });

            const csvData = await PromotionalDiscountService.exportPromotions(businessId);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="promotions_${businessId}_${new Date().toISOString().split('T')[0]}.csv"`
            );

            return res.send(csvData);

        } catch (error) {
            log.error('Error exporting promotions:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to export promotions',
                details: error.message
            });
        }
    }

    // =====================================================
    // SECTION 3: EARLY PAYMENT TERMS
    // =====================================================

    /**
     * POST /api/discounts/early-payment/terms
     * Create early payment terms
     */
    static async createEarlyPaymentTerms(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const termsData = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Creating early payment terms', {
                businessId,
                userId,
                termName: termsData.termName
            });

            const result = await EarlyPaymentService.createTerms(
                termsData,
                userId,
                businessId
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'early_payment_terms.created',
                resourceType: 'early_payment_terms',
                resourceId: result.id,
                newValues: {
                    termName: result.term_name,
                    discountPercentage: result.discount_percentage,
                    discountDays: result.discount_days,
                    netDays: result.net_days
                }
            });

            return res.status(201).json({
                success: true,
                data: result,
                message: 'Early payment terms created successfully'
            });

        } catch (error) {
            log.error('Error creating early payment terms:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to create early payment terms',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/early-payment/terms
     * List all early payment terms
     */
    static async getEarlyPaymentTerms(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { isActive } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Fetching early payment terms', { businessId, isActive });

            const filters = {
                isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined
            };

            const terms = await EarlyPaymentService.getTerms(businessId, filters);

            return res.json({
                success: true,
                data: terms,
                message: 'Early payment terms retrieved'
            });

        } catch (error) {
            log.error('Error getting early payment terms:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve early payment terms',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/early-payment/terms/:id
     * Get specific term
     */
    static async getEarlyPaymentTermById(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { id } = req.params;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Fetching early payment term', { businessId, termId: id });

            const term = await EarlyPaymentService.getTermById(id, businessId);

            if (!term) {
                return res.status(404).json({
                    success: false,
                    message: 'Early payment term not found'
                });
            }

            return res.json({
                success: true,
                data: term,
                message: 'Early payment term retrieved'
            });

        } catch (error) {
            log.error('Error getting early payment term:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve early payment term',
                details: error.message
            });
        }
    }

    /**
     * PUT /api/discounts/early-payment/terms/:id
     * Update terms
     */
    static async updateEarlyPaymentTerms(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { id } = req.params;
            const updateData = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Updating early payment terms', {
                businessId,
                userId,
                termId: id
            });

            const result = await EarlyPaymentService.updateTerms(
                id,
                updateData,
                userId,
                businessId
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'early_payment_terms.updated',
                resourceType: 'early_payment_terms',
                resourceId: id,
                newValues: updateData
            });

            return res.json({
                success: true,
                data: result,
                message: 'Early payment terms updated'
            });

        } catch (error) {
            log.error('Error updating early payment terms:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to update early payment terms',
                details: error.message
            });
        }
    }

    /**
     * DELETE /api/discounts/early-payment/terms/:id
     * Soft delete terms
     */
    static async deleteEarlyPaymentTerms(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { id } = req.params;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Deleting early payment terms', {
                businessId,
                userId,
                termId: id
            });

            const result = await EarlyPaymentService.deleteTerms(
                id,
                userId,
                businessId
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'early_payment_terms.deleted',
                resourceType: 'early_payment_terms',
                resourceId: id,
                newValues: { is_active: false }
            });

            return res.json({
                success: true,
                data: result,
                message: 'Early payment terms deleted'
            });

        } catch (error) {
            log.error('Error deleting early payment terms:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to delete early payment terms',
                details: error.message
            });
        }
    }

    /**
     * POST /api/discounts/early-payment/assign
     * Assign terms to a customer
     */
    static async assignTermsToCustomer(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { customerId, termId } = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Assigning payment terms to customer', {
                businessId,
                userId,
                customerId,
                termId
            });

            const result = await EarlyPaymentService.assignTermsToCustomer(
                customerId,
                termId,
                userId,
                businessId
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'early_payment_terms.assigned',
                resourceType: 'customer_payment_terms',
                resourceId: result.id,
                newValues: { customerId, termId }
            });

            return res.json({
                success: true,
                data: result,
                message: 'Payment terms assigned to customer'
            });

        } catch (error) {
            log.error('Error assigning terms to customer:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to assign payment terms',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/early-payment/customer/:customerId
     * Get terms assigned to a customer
     */
    static async getCustomerPaymentTerms(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { customerId } = req.params;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Getting customer payment terms', {
                businessId,
                customerId
            });

            const terms = await EarlyPaymentService.getCustomerTerms(
                customerId,
                businessId
            );

            return res.json({
                success: true,
                data: terms,
                message: 'Customer payment terms retrieved'
            });

        } catch (error) {
            log.error('Error getting customer payment terms:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get customer payment terms',
                details: error.message
            });
        }
    }

    /**
     * POST /api/discounts/early-payment/calculate
     * Calculate early payment discount for invoice
     */
    static async calculateEarlyPaymentDiscount(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { invoiceId, paymentDate } = req.validatedData || req.body;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Calculating early payment discount', {
                businessId,
                invoiceId,
                paymentDate
            });

            const result = await EarlyPaymentService.calculateEarlyPaymentDiscount(
                invoiceId,
                paymentDate,
                businessId
            );

            return res.json({
                success: true,
                data: result,
                message: result.eligible ?
                    'Early payment discount calculated' :
                    'Payment is not eligible for early payment discount'
            });

        } catch (error) {
            log.error('Error calculating early payment discount:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to calculate early payment discount',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/early-payment/stats
     * Get early payment usage statistics
     */
    static async getEarlyPaymentStats(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Getting early payment stats', {
                businessId,
                startDate,
                endDate
            });

            const stats = await EarlyPaymentService.getEarlyPaymentStats(
                businessId,
                startDate,
                endDate
            );

            return res.json({
                success: true,
                data: stats,
                message: 'Early payment statistics retrieved'
            });

        } catch (error) {
            log.error('Error getting early payment stats:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get early payment statistics',
                details: error.message
            });
        }
    }

    // =====================================================
    // SECTION 4: VOLUME DISCOUNTS
    // =====================================================

    /**
     * POST /api/discounts/volume/tiers
     * Create volume discount tier
     */
    static async createVolumeTier(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const tierData = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Creating volume discount tier', {
                businessId,
                userId,
                tierName: tierData.tierName
            });

            const result = await VolumeDiscountService.createTier(
                tierData,
                userId,
                businessId
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'volume_discount_tier.created',
                resourceType: 'volume_discount_tiers',
                resourceId: result.id,
                newValues: {
                    tierName: result.tier_name,
                    minQuantity: result.min_quantity,
                    minAmount: result.min_amount,
                    discountPercentage: result.discount_percentage,
                    appliesTo: result.applies_to
                }
            });

            return res.status(201).json({
                success: true,
                data: result,
                message: 'Volume discount tier created'
            });

        } catch (error) {
            log.error('Error creating volume tier:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to create volume discount tier',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/volume/tiers
     * List all volume discount tiers
     */
    static async getVolumeTiers(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { isActive, appliesTo } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Fetching volume discount tiers', {
                businessId,
                isActive,
                appliesTo
            });

            const filters = {
                isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
                appliesTo
            };

            const tiers = await VolumeDiscountService.getTiers(businessId, filters);

            return res.json({
                success: true,
                data: tiers,
                message: 'Volume discount tiers retrieved'
            });

        } catch (error) {
            log.error('Error getting volume tiers:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve volume discount tiers',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/volume/tiers/:id
     * Get specific tier
     */
    static async getVolumeTierById(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { id } = req.params;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Fetching volume discount tier', {
                businessId,
                tierId: id
            });

            const tier = await VolumeDiscountService.getTierById(id, businessId);

            if (!tier) {
                return res.status(404).json({
                    success: false,
                    message: 'Volume discount tier not found'
                });
            }

            return res.json({
                success: true,
                data: tier,
                message: 'Volume discount tier retrieved'
            });

        } catch (error) {
            log.error('Error getting volume tier:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve volume discount tier',
                details: error.message
            });
        }
    }

    /**
     * PUT /api/discounts/volume/tiers/:id
     * Update tier
     */
    static async updateVolumeTier(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { id } = req.params;
            const updateData = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Updating volume discount tier', {
                businessId,
                userId,
                tierId: id
            });

            const result = await VolumeDiscountService.updateTier(
                id,
                updateData,
                userId,
                businessId
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'volume_discount_tier.updated',
                resourceType: 'volume_discount_tiers',
                resourceId: id,
                newValues: updateData
            });

            return res.json({
                success: true,
                data: result,
                message: 'Volume discount tier updated'
            });

        } catch (error) {
            log.error('Error updating volume tier:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to update volume discount tier',
                details: error.message
            });
        }
    }

    /**
     * DELETE /api/discounts/volume/tiers/:id
     * Soft delete tier
     */
    static async deleteVolumeTier(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { id } = req.params;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Deleting volume discount tier', {
                businessId,
                userId,
                tierId: id
            });

            const result = await VolumeDiscountService.deleteTier(
                id,
                userId,
                businessId
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'volume_discount_tier.deleted',
                resourceType: 'volume_discount_tiers',
                resourceId: id,
                newValues: { is_active: false }
            });

            return res.json({
                success: true,
                data: result,
                message: 'Volume discount tier deleted'
            });

        } catch (error) {
            log.error('Error deleting volume tier:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to delete volume discount tier',
                details: error.message
            });
        }
    }

    /**
     * POST /api/discounts/volume/calculate
     * Calculate volume discount for transaction
     */
    static async calculateVolumeDiscount(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const calculationData = req.validatedData || req.body;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Calculating volume discount', {
                businessId,
                itemCount: calculationData.items?.length
            });

            let result;

            if (calculationData.items) {
                // Calculate for multiple items
                result = await VolumeDiscountService.calculateVolumeDiscount(
                    businessId,
                    calculationData.items
                );
            } else {
                // Calculate single best tier
                result = await VolumeDiscountService.getBestVolumeDiscount(
                    businessId,
                    calculationData.quantity,
                    calculationData.amount,
                    calculationData.categoryId
                );
            }

            return res.json({
                success: true,
                data: result,
                message: 'Volume discount calculated'
            });

        } catch (error) {
            log.error('Error calculating volume discount:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to calculate volume discount',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/volume/stats
     * Get volume discount usage statistics
     */
    static async getVolumeDiscountStats(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Getting volume discount stats', {
                businessId,
                startDate,
                endDate
            });

            const stats = await VolumeDiscountService.getVolumeDiscountStats(
                businessId,
                startDate,
                endDate
            );

            return res.json({
                success: true,
                data: stats,
                message: 'Volume discount statistics retrieved'
            });

        } catch (error) {
            log.error('Error getting volume discount stats:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get volume discount statistics',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/volume/top
     * Get top volume discount tiers
     */
    static async getTopVolumeTiers(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { limit = 10 } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Getting top volume tiers', {
                businessId,
                limit: parseInt(limit)
            });

            const tiers = await VolumeDiscountService.getTopTiers(
                businessId,
                parseInt(limit)
            );

            return res.json({
                success: true,
                data: tiers,
                message: 'Top volume discount tiers retrieved'
            });

        } catch (error) {
            log.error('Error getting top volume tiers:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get top volume discount tiers',
                details: error.message
            });
        }
    }

    // =====================================================
    // SECTION 5: DISCOUNT ALLOCATIONS
    // =====================================================

    /**
     * POST /api/discounts/allocations
     * Create a discount allocation
     */
    static async createAllocation(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const allocationData = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Creating discount allocation', {
                businessId,
                userId,
                method: allocationData.allocationMethod,
                amount: allocationData.totalDiscountAmount
            });

            const result = await DiscountAllocationService.createAllocation(
                allocationData,
                userId,
                businessId
            );

            return res.status(201).json({
                success: true,
                data: result,
                message: 'Discount allocation created'
            });

        } catch (error) {
            log.error('Error creating allocation:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to create discount allocation',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/allocations
     * List allocations with filters
     */
    static async getAllocations(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const {
                startDate,
                endDate,
                status,
                page = 1,
                limit = 10
            } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Fetching allocations', {
                businessId,
                startDate,
                endDate,
                status
            });

            // For now, just return allocations from the transaction-specific methods
            // A full list method would need to be added to the service
            return res.json({
                success: true,
                data: {
                    message: 'Use /allocations/transaction/:id for specific transactions',
                    note: 'Comprehensive allocations list endpoint coming soon'
                }
            });

        } catch (error) {
            log.error('Error getting allocations:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get allocations',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/allocations/:id
     * Get allocation details with line items
     */
    static async getAllocationById(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { id } = req.params;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Fetching allocation by ID', {
                businessId,
                allocationId: id
            });

            const allocation = await DiscountAllocationService.getAllocationWithLines(
                id,
                businessId
            );

            if (!allocation) {
                return res.status(404).json({
                    success: false,
                    message: 'Allocation not found'
                });
            }

            return res.json({
                success: true,
                data: allocation,
                message: 'Allocation retrieved'
            });

        } catch (error) {
            log.error('Error getting allocation:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get allocation',
                details: error.message
            });
        }
    }

    /**
     * POST /api/discounts/allocations/:id/apply
     * Mark allocation as applied
     */
    static async applyAllocation(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { id } = req.params;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Applying allocation', {
                businessId,
                userId,
                allocationId: id
            });

            const result = await DiscountAllocationService.applyAllocation(
                id,
                userId,
                businessId
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'discount_allocation.applied',
                resourceType: 'discount_allocations',
                resourceId: id,
                newValues: { status: 'APPLIED' }
            });

            return res.json({
                success: true,
                data: result,
                message: 'Allocation applied'
            });

        } catch (error) {
            log.error('Error applying allocation:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to apply allocation',
                details: error.message
            });
        }
    }

    /**
     * POST /api/discounts/allocations/:id/void
     * Void an allocation
     */
    static async voidAllocation(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { id } = req.params;
            const { reason } = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            if (!reason) {
                return res.status(400).json({
                    success: false,
                    message: 'Reason is required to void an allocation'
                });
            }

            log.info('Voiding allocation', {
                businessId,
                userId,
                allocationId: id,
                reason
            });

            const result = await DiscountAllocationService.voidAllocation(
                id,
                reason,
                userId,
                businessId
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'discount_allocation.voided',
                resourceType: 'discount_allocations',
                resourceId: id,
                newValues: { status: 'VOID', reason }
            });

            return res.json({
                success: true,
                data: result,
                message: 'Allocation voided'
            });

        } catch (error) {
            log.error('Error voiding allocation:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to void allocation',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/allocations/transaction/:transactionId
     * Get allocations for a specific transaction
     */
    static async getTransactionAllocations(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { transactionId } = req.params;
            const { type } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!type || !['POS', 'INVOICE'].includes(type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Transaction type must be POS or INVOICE'
                });
            }

            log.info('Getting transaction allocations', {
                businessId,
                transactionId,
                type
            });

            const allocations = await DiscountAllocationService.getTransactionAllocations(
                transactionId,
                type,
                businessId
            );

            return res.json({
                success: true,
                data: allocations,
                message: 'Transaction allocations retrieved'
            });

        } catch (error) {
            log.error('Error getting transaction allocations:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get transaction allocations',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/allocations/report
     * Generate allocation report for period
     */
    static async getAllocationReport(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Both startDate and endDate are required'
                });
            }

            log.info('Generating allocation report', {
                businessId,
                startDate,
                endDate
            });

            const report = await DiscountAllocationService.getAllocationReport(
                businessId,
                new Date(startDate),
                new Date(endDate)
            );

            return res.json({
                success: true,
                data: report,
                message: 'Allocation report generated'
            });

        } catch (error) {
            log.error('Error generating allocation report:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate allocation report',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/allocations/unallocated
     * Find discounts applied but not allocated
     */
    static async getUnallocatedDiscounts(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Finding unallocated discounts', { businessId });

            const unallocated = await DiscountAllocationService.getUnallocatedDiscounts(businessId);

            return res.json({
                success: true,
                data: unallocated,
                message: unallocated.length > 0 ?
                    'Found unallocated discounts' :
                    'No unallocated discounts found'
            });

        } catch (error) {
            log.error('Error finding unallocated discounts:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to find unallocated discounts',
                details: error.message
            });
        }
    }

    // =====================================================
    // SECTION 6: DISCOUNT APPROVALS
    // =====================================================

    /**
     * GET /api/discounts/approvals/pending
     * Get pending approvals for a business
     */
    static async getPendingApprovals(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Getting pending approvals', { businessId });

            // This would need a service method - placeholder for now
            const client = await getClient();
            try {
                const result = await client.query(
                    `SELECT * FROM discount_approvals
                     WHERE business_id = $1 AND status = 'pending'
                     ORDER BY created_at DESC`,
                    [businessId]
                );

                return res.json({
                    success: true,
                    data: result.rows,
                    message: 'Pending approvals retrieved'
                });
            } finally {
                client.release();
            }

        } catch (error) {
            log.error('Error getting pending approvals:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get pending approvals',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/approvals/:id
     * Get approval details
     */
    static async getApprovalById(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { id } = req.params;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Getting approval by ID', {
                businessId,
                approvalId: id
            });

            const approval = await DiscountRuleEngine.getApprovalStatus(id);

            if (!approval) {
                return res.status(404).json({
                    success: false,
                    message: 'Approval not found'
                });
            }

            // Verify business ID matches
            if (approval.business_id !== businessId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this approval'
                });
            }

            return res.json({
                success: true,
                data: approval,
                message: 'Approval details retrieved'
            });

        } catch (error) {
            log.error('Error getting approval:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get approval details',
                details: error.message
            });
        }
    }

    /**
     * POST /api/discounts/approvals/:id/approve
     * Approve a discount request
     */
    static async approveDiscount(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const approverId = req.user.userId || req.user.id;
            const { id } = req.params;

            if (!businessId || !approverId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Approving discount', {
                businessId,
                approverId,
                approvalId: id
            });

            const result = await DiscountRuleEngine.processApproval(
                id,
                'APPROVE',
                approverId
            );

            return res.json({
                success: true,
                data: result,
                message: 'Discount approved'
            });

        } catch (error) {
            log.error('Error approving discount:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to approve discount',
                details: error.message
            });
        }
    }

    /**
     * POST /api/discounts/approvals/:id/reject
     * Reject a discount request
     */
    static async rejectDiscount(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const approverId = req.user.userId || req.user.id;
            const { id } = req.params;
            const { reason } = req.validatedData || req.body;

            if (!businessId || !approverId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            if (!reason) {
                return res.status(400).json({
                    success: false,
                    message: 'Rejection reason is required'
                });
            }

            log.info('Rejecting discount', {
                businessId,
                approverId,
                approvalId: id,
                reason
            });

            const result = await DiscountRuleEngine.processApproval(
                id,
                'REJECT',
                approverId,
                reason
            );

            return res.json({
                success: true,
                data: result,
                message: 'Discount rejected'
            });

        } catch (error) {
            log.error('Error rejecting discount:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to reject discount',
                details: error.message
            });
        }
    }

    // =====================================================
    // SECTION 7: BULK OPERATIONS & EXPORTS
    // =====================================================

    /**
     * POST /api/discounts/early-payment/bulk
     * Bulk import early payment terms
     */
    static async bulkImportEarlyPaymentTerms(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const terms = req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            if (!Array.isArray(terms)) {
                return res.status(400).json({
                    success: false,
                    message: 'Request body must be an array of terms'
                });
            }

            log.info('Bulk importing early payment terms', {
                businessId,
                userId,
                count: terms.length
            });

            const results = await EarlyPaymentService.bulkImportTerms(
                terms,
                userId,
                businessId
            );

            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            return res.status(201).json({
                success: true,
                data: {
                    results,
                    summary: {
                        total: results.length,
                        successful: successCount,
                        failed: failCount
                    }
                },
                message: `Imported ${successCount} terms, ${failCount} failed`
            });

        } catch (error) {
            log.error('Error bulk importing terms:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to bulk import terms',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/early-payment/export
     * Export terms to CSV
     */
    static async exportEarlyPaymentTerms(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Exporting early payment terms', { businessId });

            const csvData = await EarlyPaymentService.exportTerms(businessId);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="early_payment_terms_${businessId}_${new Date().toISOString().split('T')[0]}.csv"`
            );

            return res.send(csvData);

        } catch (error) {
            log.error('Error exporting terms:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to export terms',
                details: error.message
            });
        }
    }

    /**
     * POST /api/discounts/volume/bulk
     * Bulk import volume tiers
     */
    static async bulkImportVolumeTiers(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const tiers = req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            if (!Array.isArray(tiers)) {
                return res.status(400).json({
                    success: false,
                    message: 'Request body must be an array of tiers'
                });
            }

            log.info('Bulk importing volume tiers', {
                businessId,
                userId,
                count: tiers.length
            });

            const results = await VolumeDiscountService.bulkImportTiers(
                tiers,
                userId,
                businessId
            );

            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            return res.status(201).json({
                success: true,
                data: {
                    results,
                    summary: {
                        total: results.length,
                        successful: successCount,
                        failed: failCount
                    }
                },
                message: `Imported ${successCount} tiers, ${failCount} failed`
            });

        } catch (error) {
            log.error('Error bulk importing tiers:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to bulk import tiers',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/volume/export
     * Export tiers to CSV
     */
    static async exportVolumeTiers(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Exporting volume tiers', { businessId });

            const csvData = await VolumeDiscountService.exportTiers(businessId);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="volume_tiers_${businessId}_${new Date().toISOString().split('T')[0]}.csv"`
            );

            return res.send(csvData);

        } catch (error) {
            log.error('Error exporting tiers:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to export tiers',
                details: error.message
            });
        }
    }

    /**
     * POST /api/discounts/allocations/bulk
     * Bulk create allocations
     */
    static async bulkCreateAllocations(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const allocations = req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            if (!Array.isArray(allocations)) {
                return res.status(400).json({
                    success: false,
                    message: 'Request body must be an array of allocations'
                });
            }

            log.info('Bulk creating allocations', {
                businessId,
                userId,
                count: allocations.length
            });

            const results = await DiscountAllocationService.bulkCreateAllocations(
                allocations,
                userId,
                businessId
            );

            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            return res.status(201).json({
                success: true,
                data: {
                    results,
                    summary: {
                        total: results.length,
                        successful: successCount,
                        failed: failCount
                    }
                },
                message: `Created ${successCount} allocations, ${failCount} failed`
            });

        } catch (error) {
            log.error('Error bulk creating allocations:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to bulk create allocations',
                details: error.message
            });
        }
    }

    /**
     * GET /api/discounts/allocations/export
     * Export allocations to CSV
     */
    static async exportAllocations(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { startDate, endDate } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Both startDate and endDate are required'
                });
            }

            log.info('Exporting allocations', {
                businessId,
                startDate,
                endDate
            });

            const csvData = await DiscountAllocationService.exportAllocations(
                businessId,
                new Date(startDate),
                new Date(endDate)
            );

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="allocations_${businessId}_${startDate}_to_${endDate}.csv"`
            );

            return res.send(csvData);

        } catch (error) {
            log.error('Error exporting allocations:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to export allocations',
                details: error.message
            });
        }
    }

    // =====================================================
    // SECTION 8: TEST ENDPOINT
    // =====================================================

    /**
     * GET /api/discounts/test
     * Test discount controller
     */
    static async testController(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            return res.json({
                success: true,
                data: {
                    businessId,
                    timestamp: new Date().toISOString(),
                    status: 'Discount controller is operational',
                    features: [
                        'Discount calculation',
                        'Promotional discounts',
                        'Early payment terms',
                        'Volume discounts',
                        'Discount allocations',
                        'Discount approvals'
                    ],
                    services: [
                        'DiscountRuleEngine',
                        'PromotionalDiscountService',
                        'EarlyPaymentService',
                        'VolumeDiscountService',
                        'DiscountAllocationService',
                        'DiscountAccountingService'
                    ]
                },
                message: 'Discount system is working correctly'
            });

        } catch (error) {
            log.error('Controller test failed:', error);
            return res.status(500).json({
                success: false,
                error: 'Controller test failed',
                details: error.message
            });
        }
    }
}

export default DiscountController;
