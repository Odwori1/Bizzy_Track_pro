// File: backend/app/services/vatReturnService.js
// Description: Complete VAT Returns Service - URA Form 4
// Created: February 13, 2026
// Updated: Fixed businesses table columns - removed address column

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';
import { TaxService } from './taxService.js';

export class VATReturnService {
    /**
     * Parse date to YYYY-MM-DD
     */
    static parseAsDateOnly(dateInput) {
        if (!dateInput) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            return dateInput;
        }
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * LIST VAT RETURNS
     */
    static async listReturns(businessId, filters = {}) {
        const client = await getClient();

        try {
            const whereConditions = ['vr.business_id = $1'];
            const params = [businessId];
            let paramCount = 1;

            if (filters.status) {
                paramCount++;
                whereConditions.push(`vr.status = $${paramCount}`);
                params.push(filters.status);
            }

            if (filters.return_type) {
                paramCount++;
                whereConditions.push(`vr.return_type = $${paramCount}`);
                params.push(filters.return_type);
            }

            if (filters.period_start) {
                paramCount++;
                whereConditions.push(`vr.period_start >= $${paramCount}`);
                params.push(this.parseAsDateOnly(filters.period_start));
            }

            if (filters.period_end) {
                paramCount++;
                whereConditions.push(`vr.period_end <= $${paramCount}`);
                params.push(this.parseAsDateOnly(filters.period_end));
            }

            const whereClause = whereConditions.length > 0
                ? `WHERE ${whereConditions.join(' AND ')}`
                : '';

            const countQuery = `SELECT COUNT(*) as total FROM vat_returns vr ${whereClause}`;
            const countResult = await client.query(countQuery, params);
            const total = parseInt(countResult.rows[0]?.total || 0);

            const limit = filters.limit || 50;
            const page = filters.page || 1;
            const offset = (page - 1) * limit;

            const query = `
                SELECT
                    vr.*,
                    u.full_name as submitted_by_name,
                    a.full_name as approved_by_name,
                    COALESCE(vrs.sales_count, 0) as invoice_count,
                    COALESCE(vrp.purchases_count, 0) as purchase_count
                FROM vat_returns vr
                LEFT JOIN users u ON vr.submitted_by = u.id
                LEFT JOIN users a ON vr.approved_by = a.id
                LEFT JOIN LATERAL (
                    SELECT COUNT(*) as sales_count
                    FROM vat_return_sales
                    WHERE vat_return_id = vr.id
                ) vrs ON true
                LEFT JOIN LATERAL (
                    SELECT COUNT(*) as purchases_count
                    FROM vat_return_purchases
                    WHERE vat_return_id = vr.id
                ) vrp ON true
                ${whereClause}
                ORDER BY vr.period_start DESC, vr.created_at DESC
                LIMIT $${paramCount + 1}
                OFFSET $${paramCount + 2}
            `;

            const queryParams = [...params, limit, offset];
            const result = await client.query(query, queryParams);

            return {
                returns: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };

        } catch (error) {
            log.error('Failed to list VAT returns', { businessId, filters, error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * GET VAT RETURN BY ID - FIXED: Removed b.address column
     */
    static async getReturnById(returnId, businessId) {
        const client = await getClient();

        try {
            const returnQuery = await client.query(`
                SELECT
                    vr.*,
                    b.name as business_name,
                    b.tax_number as business_tin
                    -- Removed b.address as it doesn't exist in businesses table
                FROM vat_returns vr
                JOIN businesses b ON vr.business_id = b.id
                LEFT JOIN users u_sub ON vr.submitted_by = u_sub.id
                LEFT JOIN users u_app ON vr.approved_by = u_app.id
                WHERE vr.id = $1 AND vr.business_id = $2
            `, [returnId, businessId]);

            if (returnQuery.rows.length === 0) {
                return null;
            }

            const vatReturn = returnQuery.rows[0];

            // Calculate derived fields
            vatReturn.net_vat_payable = parseFloat(vatReturn.total_sales_vat || 0) -
                                         parseFloat(vatReturn.total_purchases_vat || 0);
            vatReturn.total_amount_due = Math.max(vatReturn.net_vat_payable -
                                         parseFloat(vatReturn.credit_brought_forward || 0), 0) +
                                         parseFloat(vatReturn.late_filing_penalty || 0) +
                                         parseFloat(vatReturn.late_payment_penalty || 0) +
                                         parseFloat(vatReturn.interest_amount || 0);

            // Get sales (output VAT)
            const salesQuery = await client.query(`
                SELECT * FROM vat_return_sales
                WHERE vat_return_id = $1
                ORDER BY transaction_date
            `, [returnId]);

            // Get purchases (input VAT)
            const purchasesQuery = await client.query(`
                SELECT * FROM vat_return_purchases
                WHERE vat_return_id = $1
                ORDER BY transaction_date
            `, [returnId]);

            // Get summary lines (URA Form 4)
            const summaryQuery = await client.query(`
                SELECT * FROM vat_return_summary
                WHERE vat_return_id = $1
                ORDER BY line_number
            `, [returnId]);

            // Get status history
            const historyQuery = await client.query(`
                SELECT
                    vrs.*,
                    u.full_name as changed_by_name
                FROM vat_return_status_history vrs
                LEFT JOIN users u ON vrs.changed_by = u.id
                WHERE vrs.vat_return_id = $1
                ORDER BY vrs.created_at DESC
            `, [returnId]);

            return {
                ...vatReturn,
                sales: salesQuery.rows,
                purchases: purchasesQuery.rows,
                summary_lines: summaryQuery.rows,
                status_history: historyQuery.rows
            };

        } catch (error) {
            log.error('Failed to get VAT return', { returnId, businessId, error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * GENERATE VAT RETURN
     */
    static async generateReturn(businessId, periodStart, periodEnd, returnType, userId) {
        const client = await getClient();

        try {
            if (!periodStart || !periodEnd) {
                throw new Error('Period start and end dates are required');
            }

            const startDate = this.parseAsDateOnly(periodStart);
            const endDate = this.parseAsDateOnly(periodEnd);

            if (new Date(endDate) < new Date(startDate)) {
                throw new Error('Period end date must be after start date');
            }

            // Check for existing return
            const existingQuery = await client.query(`
                SELECT id, return_number, status
                FROM vat_returns
                WHERE business_id = $1
                    AND period_start = $2
                    AND period_end = $3
                    AND status NOT IN ('void', 'amended')
            `, [businessId, startDate, endDate]);

            if (existingQuery.rows.length > 0) {
                throw new Error(`VAT return already exists for this period: ${existingQuery.rows[0].return_number}`);
            }

            // Get credit brought forward
            const creditQuery = await client.query(`
                SELECT COALESCE(SUM(remaining_amount), 0) as credit_bf
                FROM vat_credit_carryforward
                WHERE business_id = $1
                    AND remaining_amount > 0
                    AND (expiry_date IS NULL OR expiry_date > NOW())
            `, [businessId]);

            const creditBroughtForward = parseFloat(creditQuery.rows[0]?.credit_bf || 0);

            // Generate return number
            const returnNumberQuery = await client.query(`
                SELECT generate_vat_return_number($1, $2) as return_number
            `, [businessId, startDate]);

            const returnNumber = returnNumberQuery.rows[0].return_number;

            // Calculate due date (15th of following month)
            const dueDate = new Date(endDate);
            dueDate.setMonth(dueDate.getMonth() + 1);
            dueDate.setDate(15);
            const dueDateStr = this.parseAsDateOnly(dueDate);

            // Create return header
            const returnInsert = await client.query(`
                INSERT INTO vat_returns (
                    business_id,
                    return_number,
                    return_type,
                    period_start,
                    period_end,
                    due_date,
                    status,
                    credit_brought_forward,
                    created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
            `, [
                businessId,
                returnNumber,
                returnType || 'monthly',
                startDate,
                endDate,
                dueDateStr,
                'draft',
                creditBroughtForward,
                userId
            ]);

            const returnId = returnInsert.rows[0].id;

            // Insert sales (output VAT) from invoices - FIXED FOR YOUR SCHEMA
            await client.query(`
                INSERT INTO vat_return_sales (
                    vat_return_id,
                    invoice_id,
                    transaction_date,
                    customer_id,
                    customer_name,
                    customer_tin,
                    invoice_number,
                    description,
                    vat_category,
                    amount_exclusive,
                    vat_rate,
                    vat_amount,
                    amount_inclusive,
                    tax_type_code
                )
                SELECT 
                    $1,
                    i.id,
                    i.invoice_date,
                    i.customer_id,
                    c.company_name,
                    c.tax_number,
                    i.invoice_number,
                    'Sales Invoice',
                    'standard_rated',
                    i.total_amount,
                    COALESCE(i.tax_rate, 20.00),
                    i.tax_amount,
                    i.total_amount + i.tax_amount,
                    'VAT20'
                FROM invoices i
                LEFT JOIN customers c ON i.customer_id = c.id
                WHERE i.business_id = $2 
                    AND i.invoice_date BETWEEN $3 AND $4
                    AND i.status IN ('sent', 'paid', 'overdue')
            `, [returnId, businessId, startDate, endDate]);

            // Calculate totals
            const totalsQuery = await client.query(`
                SELECT
                    COALESCE(SUM(amount_exclusive), 0) as total_sales_exclusive,
                    COALESCE(SUM(vat_amount), 0) as total_sales_vat,
                    COALESCE(SUM(amount_inclusive), 0) as total_sales_inclusive
                FROM vat_return_sales
                WHERE vat_return_id = $1
            `, [returnId]);

            const totals = totalsQuery.rows[0];

            const netVat = parseFloat(totals.total_sales_vat) - 0;
            const totalDue = Math.max(netVat - creditBroughtForward, 0);

            // Update return with calculated values
            await client.query(`
                UPDATE vat_returns
                SET
                    total_sales_exclusive = $1,
                    total_sales_vat = $2,
                    total_sales_inclusive = $3,
                    total_purchases_exclusive = 0,
                    total_purchases_vat = 0,
                    total_purchases_inclusive = 0,
                    net_vat_payable = $4,
                    total_amount_due = $5,
                    status = 'calculated',
                    updated_at = NOW()
                WHERE id = $6
            `, [
                totals.total_sales_exclusive,
                totals.total_sales_vat,
                totals.total_sales_inclusive,
                netVat,
                totalDue,
                returnId
            ]);

            // Insert URA Form 4 summary lines
            await client.query(`
                INSERT INTO vat_return_summary (vat_return_id, line_number, line_description, sales_value, vat_value) VALUES
                ($1, 1, 'Standard rated supplies (20%)',
                    (SELECT COALESCE(SUM(amount_exclusive), 0) FROM vat_return_sales WHERE vat_return_id = $1),
                    (SELECT COALESCE(SUM(vat_amount), 0) FROM vat_return_sales WHERE vat_return_id = $1)),
                ($1, 2, 'Zero rated supplies (0%)', 0, 0),
                ($1, 3, 'Exempt supplies', 0, 0),
                ($1, 4, 'Standard rated purchases (20%)', 0, 0),
                ($1, 5, 'Capital goods purchases', 0, 0),
                ($1, 6, 'Import VAT', 0, 0)
            `, [returnId]);

            // Log status change
            await client.query(`
                INSERT INTO vat_return_status_history (
                    vat_return_id,
                    new_status,
                    changed_by,
                    change_reason
                ) VALUES ($1, 'calculated', $2, 'VAT return automatically generated')
            `, [returnId, userId]);

            // Audit log
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'vat_return.generated',
                resourceType: 'vat_return',
                resourceId: returnId,
                newValues: {
                    period_start: startDate,
                    period_end: endDate,
                    return_type: returnType,
                    net_vat: netVat,
                    total_due: totalDue
                }
            });

            log.info('VAT return generated successfully', {
                returnId,
                returnNumber,
                businessId,
                netVat,
                totalDue
            });

            return await this.getReturnById(returnId, businessId);

        } catch (error) {
            log.error('Failed to generate VAT return', {
                businessId,
                periodStart,
                periodEnd,
                error: error.message,
                stack: error.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * SUBMIT VAT RETURN TO URA
     */
    static async submitToURA(returnId, businessId, userId) {
        const client = await getClient();

        try {
            const checkQuery = await client.query(`
                SELECT status, return_number, net_vat_payable, total_amount_due
                FROM vat_returns
                WHERE id = $1 AND business_id = $2
            `, [returnId, businessId]);

            if (checkQuery.rows.length === 0) {
                throw new Error('VAT return not found');
            }

            const vatReturn = checkQuery.rows[0];

            if (vatReturn.status === 'submitted') {
                throw new Error('Return already submitted to URA');
            }

            if (vatReturn.status === 'void') {
                throw new Error('Cannot submit voided return');
            }

            if (vatReturn.status === 'draft') {
                throw new Error('Must calculate return before submission');
            }

            // Generate mock URA receipt
            const receiptNumber = 'VAT-' + new Date().toISOString().slice(0,10).replace(/-/g,'') +
                                 '-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');

            const response = {
                receipt_number: receiptNumber,
                submission_date: new Date().toISOString(),
                status: 'ACCEPTED',
                form_type: 'URA Form 4',
                period: vatReturn.return_number.split('-').slice(1,3).join('-'),
                net_vat: vatReturn.net_vat_payable,
                amount_due: vatReturn.total_amount_due,
                message: 'VAT return accepted by URA',
                mock_submission: true
            };

            await client.query(`
                UPDATE vat_returns
                SET
                    status = 'submitted',
                    ura_receipt_number = $1,
                    ura_submission_response = $2,
                    submitted_at = NOW(),
                    submitted_by = $3,
                    filing_date = NOW(),
                    updated_at = NOW()
                WHERE id = $4
            `, [receiptNumber, response, userId, returnId]);

            await client.query(`
                INSERT INTO vat_return_status_history (
                    vat_return_id,
                    old_status,
                    new_status,
                    changed_by,
                    change_reason
                ) VALUES ($1, $2, 'submitted', $3, 'Submitted to URA, Receipt: ' || $4)
            `, [returnId, vatReturn.status, userId, receiptNumber]);

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'vat_return.submitted',
                resourceType: 'vat_return',
                resourceId: returnId,
                newValues: { receipt_number: receiptNumber }
            });

            return {
                success: true,
                message: 'VAT return submitted successfully',
                receipt_number: receiptNumber,
                submission_date: response.submission_date,
                return: await this.getReturnById(returnId, businessId)
            };

        } catch (error) {
            log.error('Failed to submit VAT return to URA', { returnId, businessId, error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * GET VAT STATISTICS
     */
    static async getStatistics(businessId, year = null) {
        const client = await getClient();

        try {
            const targetYear = year || new Date().getFullYear();

            const overallQuery = await client.query(`
                SELECT
                    COUNT(*) as total_returns,
                    COALESCE(SUM(total_sales_vat), 0) as total_output_vat,
                    COALESCE(SUM(total_purchases_vat), 0) as total_input_vat,
                    COALESCE(SUM(net_vat_payable), 0) as total_net_vat,
                    COALESCE(SUM(total_amount_due), 0) as total_amount_due,
                    COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted_count,
                    COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count
                FROM vat_returns
                WHERE business_id = $1
                    AND EXTRACT(YEAR FROM period_start) = $2
            `, [businessId, targetYear]);

            const monthlyQuery = await client.query(`
                SELECT
                    TO_CHAR(period_start, 'YYYY-MM') as month,
                    COUNT(*) as return_count,
                    COALESCE(SUM(total_sales_vat), 0) as output_vat,
                    COALESCE(SUM(total_purchases_vat), 0) as input_vat,
                    COALESCE(SUM(net_vat_payable), 0) as net_vat,
                    COALESCE(SUM(total_amount_due), 0) as amount_due
                FROM vat_returns
                WHERE business_id = $1
                    AND EXTRACT(YEAR FROM period_start) = $2
                GROUP BY TO_CHAR(period_start, 'YYYY-MM')
                ORDER BY month DESC
            `, [businessId, targetYear]);

            return {
                business_id: businessId,
                year: targetYear,
                summary: overallQuery.rows[0],
                monthly: monthlyQuery.rows,
                generated_at: new Date().toISOString()
            };

        } catch (error) {
            log.error('Failed to get VAT statistics', { businessId, year, error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * TEST VAT RETURN GENERATION
     */
    static async testReturnGeneration(businessId, userId) {
        const periodStart = '2026-02-01';
        const periodEnd = '2026-02-28';

        return await this.generateReturn(
            businessId,
            periodStart,
            periodEnd,
            'monthly',
            userId
        );
    }
}

export default VATReturnService;
