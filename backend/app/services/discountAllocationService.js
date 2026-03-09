// File: ~/Bizzy_Track_pro/backend/app/services/discountAllocationService.js
// PURPOSE: Allocate discounts across line items for accounting
// PHASE 10.6: COMPLETE VERSION - With correct customer and user column references
// DEPENDS ON: discountCore.js, discount_allocations table, discount_allocation_lines table

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';
import { DiscountCore } from './discountCore.js';

export class DiscountAllocationService {

    /**
     * =====================================================
     * SECTION 1: ALLOCATION METHODS (PURE FUNCTIONS)
     * =====================================================
     */

    /**
     * Allocate discount by line amount (pro-rata)
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
                allocation_weight: 0
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
     * Create discount allocation record with existing client connection
     */
    static async createAllocationWithClient(data, userId, businessId, client) {
        try {
            // Generate allocation number using the existing client
            const allocationNumber = await this.generateAllocationNumber(businessId, client);

            // Insert main allocation record using the existing client
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

            // Create allocation lines if provided (using the same client)
            if (data.lines && data.lines.length > 0) {
                await this.createAllocationLinesWithClient(allocation.id, data.lines, client);
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

            log.info('Discount allocation created with client', {
                businessId,
                userId,
                allocationId: allocation.id,
                allocationNumber
            });

            // Return the allocation with lines
            return await this.getAllocationWithLines(allocation.id, businessId, client);

        } catch (error) {
            log.error('Error creating allocation with client', {
                error: error.message,
                businessId,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Create allocation lines
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
     * Create allocation lines with existing client connection
     */
    static async createAllocationLinesWithClient(allocationId, lines, client) {
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

        log.debug('Allocation lines created with client', {
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
     * Void allocation with reason
     */
    static async voidAllocation(allocationId, reason, userId, businessId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            // Check if allocation exists and get current status
            const allocation = await client.query(
                `SELECT status FROM discount_allocations
                 WHERE id = $1 AND business_id = $2`,
                [allocationId, businessId]
            );

            if (allocation.rows.length === 0) {
                throw new Error('Allocation not found');
            }

            // Already voided
            if (allocation.rows[0].status === 'VOID') {
                throw new Error('Allocation is already voided');
            }

            // Update with void information
            const result = await client.query(
                `UPDATE discount_allocations
                 SET status = 'VOID',
                     void_reason = $3,
                     voided_by = $4,
                     voided_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $1 AND business_id = $2
                 RETURNING *`,
                [allocationId, businessId, reason, userId]
            );

            // Also log to audit for complete history
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'discount_allocation.voided',
                resourceType: 'discount_allocations',
                resourceId: allocationId,
                oldValues: { status: allocation.rows[0].status },
                newValues: {
                    status: 'VOID',
                    reason: reason,
                    voided_by: userId,
                    voided_at: new Date()
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
            // Check if allocation exists
            const allocation = await dbClient.query(
                `SELECT status
                 FROM discount_allocations
                 WHERE id = $1 AND business_id = $2`,
                [allocationId, businessId]
            );

            if (allocation.rows.length === 0) {
                return false;
            }

            // Can void if not already voided
            return allocation.rows[0].status !== 'VOID';

        } catch (error) {
            log.error('Error checking if allocation can be voided', { error: error.message });
            return false;
        } finally {
            if (shouldCloseClient) dbClient.release();
        }
    }

    /**
     * =====================================================
     * SECTION 4: BUSINESS OPERATIONS METHODS
     * =====================================================
     */

    /**
     * Get allocation with complete details including void info
     * FIXED: Use correct customer column names (first_name, last_name, company_name)
     */
    static async getAllocationWithDetails(allocationId, businessId) {
        const client = await getClient();
        
        try {
            // Get allocation with void info - using full_name from users table
            const allocationResult = await client.query(
                `SELECT 
                    da.*,
                    u.email as voided_by_email,
                    u.full_name as voided_by_name,
                    creator.email as created_by_email,
                    creator.full_name as created_by_name
                 FROM discount_allocations da
                 LEFT JOIN users u ON da.voided_by = u.id
                 LEFT JOIN users creator ON da.created_by = creator.id
                 WHERE da.id = $1 AND da.business_id = $2`,
                [allocationId, businessId]
            );

            if (allocationResult.rows.length === 0) {
                return null;
            }

            const allocation = allocationResult.rows[0];

            // Get allocation lines
            const linesResult = await client.query(
                `SELECT * FROM discount_allocation_lines
                 WHERE allocation_id = $1
                 ORDER BY created_at ASC`,
                [allocationId]
            );

            // Get transaction details
            let transactionDetails = null;
            let customerId = null;
            
            if (allocation.pos_transaction_id) {
                const transResult = await client.query(
                    `SELECT transaction_number, transaction_date, customer_id
                     FROM pos_transactions WHERE id = $1`,
                    [allocation.pos_transaction_id]
                );
                transactionDetails = transResult.rows[0];
                if (transactionDetails) customerId = transactionDetails.customer_id;
            } else if (allocation.invoice_id) {
                const transResult = await client.query(
                    `SELECT invoice_number as transaction_number, invoice_date as transaction_date, customer_id
                     FROM invoices WHERE id = $1`,
                    [allocation.invoice_id]
                );
                transactionDetails = transResult.rows[0];
                if (transactionDetails) customerId = transactionDetails.customer_id;
            }

            // Get customer name if available
            if (customerId) {
                const customerResult = await client.query(
                    `SELECT 
                        first_name, 
                        last_name, 
                        company_name,
                        customer_type
                     FROM customers WHERE id = $1`,
                    [customerId]
                );
                
                if (customerResult.rows.length > 0) {
                    const cust = customerResult.rows[0];
                    if (cust.customer_type === 'company' && cust.company_name) {
                        transactionDetails.customer_name = cust.company_name;
                    } else {
                        transactionDetails.customer_name = `${cust.first_name} ${cust.last_name}`;
                    }
                }
            }

            return {
                ...allocation,
                lines: linesResult.rows,
                transaction: transactionDetails
            };
            
        } catch (error) {
            log.error('Error getting allocation with details', { error: error.message, allocationId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get voided allocations with reasons
     * FIXED: Use correct customer column names (first_name, last_name, company_name)
     */
    static async getVoidedAllocations(businessId, startDate = null, endDate = null) {
        const client = await getClient();
        
        try {
            let query = `
                SELECT 
                    da.id,
                    da.allocation_number,
                    da.total_discount_amount,
                    da.allocation_method,
                    da.void_reason,
                    da.voided_at,
                    u.email as voided_by_email,
                    u.full_name as voided_by_name,
                    COALESCE(pt.transaction_number, i.invoice_number) as transaction_number,
                    CASE 
                        WHEN da.pos_transaction_id IS NOT NULL THEN 'POS'
                        WHEN da.invoice_id IS NOT NULL THEN 'INVOICE'
                    END as transaction_type,
                    CASE 
                        WHEN c.customer_type = 'company' AND c.company_name IS NOT NULL THEN c.company_name
                        ELSE c.first_name || ' ' || c.last_name
                    END as customer_name
                FROM discount_allocations da
                LEFT JOIN users u ON da.voided_by = u.id
                LEFT JOIN pos_transactions pt ON da.pos_transaction_id = pt.id
                LEFT JOIN invoices i ON da.invoice_id = i.id
                LEFT JOIN customers c ON COALESCE(pt.customer_id, i.customer_id) = c.id
                WHERE da.business_id = $1
                  AND da.status = 'VOID'
            `;
            
            const params = [businessId];
            let paramIndex = 2;
            
            if (startDate) {
                query += ` AND da.voided_at >= $${paramIndex}`;
                params.push(startDate);
                paramIndex++;
            }
            
            if (endDate) {
                query += ` AND da.voided_at <= $${paramIndex}`;
                params.push(endDate);
                paramIndex++;
            }
            
            query += ` ORDER BY da.voided_at DESC`;
            
            const result = await client.query(query, params);
            return result.rows;
            
        } catch (error) {
            log.error('Error getting voided allocations', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get void reason statistics
     */
    static async getVoidReasonStats(businessId, startDate = null, endDate = null) {
        const client = await getClient();
        
        try {
            let query = `
                SELECT 
                    void_reason,
                    COUNT(*) as void_count,
                    SUM(total_discount_amount) as total_discount_voided,
                    MIN(voided_at) as first_voided,
                    MAX(voided_at) as last_voided
                FROM discount_allocations
                WHERE business_id = $1
                  AND status = 'VOID'
                  AND void_reason IS NOT NULL
            `;
            
            const params = [businessId];
            let paramIndex = 2;
            
            if (startDate) {
                query += ` AND voided_at >= $${paramIndex}`;
                params.push(startDate);
                paramIndex++;
            }
            
            if (endDate) {
                query += ` AND voided_at <= $${paramIndex}`;
                params.push(endDate);
                paramIndex++;
            }
            
            query += ` GROUP BY void_reason ORDER BY void_count DESC`;
            
            const result = await client.query(query, params);
            return result.rows;
            
        } catch (error) {
            log.error('Error getting void reason stats', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 5: VALIDATION
     * =====================================================
     */

    /**
     * Validate allocation total matches expected total
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
     * SECTION 6: REPORTING
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
     * FIXED: Use correct customer column names (first_name, last_name, company_name)
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
                    CASE 
                        WHEN c.customer_type = 'company' AND c.company_name IS NOT NULL THEN c.company_name
                        ELSE c.first_name || ' ' || c.last_name
                    END as customer_name,
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
                    CASE 
                        WHEN c.customer_type = 'company' AND c.company_name IS NOT NULL THEN c.company_name
                        ELSE c.first_name || ' ' || c.last_name
                    END as customer_name,
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
     * SECTION 7: BULK OPERATIONS
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
     * FIXED: Use correct customer column names (first_name, last_name, company_name)
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
                    da.void_reason,
                    da.voided_at,
                    CASE
                        WHEN da.pos_transaction_id IS NOT NULL THEN 'POS'
                        WHEN da.invoice_id IS NOT NULL THEN 'INVOICE'
                    END as transaction_type,
                    COALESCE(pt.transaction_number, i.invoice_number) as transaction_number,
                    COALESCE(pt.customer_id, i.customer_id) as customer_id,
                    CASE 
                        WHEN c.customer_type = 'company' AND c.company_name IS NOT NULL THEN c.company_name
                        ELSE c.first_name || ' ' || c.last_name
                    END as customer_name,
                    COUNT(dal.id) as line_count
                 FROM discount_allocations da
                 LEFT JOIN pos_transactions pt ON da.pos_transaction_id = pt.id
                 LEFT JOIN invoices i ON da.invoice_id = i.id
                 LEFT JOIN customers c ON COALESCE(pt.customer_id, i.customer_id) = c.id
                 LEFT JOIN discount_allocation_lines dal ON da.id = dal.allocation_id
                 WHERE da.business_id = $1
                    AND da.created_at BETWEEN $2 AND $3
                 GROUP BY da.id, da.allocation_number, da.created_at,
                          da.total_discount_amount, da.allocation_method, da.status,
                          da.void_reason, da.voided_at,
                          pt.transaction_number, i.invoice_number,
                          pt.customer_id, i.customer_id, 
                          c.customer_type, c.company_name, c.first_name, c.last_name
                 ORDER BY da.created_at DESC`,
                [businessId, startDate, endDate]
            );

            const csvRows = [];

            // Headers
            csvRows.push([
                'Allocation Number', 'Date', 'Transaction Type', 'Transaction Number',
                'Customer Name', 'Total Discount', 'Method', 'Status', 'Line Items',
                'Void Reason', 'Voided At'
            ].join(','));

            // Data rows
            for (const row of result.rows) {
                csvRows.push([
                    row.allocation_number,
                    new Date(row.allocation_date).toISOString().split('T')[0],
                    row.transaction_type || '',
                    row.transaction_number || '',
                    row.customer_name || '',
                    row.total_discount_amount,
                    row.allocation_method,
                    row.status,
                    row.line_count || 0,
                    row.void_reason || '',
                    row.voided_at ? new Date(row.voided_at).toISOString().split('T')[0] : ''
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
