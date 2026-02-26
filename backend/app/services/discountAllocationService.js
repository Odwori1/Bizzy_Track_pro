// File: ~/Bizzy_Track_pro/backend/app/services/discountAllocationService.js
// PURPOSE: Allocate discounts across line items for accounting
// PHASE 10.6: FIXED VERSION - Matching actual database schema
// DEPENDS ON: discountCore.js, discount_allocations table, discount_allocation_lines table

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';
import { DiscountCore } from './discountCore.js';

export class DiscountAllocationService {

    /**
     * =====================================================
     * SECTION 1: ALLOCATION METHODS (PURE FUNCTIONS)
     * FIXED: Returns data matching database schema
     * =====================================================
     */

    /**
     * Allocate discount by line amount (pro-rata)
     * FIXED: Returns fields that match discount_allocation_lines table
     */
    static allocateByLineAmount(lineItems, totalDiscount) {
        if (!lineItems || lineItems.length === 0) {
            return [];
        }

        // Calculate total amount
        const totalAmount = lineItems.reduce((sum, item) => {
            return sum + (parseFloat(item.amount) * (item.quantity || 1));
        }, 0);

        if (totalAmount === 0) {
            return lineItems.map(item => ({
                line_item_id: item.id,
                line_type: item.type || 'service',
                line_amount: parseFloat(item.amount) * (item.quantity || 1),
                discount_amount: 0,
                allocation_weight: 0
            }));
        }

        // Allocate proportionally
        const allocations = [];
        let remainingDiscount = totalDiscount;

        for (let i = 0; i < lineItems.length; i++) {
            const item = lineItems[i];
            const itemAmount = parseFloat(item.amount) * (item.quantity || 1);

            // Calculate proportional discount
            let itemDiscount;
            if (i === lineItems.length - 1) {
                // Last item gets remaining discount to avoid rounding errors
                itemDiscount = remainingDiscount;
            } else {
                itemDiscount = (itemAmount / totalAmount) * totalDiscount;
                // Round to 2 decimal places
                itemDiscount = Math.round(itemDiscount * 100) / 100;
            }

            remainingDiscount = Math.max(0, remainingDiscount - itemDiscount);

            allocations.push({
                line_item_id: item.id,
                line_type: item.type || 'service',
                line_amount: itemAmount,
                discount_amount: itemDiscount,
                allocation_weight: itemAmount > 0 ? (itemDiscount / itemAmount) : 0
            });
        }

        return allocations;
    }

    /**
     * Allocate discount by quantity (equal per unit)
     * FIXED: Returns fields that match discount_allocation_lines table
     */
    static allocateByQuantity(lineItems, totalDiscount) {
        if (!lineItems || lineItems.length === 0) {
            return [];
        }

        // Calculate total quantity
        const totalQuantity = lineItems.reduce((sum, item) => {
            return sum + (item.quantity || 1);
        }, 0);

        if (totalQuantity === 0) {
            return lineItems.map(item => ({
                line_item_id: item.id,
                line_type: item.type || 'service',
                line_amount: parseFloat(item.amount) * (item.quantity || 1),
                discount_amount: 0,
                allocation_weight: 0,
                quantity: item.quantity || 1
            }));
        }

        // Calculate discount per unit
        const discountPerUnit = totalDiscount / totalQuantity;
        const allocations = [];
        let remainingDiscount = totalDiscount;

        for (let i = 0; i < lineItems.length; i++) {
            const item = lineItems[i];
            const itemQuantity = item.quantity || 1;
            const itemAmount = parseFloat(item.amount) * itemQuantity;

            // Calculate discount based on quantity
            let itemDiscount;
            if (i === lineItems.length - 1) {
                // Last item gets remaining discount
                itemDiscount = remainingDiscount;
            } else {
                itemDiscount = discountPerUnit * itemQuantity;
                itemDiscount = Math.round(itemDiscount * 100) / 100;
            }

            remainingDiscount = Math.max(0, remainingDiscount - itemDiscount);

            allocations.push({
                line_item_id: item.id,
                line_type: item.type || 'service',
                line_amount: itemAmount,
                discount_amount: itemDiscount,
                allocation_weight: itemAmount > 0 ? (itemDiscount / itemAmount) : 0,
                quantity: itemQuantity,
                discount_per_unit: itemQuantity > 0 ? itemDiscount / itemQuantity : 0
            });
        }

        return allocations;
    }

