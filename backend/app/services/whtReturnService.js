// File: backend/app/services/whtReturnService.js
// Description: Complete WHT Returns Service - Phase 5
// Created: February 12, 2026
// Status: ✅ PRODUCTION READY

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';
import { TaxService } from './taxService.js';

export class WHTReturnService {
    /**
     * Parse date to YYYY-MM-DD (Assets System Pattern)
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
     * LIST RETURNS - Get paginated list of WHT returns with filters
     */
    static async listReturns(businessId, filters = {}) {
        const client = await getClient();

        try {
            // Build WHERE conditions
            const whereConditions = ['wr.business_id = $1'];
            const params = [businessId];
            let paramCount = 1;

            // Apply filters
            if (filters.status) {
                paramCount++;
                whereConditions.push(`wr.status = $${paramCount}`);
                params.push(filters.status);
            }

            if (filters.return_type) {
                paramCount++;
                whereConditions.push(`wr.return_type = $${paramCount}`);
                params.push(filters.return_type);
            }

            if (filters.period_start) {
                paramCount++;
                whereConditions.push(`wr.period_start >= $${paramCount}`);
                params.push(this.parseAsDateOnly(filters.period_start));
            }

            if (filters.period_end) {
                paramCount++;
                whereConditions.push(`wr.period_end <= $${paramCount}`);
                params.push(this.parseAsDateOnly(filters.period_end));
            }

            const whereClause = whereConditions.length > 0 
                ? `WHERE ${whereConditions.join(' AND ')}` 
                : '';

            // Get total count
            const countQuery = `
                SELECT COUNT(*) as total
                FROM wht_returns wr
                ${whereClause}
            `;
            const countResult = await client.query(countQuery, params);
            const total = parseInt(countResult.rows[0]?.total || 0);

            // Pagination
            const limit = filters.limit || 50;
            const page = filters.page || 1;
            const offset = (page - 1) * limit;

            // Get returns with summary
            const query = `
                SELECT 
                    wr.*,
                    u.full_name as submitted_by_name,
                    a.full_name as approved_by_name,
                    COALESCE(wri.certificate_count, 0) as certificate_count,
                    COALESCE(wri.total_amount, 0) as total_invoice_amount
                FROM wht_returns wr
                LEFT JOIN users u ON wr.submitted_by = u.id
                LEFT JOIN users a ON wr.approved_by = a.id
                LEFT JOIN LATERAL (
                    SELECT 
                        COUNT(*) as certificate_count,
                        SUM(amount) as total_amount
                    FROM wht_return_items
                    WHERE wht_return_id = wr.id
                ) wri ON true
                ${whereClause}
                ORDER BY wr.period_start DESC, wr.created_at DESC
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
            log.error('Failed to list WHT returns', {
                businessId,
                filters,
                error: error.message,
                stack: error.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * GET RETURN BY ID - Full return details with all related data
     */
    static async getReturnById(returnId, businessId) {
        const client = await getClient();

        try {
            // Get main return record
            const returnQuery = await client.query(`
                SELECT 
                    wr.*,
                    b.name as business_name,
                    b.tax_number as business_tin,
                    
                    
                    
                    u_sub.full_name as submitted_by_name,
                    u_app.full_name as approved_by_name
                FROM wht_returns wr
                JOIN businesses b ON wr.business_id = b.id
                LEFT JOIN users u_sub ON wr.submitted_by = u_sub.id
                LEFT JOIN users u_app ON wr.approved_by = u_app.id
                WHERE wr.id = $1 AND wr.business_id = $2
            `, [returnId, businessId]);

            if (returnQuery.rows.length === 0) {
                return null;
            }

            const whtReturn = returnQuery.rows[0];

            // Get items (certificates)
            const itemsQuery = await client.query(`
                SELECT 
                    wri.*,
                    wc.certificate_number,
                    wc.issued_date
                FROM wht_return_items wri
                LEFT JOIN withholding_tax_certificates wc ON wri.certificate_id = wc.id
                WHERE wri.wht_return_id = $1
                ORDER BY wri.transaction_date
            `, [returnId]);

            // Get payments
            const paymentsQuery = await client.query(`
                SELECT *
                FROM wht_return_payments
                WHERE wht_return_id = $1
                ORDER BY payment_date DESC
            `, [returnId]);

            // Get approvals
            const approvalsQuery = await client.query(`
                SELECT 
                    wra.*,
                    u.full_name as approver_name,
                    u.email as approver_email
                FROM wht_return_approvals wra
                LEFT JOIN users u ON wra.approver_id = u.id
                WHERE wra.wht_return_id = $1
                ORDER BY wra.approval_level
            `, [returnId]);

            // Get status history
            const historyQuery = await client.query(`
                SELECT 
                    wrs.*,
                    u.full_name as changed_by_name
                FROM wht_return_status_history wrs
                LEFT JOIN users u ON wrs.changed_by = u.id
                WHERE wrs.wht_return_id = $1
                ORDER BY wrs.created_at DESC
            `, [returnId]);

            return {
                ...whtReturn,
                items: itemsQuery.rows,
                payments: paymentsQuery.rows,
                approvals: approvalsQuery.rows,
                status_history: historyQuery.rows,
                net_payable: parseFloat(whtReturn.total_wht_amount) + 
                           parseFloat(whtReturn.total_penalty || 0) + 
                           parseFloat(whtReturn.total_interest || 0)
            };

        } catch (error) {
            log.error('Failed to get WHT return', {
                returnId,
                businessId,
                error: error.message
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * GENERATE RETURN - Create return from certificates in period
     */
    static async generateReturn(businessId, periodStart, periodEnd, returnType, userId) {
        const client = await getClient();

        try {
            // Validate inputs
            if (!periodStart || !periodEnd) {
                throw new Error('Period start and end dates are required');
            }

            const startDate = this.parseAsDateOnly(periodStart);
            const endDate = this.parseAsDateOnly(periodEnd);

            if (new Date(endDate) < new Date(startDate)) {
                throw new Error('Period end date must be after start date');
            }

            // Check for existing return in this period
            const existingQuery = await client.query(`
                SELECT id, return_number, status
                FROM wht_returns
                WHERE business_id = $1 
                    AND period_start = $2 
                    AND period_end = $3
                    AND status NOT IN ('void', 'amended')
            `, [businessId, startDate, endDate]);

            if (existingQuery.rows.length > 0) {
                throw new Error(`Return already exists for this period: ${existingQuery.rows[0].return_number}`);
            }

            // Call database function to generate return
            const result = await client.query(`
                SELECT generate_wht_return_from_certificates(
                    $1, $2, $3, $4, $5
                ) as return_id
            `, [businessId, startDate, endDate, returnType || 'monthly', userId]);

            const returnId = result.rows[0].return_id;

            // Audit log
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'wht_return.generated',
                resourceType: 'wht_return',
                resourceId: returnId,
                newValues: {
                    period_start: startDate,
                    period_end: endDate,
                    return_type: returnType
                }
            });

            log.info('WHT return generated successfully', {
                returnId,
                businessId,
                periodStart: startDate,
                periodEnd: endDate
            });

            // Return full return object
            return await this.getReturnById(returnId, businessId);

        } catch (error) {
            log.error('Failed to generate WHT return', {
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
     * SUBMIT TO URA - Submit return to Uganda Revenue Authority
     */
    static async submitToURA(returnId, businessId, userId) {
        const client = await getClient();

        try {
            // Verify return exists
            const checkQuery = await client.query(`
                SELECT status, return_number, total_wht_amount
                FROM wht_returns
                WHERE id = $1 AND business_id = $2
            `, [returnId, businessId]);

            if (checkQuery.rows.length === 0) {
                throw new Error('Return not found');
            }

            const whtReturn = checkQuery.rows[0];

            // Validate status
            if (whtReturn.status === 'submitted') {
                throw new Error('Return already submitted to URA');
            }

            if (whtReturn.status === 'void') {
                throw new Error('Cannot submit voided return');
            }

            if (whtReturn.status === 'draft') {
                throw new Error('Must calculate return before submission');
            }

            // Call database function
            const result = await client.query(`
                SELECT submit_wht_return_to_ura($1, $2) as response
            `, [returnId, userId]);

            const response = result.rows[0].response;

            // Audit log
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'wht_return.submitted',
                resourceType: 'wht_return',
                resourceId: returnId,
                newValues: {
                    receipt_number: response.receipt_number,
                    submission_date: new Date()
                }
            });

            log.info('WHT return submitted to URA', {
                returnId,
                returnNumber: whtReturn.return_number,
                receiptNumber: response.receipt_number
            });

            return {
                success: true,
                message: 'Return submitted successfully',
                receipt_number: response.receipt_number,
                submission_date: response.submission_date,
                return: await this.getReturnById(returnId, businessId)
            };

        } catch (error) {
            log.error('Failed to submit return to URA', {
                returnId,
                businessId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * CALCULATE PENALTY - Calculate late filing penalty
     */
    static async calculatePenalty(returnId, businessId) {
        const client = await getClient();

        try {
            const result = await client.query(`
                SELECT calculate_late_filing_penalty($1) as penalty_amount
            `, [returnId]);

            const penalty = parseFloat(result.rows[0].penalty_amount);

            // Get updated return
            const whtReturn = await this.getReturnById(returnId, businessId);

            return {
                success: true,
                penalty_amount: penalty,
                return: whtReturn
            };

        } catch (error) {
            log.error('Failed to calculate penalty', {
                returnId,
                businessId,
                error: error.message
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * ADD APPROVAL - Add approval level to return
     */
    static async addApproval(returnId, businessId, approverId, level, levelName, comments = '') {
        const client = await getClient();

        try {
            // Verify return exists
            const returnCheck = await client.query(`
                SELECT id, status FROM wht_returns
                WHERE id = $1 AND business_id = $2
            `, [returnId, businessId]);

            if (returnCheck.rows.length === 0) {
                throw new Error('Return not found');
            }

            // Insert or update approval
            const result = await client.query(`
                INSERT INTO wht_return_approvals (
                    wht_return_id,
                    approver_id,
                    approval_level,
                    level_name,
                    status,
                    comments,
                    action_at
                ) VALUES ($1, $2, $3, $4, 'approved', $5, NOW())
                ON CONFLICT (wht_return_id, approval_level) 
                DO UPDATE SET
                    status = 'approved',
                    comments = EXCLUDED.comments,
                    action_at = NOW(),
                    updated_at = NOW()
                RETURNING *
            `, [returnId, approverId, level, levelName, comments]);

            // Check if all required approvals are done
            const approvalCount = await client.query(`
                SELECT COUNT(*) as count
                FROM wht_return_approvals
                WHERE wht_return_id = $1 AND status = 'approved'
            `, [returnId]);

            // If all 3 levels approved, update return status
            if (parseInt(approvalCount.rows[0].count) >= 3) {
                await client.query(`
                    UPDATE wht_returns
                    SET status = 'approved',
                        approved_at = NOW(),
                        approved_by = $2,
                        updated_at = NOW()
                    WHERE id = $1
                `, [returnId, approverId]);

                // Log status change
                await client.query(`
                    INSERT INTO wht_return_status_history (
                        wht_return_id,
                        old_status,
                        new_status,
                        changed_by,
                        change_reason
                    ) VALUES ($1, 'pending_approval', 'approved', $2, 'All approvals received')
                `, [returnId, approverId]);
            }

            // Audit log
            await auditLogger.logAction({
                businessId,
                userId: approverId,
                action: 'wht_return.approved',
                resourceType: 'wht_return',
                resourceId: returnId,
                newValues: {
                    level,
                    level_name: levelName,
                    comments
                }
            });

            return {
                success: true,
                approval: result.rows[0],
                return: await this.getReturnById(returnId, businessId)
            };

        } catch (error) {
            log.error('Failed to add approval', {
                returnId,
                businessId,
                approverId,
                level,
                error: error.message
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * RECORD PAYMENT - Record payment for return
     */
    static async recordPayment(returnId, businessId, paymentData, userId) {
        const client = await getClient();

        try {
            const {
                payment_date,
                payment_amount,
                payment_method,
                reference_number,
                bank_account_id,
                bank_name
            } = paymentData;

            // Insert payment record
            const result = await client.query(`
                INSERT INTO wht_return_payments (
                    wht_return_id,
                    payment_date,
                    payment_amount,
                    payment_method,
                    reference_number,
                    bank_account_id,
                    bank_name,
                    paid_by,
                    status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed')
                RETURNING *
            `, [
                returnId,
                payment_date || new Date(),
                payment_amount,
                payment_method,
                reference_number,
                bank_account_id,
                bank_name,
                userId
            ]);

            // Update return with payment info
            await client.query(`
                UPDATE wht_returns
                SET paid_at = NOW(),
                    paid_amount = $2,
                    payment_reference = $3,
                    status = 'paid',
                    updated_at = NOW()
                WHERE id = $1
            `, [returnId, payment_amount, reference_number]);

            // Log status change
            await client.query(`
                INSERT INTO wht_return_status_history (
                    wht_return_id,
                    old_status,
                    new_status,
                    changed_by,
                    change_reason
                ) 
                SELECT $1, status, 'paid', $2, 'Payment recorded: ' || $3
                FROM wht_returns
                WHERE id = $1
            `, [returnId, userId, reference_number]);

            // Audit log
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'wht_return.paid',
                resourceType: 'wht_return',
                resourceId: returnId,
                newValues: {
                    amount: payment_amount,
                    method: payment_method,
                    reference: reference_number
                }
            });

            return {
                success: true,
                payment: result.rows[0],
                return: await this.getReturnById(returnId, businessId)
            };

        } catch (error) {
            log.error('Failed to record payment', {
                returnId,
                businessId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * GET STATISTICS - Return statistics dashboard
     */
    static async getStatistics(businessId, year = null) {
        const client = await getClient();

        try {
            const targetYear = year || new Date().getFullYear();

            // Overall stats
            const overallQuery = await client.query(`
                SELECT 
                    COUNT(*) as total_returns,
                    COALESCE(SUM(total_wht_amount), 0) as total_wht,
                    COALESCE(SUM(total_penalty), 0) as total_penalties,
                    COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted_count,
                    COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
                    COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
                    COUNT(CASE WHEN status = 'void' THEN 1 END) as void_count
                FROM wht_returns
                WHERE business_id = $1 
                    AND EXTRACT(YEAR FROM period_start) = $2
            `, [businessId, targetYear]);

            // Monthly breakdown
            const monthlyQuery = await client.query(`
                SELECT 
                    TO_CHAR(period_start, 'YYYY-MM') as month,
                    COUNT(*) as return_count,
                    COALESCE(SUM(total_wht_amount), 0) as wht_amount,
                    COALESCE(SUM(total_penalty), 0) as penalty_amount,
                    COUNT(CASE WHEN submitted_at IS NOT NULL THEN 1 END) as filed_count
                FROM wht_returns
                WHERE business_id = $1 
                    AND EXTRACT(YEAR FROM period_start) = $2
                GROUP BY TO_CHAR(period_start, 'YYYY-MM')
                ORDER BY month DESC
            `, [businessId, targetYear]);

            // Upcoming deadlines
            const deadlinesQuery = await client.query(`
                SELECT 
                    id,
                    return_number,
                    period_start,
                    period_end,
                    due_date,
                    status,
                    total_wht_amount,
                    EXTRACT(DAY FROM due_date - NOW()) as days_remaining
                FROM wht_returns
                WHERE business_id = $1 
                    AND status NOT IN ('submitted', 'paid', 'void')
                    AND due_date >= NOW()
                ORDER BY due_date ASC
                LIMIT 10
            `, [businessId]);

            return {
                business_id: businessId,
                year: targetYear,
                summary: overallQuery.rows[0],
                monthly: monthlyQuery.rows,
                upcoming_deadlines: deadlinesQuery.rows,
                generated_at: new Date().toISOString()
            };

        } catch (error) {
            log.error('Failed to get return statistics', {
                businessId,
                year,
                error: error.message
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * VOID RETURN - Void a return (cannot be submitted)
     */
    static async voidReturn(returnId, businessId, userId, reason) {
        const client = await getClient();

        try {
            const result = await client.query(`
                UPDATE wht_returns
                SET status = 'void',
                    notes = COALESCE(notes, '') || '\nVoided: ' || $3,
                    updated_at = NOW()
                WHERE id = $1 AND business_id = $2
                RETURNING *
            `, [returnId, businessId, reason]);

            if (result.rows.length === 0) {
                throw new Error('Return not found');
            }

            // Log status change
            await client.query(`
                INSERT INTO wht_return_status_history (
                    wht_return_id,
                    old_status,
                    new_status,
                    changed_by,
                    change_reason
                ) VALUES ($1, $2, 'void', $3, $4)
            `, [returnId, result.rows[0].status, userId, reason]);

            // Audit log
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'wht_return.voided',
                resourceType: 'wht_return',
                resourceId: returnId,
                newValues: { reason }
            });

            return {
                success: true,
                message: 'Return voided successfully',
                return: result.rows[0]
            };

        } catch (error) {
            log.error('Failed to void return', {
                returnId,
                businessId,
                error: error.message
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * TEST GENERATION - Test function to verify system works
     */
    static async testReturnGeneration(businessId, userId) {
        const client = await getClient();

        try {
            // Use February 2026 as test period
            const periodStart = '2026-02-01';
            const periodEnd = '2026-02-28';

            // Generate test return
            const whtReturn = await this.generateReturn(
                businessId,
                periodStart,
                periodEnd,
                'monthly',
                userId
            );

            log.info('Test return generated successfully', {
                returnId: whtReturn.id,
                returnNumber: whtReturn.return_number,
                businessId
            });

            return {
                success: true,
                message: 'Test return generated successfully',
                return: whtReturn
            };

        } catch (error) {
            log.error('Test return generation failed', {
                businessId,
                userId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
}

export default WHTReturnService;
