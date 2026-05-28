// File: ~/Bizzy_Track_pro/backend/app/controllers/posDiscountController.js
// PURPOSE: Handle POS discount operations
//
// FIX HISTORY:
//   2004/2005 — Controller was calling DiscountRuleEngine.calculateFinalPrice()
//               unconditionally on every transaction, regardless of whether a
//               promo code was provided. This caused SAVE10 (and any other active
//               automatic rule) to apply silently to every POS transaction.
//
//               Additionally, the controller pre-computed discount_amount and
//               injected it into transactionData before calling posService, which
//               bypassed the apply_discounts guard in posService entirely.
//
//   CORRECT DESIGN:
//     - Controller's only job: validate the request, optionally check approval,
//       pass request to POSService.createTransaction unchanged.
//     - POSService owns all discount calculation logic.
//     - The discount engine only runs when promo_code is present OR
//       apply_discounts === true is explicitly set.
//     - Controller never pre-computes or injects discount_amount.

import { POSService } from '../services/posService.js';
import { DiscountRuleEngine } from '../services/discountRuleEngine.js';
import { log } from '../utils/logger.js';

export class POSDiscountController {

    /**
     * POST /api/pos/transactions-with-discount
     *
     * Creates a POS transaction. Discount calculation is handled entirely
     * by POSService.createTransaction — the controller does NOT pre-compute
     * discounts. If a promo_code is provided, posService will apply it.
     * If apply_discounts: true is sent, posService will check automatic rules.
     * Neither → no discount engine runs → no discount applied.
     */
    static async createTransactionWithDiscount(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId     = req.user.userId     || req.user.id;
            const transactionData = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in token'
                });
            }

            log.info('Creating POS transaction via discount controller', {
                businessId,
                userId,
                promoCode:      transactionData.promo_code || null,
                applyDiscounts: transactionData.apply_discounts || false,
                itemCount:      transactionData.items?.length
            });

            // ── Build clean transaction data ──────────────────────────────
            // Pass through exactly what posService expects.
            // Do NOT compute discount_amount here — posService owns that.
            // Do NOT call DiscountRuleEngine here — posService owns that.
            const cleanTransactionData = {
                customer_id:     transactionData.customer_id     || null,
                transaction_date: transactionData.transaction_date || null,
                payment_method:  transactionData.payment_method,
                payment_status:  transactionData.payment_status  || 'completed',
                notes:           transactionData.notes           || '',

                // Discount intent — posService reads these to decide whether
                // to run the discount engine and what code to apply.
                // Never inject a pre-computed discount_amount here.
                promo_code:      transactionData.promo_code      || null,
                apply_discounts: transactionData.apply_discounts || false,
                pre_approved:    transactionData.pre_approved    || false,

                // Items — pass through unchanged so posService can validate,
                // sync inventory, and calculate tax correctly.
                items: (transactionData.items || []).map(item => ({
                    service_id:        item.service_id        || null,
                    product_id:        item.product_id        || null,
                    inventory_item_id: item.inventory_item_id || null,
                    item_type:         item.item_type,
                    item_name:         item.item_name,
                    quantity:          item.quantity,
                    unit_price:        item.unit_price,
                    tax_category_code: item.tax_category_code ||
                        (item.item_type === 'product' ? 'STANDARD_GOODS' : 'SERVICES'),
                    // Do NOT set item.discount_amount here — posService
                    // allocates it proportionally after calculating totalDiscount
                })),
            };

            // ── Delegate entirely to posService ───────────────────────────
            // All discount calculation, tax calculation, journal entry creation,
            // and approval handling happens inside POSService.createTransaction.
            const transaction = await POSService.createTransaction(
                businessId,
                cleanTransactionData,
                userId
            );

            return res.status(201).json({
                success: true,
                message: 'POS transaction created successfully',
                data: transaction
            });

        } catch (error) {
            log.error('Error creating POS transaction via discount controller:', {
                error:   error.message,
                stack:   error.stack,
            });
            return res.status(500).json({
                success: false,
                message: 'Failed to create POS transaction',
                details: error.message
            });
        }
    }

    /**
     * POST /api/pos/transactions/:id/apply-discount
     *
     * Applies a discount to an EXISTING completed transaction.
     * This is a post-sale discount (e.g. loyalty adjustment) — different
     * from the pre-sale discount handled by createTransactionWithDiscount.
     * This path still calls the discount engine directly because posService
     * is not involved (the transaction already exists).
     */
    static async applyDiscountToTransaction(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId     = req.user.userId     || req.user.id;
            const { transaction_id, promo_code, pre_approved } = req.validatedData || req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found'
                });
            }

            // A promo code is required for post-sale discounts
            if (!promo_code) {
                return res.status(400).json({
                    success: false,
                    message: 'promo_code is required to apply a discount to an existing transaction'
                });
            }

            const transaction = await POSService.getTransactionById(businessId, transaction_id);
            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found'
                });
            }

            if (transaction.status !== 'completed') {
                return res.status(400).json({
                    success: false,
                    message: 'Discount can only be applied to completed transactions'
                });
            }

            const discountResult = await DiscountRuleEngine.calculateFinalPrice({
                businessId,
                customerId:      transaction.customer_id,
                items:           transaction.items.map(item => ({
                    id:       item.service_id || item.product_id,
                    amount:   item.unit_price,
                    quantity: item.quantity,
                    type:     item.item_type
                })),
                amount:          transaction.total_amount,
                userId,
                promoCode:       promo_code,
                transactionId:   transaction_id,
                transactionType: 'POS',
                createAllocation: true,
                preApproved:     pre_approved || false
            });

            if (discountResult.requiresApproval && !pre_approved) {
                const approvalRequest = await DiscountRuleEngine.submitForApproval({
                    businessId,
                    customerId:      transaction.customer_id,
                    amount:          transaction.total_amount,
                    items:           transaction.items,
                    promoCode:       promo_code,
                    transactionId:   transaction_id,
                    transactionType: 'POS',
                    discountDetails: discountResult
                }, userId);

                return res.status(202).json({
                    success: true,
                    message: 'Discount requires approval',
                    data: {
                        requires_approval: true,
                        approval_id:       approvalRequest.approvalId,
                        discount_preview: {
                            original_amount:   discountResult.originalAmount,
                            potential_discount: discountResult.totalDiscount,
                            final_amount:      discountResult.finalAmount,
                        }
                    }
                });
            }

            if (discountResult.totalDiscount > 0) {
                await POSService.updateTransaction(businessId, transaction_id, {
                    discount_amount:    discountResult.totalDiscount,
                    discount_breakdown: JSON.stringify(discountResult.appliedDiscounts),
                    final_amount:       discountResult.finalAmount,
                }, userId);
            }

            return res.json({
                success: true,
                message: 'Discount applied successfully',
                data: {
                    transaction_id,
                    discount_result: {
                        total_discount:    discountResult.totalDiscount,
                        applied_discounts: discountResult.appliedDiscounts,
                        final_amount:      discountResult.finalAmount,
                    }
                }
            });

        } catch (error) {
            log.error('Error applying discount to transaction:', { error: error.message });
            return res.status(500).json({
                success: false,
                message: 'Failed to apply discount',
                details: error.message
            });
        }
    }

    /**
     * GET /api/pos/transactions/:id/discount-status
     */
    static async getDiscountStatus(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { id }     = req.params;

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

            let approvalStatus = null;
            if (transaction.approval_id) {
                approvalStatus = await DiscountRuleEngine.getApprovalStatus(
                    transaction.approval_id
                );
            }

            let allocation = null;
            if (transaction.discount_allocation_id) {
                const { DiscountAllocationService } = await import(
                    '../services/discountAllocationService.js'
                );
                allocation = await DiscountAllocationService.getAllocationWithLines(
                    transaction.discount_allocation_id,
                    businessId
                );
            }

            return res.json({
                success: true,
                data: {
                    transaction_id:    id,
                    has_discounts:     (transaction.total_discount || 0) > 0,
                    discount_amount:   transaction.total_discount || 0,
                    discount_breakdown: transaction.discount_breakdown,
                    requires_approval: transaction.requires_approval || false,
                    approval:          approvalStatus,
                    allocation,
                }
            });

        } catch (error) {
            log.error('Error getting discount status:', { error: error.message });
            return res.status(500).json({
                success: false,
                message: 'Failed to get discount status',
                details: error.message
            });
        }
    }
}

export default POSDiscountController;