    /**
     * Allocate by custom weights
     * FIXED: Returns fields that match discount_allocation_lines table
     */
    static allocateByCustomWeights(lineItems, weights, totalDiscount) {
        if (!lineItems || lineItems.length === 0) {
            return [];
        }

        if (weights.length !== lineItems.length) {
            throw new Error('Number of weights must match number of line items');
        }

        // Validate weights sum to approximately 1
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        if (Math.abs(totalWeight - 1.0) > 0.001) {
            throw new Error('Weights must sum to 1.0');
        }

        const allocations = [];
        let remainingDiscount = totalDiscount;

        for (let i = 0; i < lineItems.length; i++) {
            const item = lineItems[i];
            const itemAmount = parseFloat(item.amount) * (item.quantity || 1);

            let itemDiscount;
            if (i === lineItems.length - 1) {
                itemDiscount = remainingDiscount;
            } else {
                itemDiscount = weights[i] * totalDiscount;
                itemDiscount = Math.round(itemDiscount * 100) / 100;
            }

            remainingDiscount = Math.max(0, remainingDiscount - itemDiscount);

            allocations.push({
                line_item_id: item.id,
                line_type: item.type || 'service',
                line_amount: itemAmount,
                discount_amount: itemDiscount,
                allocation_weight: weights[i]
            });
        }

        return allocations;
    }

    /**
     * Allocate by percentage of original price
     * FIXED: Returns fields that match discount_allocation_lines table
     */
    static allocateByPercentage(lineItems, discountPercentage) {
        if (!lineItems || lineItems.length === 0) {
            return [];
        }

        return lineItems.map(item => {
            const itemAmount = parseFloat(item.amount) * (item.quantity || 1);
            const itemDiscount = DiscountCore.calculateDiscount(
                itemAmount,
                'PERCENTAGE',
                discountPercentage
            );

            return {
                line_item_id: item.id,
                line_type: item.type || 'service',
                line_amount: itemAmount,
                discount_amount: itemDiscount,
                allocation_weight: discountPercentage / 100
            };
        });
    }

    /**
     * =====================================================
     * SECTION 2: DATABASE OPERATIONS
     * =====================================================
     */

    /**
     * Generate allocation number using database function
     * FIXED: Uses generate_discount_allocation_number database function
     */
    static async generateAllocationNumber(businessId, client = null) {
        const shouldCloseClient = !client;
        const dbClient = client || await getClient();

        try {
            const result = await dbClient.query(
                `SELECT generate_discount_allocation_number($1) as allocation_number`,
                [businessId]
            );
            
            return result.rows[0].allocation_number;

        } catch (error) {
            log.error('Error generating allocation number via function', { error: error.message });
            
            // Fallback to manual generation
            const year = new Date().getFullYear();
            const month = String(new Date().getMonth() + 1).padStart(2, '0');
            const timestamp = Date.now().toString().slice(-8);
            return `DA-${year}-${month}-${timestamp}`;
        } finally {
            if (shouldCloseClient) dbClient.release();
        }
    }

