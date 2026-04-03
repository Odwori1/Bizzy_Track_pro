// File: ~/Bizzy_Track_pro/backend/app/controllers/posDiscountController.js
// PURPOSE: Handle POS discount operations

import { POSService } from '../services/posService.js';
import { DiscountRuleEngine } from '../services/discountRuleEngine.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class POSDiscountController {

    /**
     * POST /api/pos/transactions-with-discount
     * Create POS transaction with discount calculation
     */
    static async createTransactionWithDiscount(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const transactionData = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found'
                });
            }

            log.info('Creating POS transaction with discount', {
                businessId,
                userId,
                promoCode: transactionData.promo_code,
                itemCount: transactionData.items?.length
            });

            // Calculate discounts first (without creating transaction)
            const discountCheck = await DiscountRuleEngine.calculateFinalPrice({
                businessId,
                customerId: transactionData.customer_id,
                items: transactionData.items.map(item => ({
                    id: item.service_id || item.product_id,
                    amount: item.unit_price,
                    quantity: item.quantity,
                    type: item.item_type
                })),
                amount: transactionData.items.reduce((sum, item) =>
                    sum + (item.unit_price * item.quantity), 0),
                userId,
                promoCode: transactionData.promo_code,
                transactionType: 'POS',
                createAllocation: false,
                preApproved: transactionData.pre_approved || false
            });

            // Check if approval required
            if (discountCheck.requiresApproval && !transactionData.pre_approved) {
                // Calculate total amount directly from items (SAFE approach)
                const totalAmount = transactionData.items.reduce((sum, item) =>
                    sum + (item.unit_price * item.quantity), 0);

                // Create approval request with explicit amount from transaction data
                const approvalRequest = await DiscountRuleEngine.submitForApproval({
                    businessId,
                    customerId: transactionData.customer_id,
                    amount: totalAmount,  // USE DIRECT CALCULATION, not discountCheck.originalAmount
                    items: transactionData.items,
                    promoCode: transactionData.promo_code,
                    transactionType: 'POS'
                }, userId);

                return res.status(202).json({
                    success: true,
                    message: 'Transaction requires approval',
                    data: {
                        requires_approval: true,
                        approval_id: approvalRequest.approvalId,
                        discount_preview: {
                            original_amount: discountCheck.originalAmount,
                            potential_discount: discountCheck.totalDiscount,
                            final_amount: discountCheck.finalAmount,
                            applied_discounts: discountCheck.appliedDiscounts
                        }
                    }
                });
            }

            // Add discount info to transaction data
            if (discountCheck.totalDiscount > 0) {
                transactionData.discount_amount = discountCheck.totalDiscount;
                transactionData.total_discount = discountCheck.totalDiscount;

                // Make sure discount_breakdown is a JSON string, not double-stringified
                if (typeof discountCheck.appliedDiscounts === 'string') {
                    transactionData.discount_breakdown = discountCheck.appliedDiscounts;
                } else {
                    transactionData.discount_breakdown = JSON.stringify(discountCheck.appliedDiscounts);
                }

                transactionData.final_amount = discountCheck.finalAmount;
            }

            // ================ CRITICAL FIX: Clean the transaction data ================
            // Only include fields that POSService.createTransaction expects
            const cleanTransactionData = {
                customer_id: transactionData.customer_id,
                items: transactionData.items.map(item => ({
                    service_id: item.service_id,
                    product_id: item.product_id,
                    inventory_item_id: item.inventory_item_id,
                    item_type: item.item_type,
                    item_name: item.item_name,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    discount_amount: item.discount_amount || 0,
                    // 🔥 FIX: Add tax_category_code (critical for POSService line 590)
                    tax_category_code: item.tax_category_code || 
                                      (item.item_type === 'product' ? 'STANDARD_GOODS' : 'SERVICES')
                })),
                payment_method: transactionData.payment_method,
                payment_status: transactionData.payment_status || 'completed',
                status: transactionData.status || 'completed',
                notes: transactionData.notes,
                transaction_date: transactionData.transaction_date
            };

            // Add discount fields only if they exist
            if (transactionData.discount_amount) {
                cleanTransactionData.discount_amount = transactionData.discount_amount;
            }
            if (transactionData.total_discount) {
                cleanTransactionData.total_discount = transactionData.total_discount;
            }
            if (transactionData.discount_breakdown) {
                cleanTransactionData.discount_breakdown = transactionData.discount_breakdown;
            }
            if (transactionData.final_amount) {
                cleanTransactionData.final_amount = transactionData.final_amount;
            }
            if (transactionData.promo_code) {
                cleanTransactionData.promo_code = transactionData.promo_code;
            }
            if (transactionData.pre_approved) {
                cleanTransactionData.pre_approved = transactionData.pre_approved;
            }

            // Log the cleaned data for debugging
            log.debug('Creating transaction with cleaned data', {
                businessId,
                hasDiscount: cleanTransactionData.discount_amount > 0,
                itemCount: cleanTransactionData.items.length,
                fields: Object.keys(cleanTransactionData)
            });

            // Create the transaction with CLEANED data
            // Note: POSService.createTransaction expects (businessId, transactionData, userId)
            const transaction = await POSService.createTransaction(businessId, cleanTransactionData, userId);

            // If discounts were applied, link allocation
            if (discountCheck.totalDiscount > 0 && discountCheck.allocation) {
                await DiscountRuleEngine.linkAllocationToTransaction({
                    allocationId: discountCheck.allocation.id,
                    transactionId: transaction.id,
                    transactionType: 'POS'
                });
            }

            return res.status(201).json({
                success: true,
                message: 'POS transaction created successfully',
                data: {
                    ...transaction,
                    discount_info: discountCheck.totalDiscount > 0 ? {
                        total_discount: discountCheck.totalDiscount,
                        applied_discounts: discountCheck.appliedDiscounts,
                        allocation: discountCheck.allocation,
                        accounting: discountCheck.accounting
                    } : null
                }
            });

        } catch (error) {
            log.error('Error creating POS transaction with discount:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to create POS transaction',
                details: error.message
            });
        }
    }

    /**
     * POST /api/pos/transactions/:id/apply-discount
     * Apply discount to existing transaction
     */
    static async applyDiscountToTransaction(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { transaction_id, promo_code, pre_approved } = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found'
                });
            }

            // Get transaction details
            const transaction = await POSService.getTransactionById(businessId, transaction_id);
            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found'
                });
            }

            // Calculate discount
            const discountResult = await DiscountRuleEngine.calculateFinalPrice({
                businessId,
                customerId: transaction.customer_id,
                items: transaction.items.map(item => ({
                    id: item.service_id || item.product_id,
                    amount: item.unit_price,
                    quantity: item.quantity,
                    type: item.item_type
                })),
                amount: transaction.total_amount,
                userId,
                promoCode: promo_code,
                transactionId: transaction_id,
                transactionType: 'POS',
                createAllocation: true,
                preApproved: pre_approved || false
            });

            // Update transaction with discount
            await POSService.updateTransactionDiscount(transaction_id, {
                discount_amount: discountResult.totalDiscount,
                discount_breakdown: JSON.stringify(discountResult.appliedDiscounts),
                final_amount: discountResult.finalAmount,
                discount_allocation_id: discountResult.allocation?.id
            });

            return res.json({
                success: true,
                message: 'Discount applied successfully',
                data: {
                    transaction_id,
                    discount_result: discountResult
                }
            });

        } catch (error) {
            log.error('Error applying discount to transaction:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to apply discount',
                details: error.message
            });
        }
    }

    /**
     * GET /api/pos/transactions/:id/discount-status
     * Get discount status for transaction
     */
    static async getDiscountStatus(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { id } = req.params;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found'
                });
            }

            const transaction = await POSService.getTransactionById(businessId, id);
            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found'
                });
            }

            // Get approval status if exists
            let approvalStatus = null;
            if (transaction.approval_id) {
                approvalStatus = await DiscountRuleEngine.getApprovalStatus(transaction.approval_id);
            }

            // Get allocation if exists
            let allocation = null;
            if (transaction.discount_allocation_id) {
                const { DiscountAllocationService } = await import('../services/discountAllocationService.js');
                allocation = await DiscountAllocationService.getAllocationWithLines(
                    transaction.discount_allocation_id,
                    businessId
                );
            }

            return res.json({
                success: true,
                data: {
                    transaction_id: id,
                    has_discounts: transaction.total_discount > 0,
                    discount_amount: transaction.total_discount,
                    discount_breakdown: transaction.discount_breakdown,
                    requires_approval: transaction.requires_approval,
                    approval: approvalStatus,
                    allocation: allocation
                }
            });

        } catch (error) {
            log.error('Error getting discount status:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get discount status',
                details: error.message
            });
        }
    }
}

export default POSDiscountController;
