// File: ~/Bizzy_Track_pro/backend/app/controllers/discountAllocationController.js
// PURPOSE: Controller for discount allocation operations
// PHASE 10.10: Following patterns from discountController.js
// FIXED: Added camelCase → snake_case transformation for service layer compatibility

import { DiscountAllocationService } from '../services/discountAllocationService.js';

export class DiscountAllocationController {

    /**
     * Create a discount allocation
     * TRANSFORMS: camelCase (API) → snake_case (Service)
     */
    static async createAllocation(req, res) {
        try {
            // Transform camelCase from validation to snake_case for service
            const serviceData = {
                discount_rule_id: req.body.discountRuleId,
                promotional_discount_id: req.body.promotionalDiscountId,
                invoice_id: req.body.invoiceId,
                pos_transaction_id: req.body.posTransactionId,
                total_discount_amount: req.body.totalDiscountAmount,
                allocation_method: req.body.allocationMethod,
                status: req.body.status,
                applied_at: req.body.appliedAt,
                // Transform lines array - match database column names
                lines: req.body.lines ? req.body.lines.map(line => ({
                    line_item_id: line.lineItemId,
                    line_type: line.lineType,
                    line_amount: line.originalAmount,
                    discount_amount: line.discountAmount,
                    allocation_weight: line.allocationWeight
                })) : []
            };

            const result = await DiscountAllocationService.createAllocation(
                serviceData,
                req.user.id,
                req.user.businessId
            );

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Error creating allocation:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get allocation by ID with lines
     */
    static async getAllocationById(req, res) {
        try {
            const allocation = await DiscountAllocationService.getAllocationWithLines(
                req.params.id,
                req.user.businessId
            );

            if (!allocation) {
                return res.status(404).json({
                    success: false,
                    error: 'Allocation not found'
                });
            }

            res.json({
                success: true,
                data: allocation
            });
        } catch (error) {
            console.error('Error getting allocation:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get allocation with complete details (including void info)
     */
    static async getAllocationWithDetails(req, res) {
        try {
            const allocation = await DiscountAllocationService.getAllocationWithDetails(
                req.params.id,
                req.user.businessId
            );

            if (!allocation) {
                return res.status(404).json({
                    success: false,
                    error: 'Allocation not found'
                });
            }

            res.json({
                success: true,
                data: allocation
            });
        } catch (error) {
            console.error('Error getting allocation details:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get allocations for a transaction
     */
    static async getTransactionAllocations(req, res) {
        try {
            const { transactionType } = req.query;

            if (!transactionType || !['POS', 'INVOICE'].includes(transactionType)) {
                return res.status(400).json({
                    success: false,
                    error: 'Valid transactionType (POS or INVOICE) is required'
                });
            }

            const allocations = await DiscountAllocationService.getTransactionAllocations(
                req.params.transactionId,
                transactionType,
                req.user.businessId
            );

            res.json({
                success: true,
                data: allocations
            });
        } catch (error) {
            console.error('Error getting transaction allocations:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Apply allocation
     */
    static async applyAllocation(req, res) {
        try {
            const result = await DiscountAllocationService.applyAllocation(
                req.params.id,
                req.user.id,
                req.user.businessId
            );

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Error applying allocation:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Void allocation with reason
     */
    static async voidAllocation(req, res) {
        try {
            const { reason } = req.body;

            if (!reason) {
                return res.status(400).json({
                    success: false,
                    error: 'Void reason is required'
                });
            }

            const result = await DiscountAllocationService.voidAllocation(
                req.params.id,
                reason,
                req.user.id,
                req.user.businessId
            );

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Error voiding allocation:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get unallocated discounts
     */
    static async getUnallocatedDiscounts(req, res) {
        try {
            const unallocated = await DiscountAllocationService.getUnallocatedDiscounts(
                req.user.businessId
            );

            res.json({
                success: true,
                data: unallocated
            });
        } catch (error) {
            console.error('Error getting unallocated discounts:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get allocation report
     */
    static async getAllocationReport(req, res) {
        try {
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    error: 'startDate and endDate are required'
                });
            }

            const report = await DiscountAllocationService.getAllocationReport(
                req.user.businessId,
                startDate,
                endDate
            );

            res.json({
                success: true,
                data: report
            });
        } catch (error) {
            console.error('Error getting allocation report:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Export allocations to CSV
     */
    static async exportAllocations(req, res) {
        try {
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    error: 'startDate and endDate are required'
                });
            }

            const csv = await DiscountAllocationService.exportAllocations(
                req.user.businessId,
                startDate,
                endDate
            );

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=discount-allocations-${startDate}-to-${endDate}.csv`);
            res.send(csv);
        } catch (error) {
            console.error('Error exporting allocations:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Bulk create allocations
     * TRANSFORMS: camelCase array → snake_case array for service
     */
    static async bulkCreateAllocations(req, res) {
        try {
            const { allocations } = req.body;

            if (!allocations || !Array.isArray(allocations)) {
                return res.status(400).json({
                    success: false,
                    error: 'allocations array is required'
                });
            }

            // Transform each allocation in the array
            const transformedAllocations = allocations.map(alloc => ({
                discount_rule_id: alloc.discountRuleId,
                promotional_discount_id: alloc.promotionalDiscountId,
                invoice_id: alloc.invoiceId,
                pos_transaction_id: alloc.posTransactionId,
                total_discount_amount: alloc.totalDiscountAmount,
                allocation_method: alloc.allocationMethod,
                status: alloc.status,
                applied_at: alloc.appliedAt,
                lines: alloc.lines ? alloc.lines.map(line => ({
                    line_item_id: line.lineItemId,
                    line_type: line.lineType,
                    line_amount: line.originalAmount,
                    discount_amount: line.discountAmount,
                    allocation_weight: line.allocationWeight
                })) : []
            }));

            const results = await DiscountAllocationService.bulkCreateAllocations(
                transformedAllocations,
                req.user.id,
                req.user.businessId
            );

            res.json({
                success: true,
                data: results
            });
        } catch (error) {
            console.error('Error bulk creating allocations:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get voided allocations
     */
    static async getVoidedAllocations(req, res) {
        try {
            const { startDate, endDate } = req.query;

            const voided = await DiscountAllocationService.getVoidedAllocations(
                req.user.businessId,
                startDate,
                endDate
            );

            res.json({
                success: true,
                data: voided
            });
        } catch (error) {
            console.error('Error getting voided allocations:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get void reason statistics
     */
    static async getVoidReasonStats(req, res) {
        try {
            const { startDate, endDate } = req.query;

            const stats = await DiscountAllocationService.getVoidReasonStats(
                req.user.businessId,
                startDate,
                endDate
            );

            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Error getting void stats:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * List allocations with filters
     */
    static async getAllocations(req, res) {
        try {
            // This would need to be implemented if you want paginated list
            res.json({
                success: true,
                message: 'List allocations endpoint - implement as needed',
                data: []
            });
        } catch (error) {
            console.error('Error getting allocations:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

export default DiscountAllocationController;