    /**
     * Create discount allocation record
     */
    static async createAllocation(data, userId, businessId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            // Generate allocation number
            const allocationNumber = await this.generateAllocationNumber(businessId, client);

            // Insert main allocation record
            const allocationResult = await client.query(
                `INSERT INTO discount_allocations (
                    business_id, discount_rule_id, promotional_discount_id,
                    invoice_id, pos_transaction_id,
                    allocation_number, total_discount_amount, allocation_method,
                    status, applied_at, created_by, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
                RETURNING *`,
                [
                    businessId,
                    data.discount_rule_id || null,
                    data.promotional_discount_id || null,
                    data.invoice_id || null,
                    data.pos_transaction_id || null,
                    allocationNumber,
                    data.total_discount_amount,
                    data.allocation_method || 'PRO_RATA_AMOUNT',
                    data.status || 'PENDING',
                    data.applied_at || null,
                    userId
                ]
            );

            const allocation = allocationResult.rows[0];

            // Create allocation lines if provided
            if (data.lines && data.lines.length > 0) {
                await this.createAllocationLines(allocation.id, data.lines, client);
            }

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'discount_allocation.created',
                resourceType: 'discount_allocations',
                resourceId: allocation.id,
                newValues: {
                    allocation_number: allocationNumber,
                    total_discount: data.total_discount_amount,
                    method: data.allocation_method,
                    line_count: data.lines?.length || 0
                }
            });

            log.info('Discount allocation created', {
                businessId,
                userId,
                allocationId: allocation.id,
                allocationNumber
            });

            await client.query('COMMIT');

            // Return the allocation with lines
            return await this.getAllocationWithLines(allocation.id, businessId, client);

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error creating allocation', { error: error.message, businessId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Create allocation lines
     * FIXED: Uses correct database column names and handles both POS and invoice items
     */
    static async createAllocationLines(allocationId, lines, client) {
        if (!lines || lines.length === 0) {
            return [];
        }

        // Get the allocation to determine if it's POS or Invoice
        const allocationResult = await client.query(
            `SELECT pos_transaction_id, invoice_id
             FROM discount_allocations
             WHERE id = $1`,
            [allocationId]
        );

        if (allocationResult.rows.length === 0) {
            throw new Error('Allocation not found');
        }

        const isPos = allocationResult.rows[0].pos_transaction_id ? true : false;
        const createdLines = [];

        for (const line of lines) {
            // Validate line has required fields
            if (!line.line_item_id) {
                throw new Error('Each line must have a line_item_id');
            }

            // Build the line data with actual column names
            const lineData = {
                allocation_id: allocationId,
                line_amount: line.line_amount || 0,
                discount_amount: line.discount_amount || 0,
                created_at: new Date()
            };

            // Add allocation weight if present (already a decimal)
            if (line.allocation_weight !== undefined) {
                lineData.allocation_weight = line.allocation_weight;
            }

            // Add the appropriate transaction item ID based on transaction type
            if (isPos) {
                lineData.pos_transaction_item_id = line.line_item_id;
            } else {
                lineData.invoice_line_item_id = line.line_item_id;
            }

            const columns = Object.keys(lineData).join(', ');
            const values = Object.values(lineData);
            const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

            const result = await client.query(
                `INSERT INTO discount_allocation_lines (${columns})
                 VALUES (${placeholders})
                 RETURNING *`,
                values
            );

            createdLines.push(result.rows[0]);
        }

        log.debug('Allocation lines created', {
            allocationId,
            lineCount: lines.length
        });

        return createdLines;
    }

    /**
     * Get allocation by ID with lines
     */
    static async getAllocationWithLines(allocationId, businessId, client = null) {
        const shouldCloseClient = !client;
        const dbClient = client || await getClient();

        try {
            // Get main allocation
            const allocationResult = await dbClient.query(
                `SELECT * FROM discount_allocations
                 WHERE id = $1 AND business_id = $2`,
                [allocationId, businessId]
            );

            if (allocationResult.rows.length === 0) {
                return null;
            }

            const allocation = allocationResult.rows[0];

            // Get allocation lines
            const linesResult = await dbClient.query(
                `SELECT * FROM discount_allocation_lines
                 WHERE allocation_id = $1
                 ORDER BY created_at ASC`,
                [allocationId]
            );

            return {
                ...allocation,
                lines: linesResult.rows
            };

        } catch (error) {
            log.error('Error getting allocation with lines', { error: error.message, allocationId });
            throw error;
        } finally {
            if (shouldCloseClient) dbClient.release();
        }
    }

    /**
     * Get allocations for a transaction
     */
    static async getTransactionAllocations(transactionId, transactionType, businessId) {
        const client = await getClient();

        try {
            let query;
            let params;

            if (transactionType === 'POS') {
                query = `SELECT * FROM discount_allocations
                         WHERE business_id = $1 AND pos_transaction_id = $2`;
                params = [businessId, transactionId];
            } else if (transactionType === 'INVOICE') {
                query = `SELECT * FROM discount_allocations
                         WHERE business_id = $1 AND invoice_id = $2`;
                params = [businessId, transactionId];
            } else {
                throw new Error('Invalid transaction type');
            }

            const result = await client.query(query, params);
            return result.rows;

        } catch (error) {
            log.error('Error getting transaction allocations', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 3: STATUS MANAGEMENT
     * =====================================================
     */

    /**
     * Apply allocation (mark as used)
     */
    static async applyAllocation(allocationId, userId, businessId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            const result = await client.query(
                `UPDATE discount_allocations
                 SET status = 'APPLIED',
                     applied_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $1 AND business_id = $2
                 RETURNING *`,
                [allocationId, businessId]
            );

            if (result.rows.length === 0) {
                throw new Error('Allocation not found');
            }

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'discount_allocation.applied',
                resourceType: 'discount_allocations',
                resourceId: allocationId,
                newValues: { status: 'APPLIED' }
            });

            log.info('Discount allocation applied', { businessId, userId, allocationId });

            await client.query('COMMIT');
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error applying allocation', { error: error.message, allocationId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Void allocation
     */
    static async voidAllocation(allocationId, reason, userId, businessId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            // Check if allocation can be voided
            const canVoid = await this.canVoidAllocation(allocationId, businessId, client);
            if (!canVoid) {
                throw new Error('Allocation cannot be voided - may be linked to posted transactions');
            }

            const result = await client.query(
                `UPDATE discount_allocations
                 SET status = 'VOID',
                     rejection_reason = $3,
                     updated_at = NOW()
                 WHERE id = $1 AND business_id = $2
                 RETURNING *`,
                [allocationId, businessId, reason]
            );

            if (result.rows.length === 0) {
                throw new Error('Allocation not found');
            }

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'discount_allocation.voided',
                resourceType: 'discount_allocations',
                resourceId: allocationId,
                newValues: {
                    status: 'VOID',
                    reason: reason
                }
            });

            log.info('Discount allocation voided', {
                businessId,
                userId,
                allocationId,
                reason
            });

            await client.query('COMMIT');
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error voiding allocation', { error: error.message, allocationId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Check if allocation can be voided
     */
    static async canVoidAllocation(allocationId, businessId, client = null) {
        const shouldCloseClient = !client;
        const dbClient = client || await getClient();

        try {
            // Check if allocation exists and is not already voided
            const allocation = await dbClient.query(
                `SELECT status
                 FROM discount_allocations
                 WHERE id = $1 AND business_id = $2`,
                [allocationId, businessId]
            );

            if (allocation.rows.length === 0) {
                return false;
            }

            const alloc = allocation.rows[0];

            // Already voided
            if (alloc.status === 'VOID') {
                return false;
            }

            // Applied allocations cannot be voided
            if (alloc.status === 'APPLIED') {
                return false;
            }

            return true;

        } catch (error) {
            log.error('Error checking if allocation can be voided', { error: error.message });
            return false;
        } finally {
            if (shouldCloseClient) dbClient.release();
        }
    }

    /**
     * =====================================================
     * SECTION 4: VALIDATION
     * =====================================================
     */

    /**
     * Validate allocation total matches expected total
     * FIXED: Uses discount_amount instead of allocated_discount
     */
    static validateAllocationTotal(allocations, expectedTotal) {
        if (!allocations || allocations.length === 0) {
            return {
                valid: expectedTotal === 0,
                actual: 0,
                expected: expectedTotal,
                difference: expectedTotal
            };
        }

        const actualTotal = allocations.reduce((sum, line) => {
            return sum + (line.discount_amount || 0);
        }, 0);

        // Allow for small rounding differences (1 cent)
        const difference = Math.abs(actualTotal - expectedTotal);
        const valid = difference < 0.01;

        return {
            valid,
            actual: actualTotal,
            expected: expectedTotal,
            difference,
            allocations
        };
    }

    /**
     * Validate allocation method
     */
    static validateAllocationMethod(method) {
        const validMethods = [
            'PRO_RATA_AMOUNT',
            'PRO_RATA_QUANTITY',
            'CUSTOM_WEIGHTS',
            'FIXED_PERCENTAGE'
        ];

        return {
            valid: validMethods.includes(method),
            method,
            validMethods
        };
    }

    /**
     * =====================================================
     * SECTION 5: REPORTING
     * =====================================================
     */

    /**
     * Get allocation report for a period
     */
    static async getAllocationReport(businessId, startDate, endDate) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT
                    DATE(da.created_at) as allocation_date,
                    da.allocation_method,
                    da.status,
                    COUNT(*) as allocation_count,
                    SUM(da.total_discount_amount) as total_discount,
                    AVG(da.total_discount_amount) as avg_discount,
                    COUNT(DISTINCT
                        CASE
                            WHEN da.pos_transaction_id IS NOT NULL THEN da.pos_transaction_id
                            WHEN da.invoice_id IS NOT NULL THEN da.invoice_id
                        END
                    ) as transaction_count
                 FROM discount_allocations da
                 WHERE da.business_id = $1
                    AND da.created_at BETWEEN $2 AND $3
                 GROUP BY DATE(da.created_at), da.allocation_method, da.status
                 ORDER BY allocation_date DESC, da.allocation_method`,
                [businessId, startDate, endDate]
            );

            // Get summary statistics
            const summary = await client.query(
                `SELECT
                    COUNT(*) as total_allocations,
                    COALESCE(SUM(total_discount_amount), 0) as grand_total_discount,
                    COUNT(DISTINCT pos_transaction_id) as pos_count,
                    COUNT(DISTINCT invoice_id) as invoice_count,
                    COUNT(*) FILTER (WHERE status = 'APPLIED') as applied_count,
                    COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count,
                    COUNT(*) FILTER (WHERE status = 'VOID') as void_count
                 FROM discount_allocations
                 WHERE business_id = $1
                    AND created_at BETWEEN $2 AND $3`,
                [businessId, startDate, endDate]
            );

            return {
                period: { startDate, endDate },
                daily_breakdown: result.rows,
                summary: summary.rows[0] || {
                    total_allocations: 0,
                    grand_total_discount: 0,
                    pos_count: 0,
                    invoice_count: 0,
                    applied_count: 0,
                    pending_count: 0,
                    void_count: 0
                }
            };

        } catch (error) {
            log.error('Error getting allocation report', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get unallocated discounts
     * Finds discounts that have been applied but not yet allocated
     */
    static async getUnallocatedDiscounts(businessId) {
        const client = await getClient();

        try {
            // Get unallocated POS transactions
            const posResult = await client.query(
                `SELECT
                    'POS' as transaction_type,
                    pt.id as transaction_id,
                    pt.transaction_number,
                    pt.transaction_date,
                    pt.customer_id,
                    c.first_name || ' ' || c.last_name as customer_name,
                    pt.total_amount as transaction_total,
                    pt.total_discount,
                    pt.discount_breakdown
                 FROM pos_transactions pt
                 LEFT JOIN customers c ON pt.customer_id = c.id
                 WHERE pt.business_id = $1
                    AND pt.total_discount > 0
                    AND NOT EXISTS (
                        SELECT 1 FROM discount_allocations da
                        WHERE da.pos_transaction_id = pt.id
                    )`,
                [businessId]
            );

            // Get unallocated invoices
            const invoiceResult = await client.query(
                `SELECT
                    'INVOICE' as transaction_type,
                    i.id as transaction_id,
                    i.invoice_number,
                    i.invoice_date,
                    i.customer_id,
                    c.first_name || ' ' || c.last_name as customer_name,
                    i.total_amount as transaction_total,
                    i.total_discount,
                    i.discount_breakdown
                 FROM invoices i
                 LEFT JOIN customers c ON i.customer_id = c.id
                 WHERE i.business_id = $1
                    AND i.total_discount > 0
                    AND NOT EXISTS (
                        SELECT 1 FROM discount_allocations da
                        WHERE da.invoice_id = i.id
                    )`,
                [businessId]
            );

            // Combine and sort by date
            const allResults = [...posResult.rows, ...invoiceResult.rows];
            allResults.sort((a, b) => {
                const dateA = new Date(a.transaction_date);
                const dateB = new Date(b.transaction_date);
                return dateB - dateA;
            });

            return allResults;

        } catch (error) {
            log.error('Error getting unallocated discounts', { error: error.message });
            return [];
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 6: BULK OPERATIONS
     * =====================================================
     */

    /**
     * Bulk create allocations for multiple transactions
     */
    static async bulkCreateAllocations(allocations, userId, businessId) {
        const client = await getClient();
        const results = [];

        try {
            await client.query('BEGIN');

            for (const alloc of allocations) {
                try {
                    const result = await this.createAllocation(alloc, userId, businessId);
                    results.push({
                        success: true,
                        allocation_id: result.id,
                        allocation_number: result.allocation_number
                    });
                } catch (error) {
                    results.push({
                        success: false,
                        transaction_id: alloc.pos_transaction_id || alloc.invoice_id,
                        error: error.message
                    });
                }
            }

            const bulkUuid = '00000000-0000-0000-0000-' + Date.now().toString().padStart(12, '0').slice(-12);

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'discount_allocations.bulk_created',
                resourceType: 'discount_allocations',
                resourceId: bulkUuid,
                newValues: {
                    total: allocations.length,
                    successful: results.filter(r => r.success).length,
                    failed: results.filter(r => !r.success).length
                }
            });

            await client.query('COMMIT');
            return results;

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error bulk creating allocations', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Export allocations to CSV
     */
    static async exportAllocations(businessId, startDate, endDate) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT
                    da.allocation_number,
                    da.created_at as allocation_date,
                    da.total_discount_amount,
                    da.allocation_method,
                    da.status,
                    CASE
                        WHEN da.pos_transaction_id IS NOT NULL THEN 'POS'
                        WHEN da.invoice_id IS NOT NULL THEN 'INVOICE'
                    END as transaction_type,
                    COALESCE(pt.transaction_number, i.invoice_number) as transaction_number,
                    COALESCE(pt.customer_id, i.customer_id) as customer_id,
                    COUNT(dal.id) as line_count
                 FROM discount_allocations da
                 LEFT JOIN pos_transactions pt ON da.pos_transaction_id = pt.id
                 LEFT JOIN invoices i ON da.invoice_id = i.id
                 LEFT JOIN discount_allocation_lines dal ON da.id = dal.allocation_id
                 WHERE da.business_id = $1
                    AND da.created_at BETWEEN $2 AND $3
                 GROUP BY da.id, da.allocation_number, da.created_at,
                          da.total_discount_amount, da.allocation_method, da.status,
                          pt.transaction_number, i.invoice_number,
                          pt.customer_id, i.customer_id
                 ORDER BY da.created_at DESC`,
                [businessId, startDate, endDate]
            );

            const csvRows = [];

            // Headers
            csvRows.push([
                'Allocation Number', 'Date', 'Transaction Type', 'Transaction Number',
                'Customer ID', 'Total Discount', 'Method', 'Status', 'Line Items'
            ].join(','));

            // Data rows
            for (const row of result.rows) {
                csvRows.push([
                    row.allocation_number,
                    new Date(row.allocation_date).toISOString().split('T')[0],
                    row.transaction_type || '',
                    row.transaction_number || '',
                    row.customer_id || '',
                    row.total_discount_amount,
                    row.allocation_method,
                    row.status,
                    row.line_count || 0
                ].join(','));
            }

            return csvRows.join('\n');

        } catch (error) {
            log.error('Error exporting allocations', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }
}

export default DiscountAllocationService;
