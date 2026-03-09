// File: ~/Bizzy_Track_pro/backend/app/controllers/invoiceDiscountController.js
// PURPOSE: Handle invoice discount operations

import { invoiceService } from '../services/invoiceService.js';
import { DiscountRuleEngine } from '../services/discountRuleEngine.js';
import { EarlyPaymentService } from '../services/earlyPaymentService.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class InvoiceDiscountController {

    /**
     * POST /api/invoices/with-discount
     * Create invoice with discount calculation
     */
    static async createInvoiceWithDiscount(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const invoiceData = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found'
                });
            }

            log.info('Creating invoice with discount', {
                businessId,
                userId,
                promoCode: invoiceData.promo_code,
                itemCount: invoiceData.line_items?.length
            });

            // Calculate discounts first
            const discountCheck = await DiscountRuleEngine.calculateFinalPrice({
                businessId,
                customerId: invoiceData.customer_id,
                items: invoiceData.line_items.map(item => ({
                    id: item.service_id || item.product_id,
                    amount: item.unit_price,
                    quantity: item.quantity,
                    type: item.service_id ? 'service' : 'product'
                })),
                amount: invoiceData.line_items.reduce((sum, item) => 
                    sum + (item.unit_price * item.quantity), 0),
                userId,
                promoCode: invoiceData.promo_code,
                transactionType: 'INVOICE',
                createAllocation: false,
                preApproved: invoiceData.pre_approved || false
            });

            // Check if approval required
            if (discountCheck.requiresApproval && !invoiceData.pre_approved) {
                const approvalRequest = await DiscountRuleEngine.submitForApproval({
                    businessId,
                    customerId: invoiceData.customer_id,
                    amount: discountCheck.originalAmount,
                    items: invoiceData.line_items,
                    promoCode: invoiceData.promo_code,
                    transactionType: 'INVOICE'
                }, userId);

                return res.status(202).json({
                    success: true,
                    message: 'Invoice requires approval',
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

            // Add discount info to invoice data
            if (discountCheck.totalDiscount > 0) {
                invoiceData.discount_amount = discountCheck.totalDiscount;
                invoiceData.discount_breakdown = JSON.stringify(discountCheck.appliedDiscounts);
            }

            // Create the invoice
            const invoice = await invoiceService.createInvoice(invoiceData, userId, businessId);

            // If discounts were applied, link allocation
            if (discountCheck.totalDiscount > 0 && discountCheck.allocation) {
                await DiscountRuleEngine.linkAllocationToTransaction({
                    allocationId: discountCheck.allocation.id,
                    transactionId: invoice.id,
                    transactionType: 'INVOICE'
                });
            }

            return res.status(201).json({
                success: true,
                message: 'Invoice created successfully',
                data: {
                    ...invoice,
                    discount_info: discountCheck.totalDiscount > 0 ? {
                        total_discount: discountCheck.totalDiscount,
                        applied_discounts: discountCheck.appliedDiscounts,
                        allocation: discountCheck.allocation
                    } : null
                }
            });

        } catch (error) {
            log.error('Error creating invoice with discount:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to create invoice',
                details: error.message
            });
        }
    }

    /**
     * POST /api/invoices/:id/record-payment-with-discount
     * Record payment with early payment discount
     */
    static async recordPaymentWithDiscount(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { id } = req.params;
            const paymentData = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found'
                });
            }

            // Get invoice
            const invoice = await invoiceService.getInvoiceById(id, businessId);
            if (!invoice) {
                return res.status(404).json({
                    success: false,
                    message: 'Invoice not found'
                });
            }

            // Check for early payment discount
            let earlyPaymentDiscount = 0;
            let earlyPaymentResult = null;

            if (paymentData.apply_early_payment_discount && invoice.payment_terms_id) {
                earlyPaymentResult = await EarlyPaymentService.calculateEarlyPaymentDiscount(
                    id,
                    paymentData.payment_date,
                    businessId
                );

                if (earlyPaymentResult.eligible) {
                    earlyPaymentDiscount = earlyPaymentResult.discountAmount;
                    
                    // Create journal entry for early payment discount
                    await EarlyPaymentService.createEarlyPaymentJournalEntry(
                        invoice,
                        earlyPaymentDiscount,
                        userId
                    );
                }
            }

            // Record payment
            const updatedInvoice = await invoiceService.recordPayment(
                id,
                {
                    ...paymentData,
                    early_payment_discount: earlyPaymentDiscount
                },
                userId,
                businessId
            );

            return res.json({
                success: true,
                message: earlyPaymentDiscount > 0 ? 
                    'Payment recorded with early payment discount' : 
                    'Payment recorded successfully',
                data: {
                    invoice: updatedInvoice,
                    early_payment_discount: earlyPaymentDiscount > 0 ? {
                        amount: earlyPaymentDiscount,
                        percentage: earlyPaymentResult?.discountPercentage,
                        saved: earlyPaymentDiscount
                    } : null
                }
            });

        } catch (error) {
            log.error('Error recording payment with discount:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to record payment',
                details: error.message
            });
        }
    }

    /**
     * GET /api/invoices/:id/discount-status
     * Get discount status for invoice
     */
    static async getInvoiceDiscountStatus(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { id } = req.params;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found'
                });
            }

            const invoice = await invoiceService.getInvoiceById(id, businessId);
            if (!invoice) {
                return res.status(404).json({
                    success: false,
                    message: 'Invoice not found'
                });
            }

            // Get approval status
            let approvalStatus = null;
            if (invoice.approval_id) {
                approvalStatus = await DiscountRuleEngine.getApprovalStatus(invoice.approval_id);
            }

            // Get allocation
            let allocation = null;
            if (invoice.discount_allocation_id) {
                const { DiscountAllocationService } = await import('../services/discountAllocationService.js');
                allocation = await DiscountAllocationService.getAllocationWithLines(
                    invoice.discount_allocation_id,
                    businessId
                );
            }

            // Check early payment eligibility
            let earlyPaymentEligibility = null;
            if (invoice.payment_terms_id && invoice.status !== 'paid') {
                earlyPaymentEligibility = await EarlyPaymentService.isEligible(
                    id,
                    new Date(),
                    businessId
                );
            }

            return res.json({
                success: true,
                data: {
                    invoice_id: id,
                    has_discounts: invoice.total_discount > 0,
                    discount_amount: invoice.total_discount,
                    discount_breakdown: invoice.discount_breakdown,
                    requires_approval: invoice.requires_approval,
                    approval: approvalStatus,
                    allocation: allocation,
                    early_payment: {
                        has_terms: !!invoice.payment_terms_id,
                        terms: invoice.payment_terms,
                        eligible_now: earlyPaymentEligibility,
                        discount_percentage: invoice.payment_terms?.discount_percentage
                    }
                }
            });

        } catch (error) {
            log.error('Error getting invoice discount status:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get discount status',
                details: error.message
            });
        }
    }
}

export default InvoiceDiscountController;
