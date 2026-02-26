// File: ~/Bizzy_Track_pro/backend/app/services/earlyPaymentService.js
// PURPOSE: Handle early payment discounts (2/10, n/30) for accounting
// PHASE 10.3: Following discountCore.js and promotionalDiscountService.js patterns
// DEPENDS ON: discountCore.js, early_payment_terms table

import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';
import { DiscountCore } from './discountCore.js';

export class EarlyPaymentService {

    /**
     * =====================================================
     * SECTION 1: TERM MANAGEMENT
     * =====================================================
     */

    /**
     * Create early payment terms
     * Example: term_name: "2/10, n/30", discount_percentage: 2, discount_days: 10, net_days: 30
     */
    static async createTerms(data, businessId, userId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            // Validate terms
            if (data.discount_days && data.net_days && data.discount_days >= data.net_days) {
                throw new Error('Discount days must be less than net days');
            }

            if (data.discount_percentage && (data.discount_percentage <= 0 || data.discount_percentage > 100)) {
                throw new Error('Discount percentage must be between 0 and 100');
            }

            const result = await client.query(
                `INSERT INTO early_payment_terms (
                    business_id, term_name, discount_percentage, discount_days,
                    net_days, is_active, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                RETURNING *`,
                [
                    businessId,
                    data.term_name,
                    data.discount_percentage,
                    data.discount_days,
                    data.net_days,
                    data.is_active !== false
                ]
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'early_payment_terms.created',
                resourceType: 'early_payment_terms',
                resourceId: result.rows[0].id,
                newValues: {
                    term_name: data.term_name,
                    discount_percentage: data.discount_percentage,
                    discount_days: data.discount_days,
                    net_days: data.net_days
                }
            });

            log.info('Early payment terms created', {
                businessId,
                userId,
                termId: result.rows[0].id,
                termName: data.term_name
            });

            await client.query('COMMIT');
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error creating early payment terms', { error: error.message, businessId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get all early payment terms
     */
    static async getTerms(businessId, filters = {}) {
        const client = await getClient();

        try {
            let query = `
                SELECT * FROM early_payment_terms
                WHERE business_id = $1
            `;
            const params = [businessId];
            let paramCount = 1;

            if (filters.is_active !== undefined) {
                query += ` AND is_active = $${++paramCount}`;
                params.push(filters.is_active);
            }

            if (filters.term_name) {
                query += ` AND term_name ILIKE $${++paramCount}`;
                params.push(`%${filters.term_name}%`);
            }

            query += ` ORDER BY discount_percentage DESC, created_at DESC`;

            const result = await client.query(query, params);
            return result.rows;

        } catch (error) {
            log.error('Error getting early payment terms', { error: error.message, businessId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get term by ID
     */
    static async getTermById(id, businessId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT * FROM early_payment_terms
                 WHERE id = $1 AND business_id = $2`,
                [id, businessId]
            );

            return result.rows[0] || null;

        } catch (error) {
            log.error('Error getting term by ID', { error: error.message, id });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update early payment terms
     */
    static async updateTerms(id, data, businessId, userId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            const existing = await client.query(
                `SELECT * FROM early_payment_terms WHERE id = $1 AND business_id = $2`,
                [id, businessId]
            );

            if (existing.rows.length === 0) {
                throw new Error('Early payment terms not found');
            }

            const updates = [];
            const params = [];
            let paramCount = 1;

            const allowedFields = ['term_name', 'discount_percentage', 'discount_days', 'net_days', 'is_active'];

            for (const field of allowedFields) {
                if (data[field] !== undefined) {
                    updates.push(`${field} = $${paramCount++}`);
                    params.push(data[field]);
                }
            }

            updates.push(`updated_at = NOW()`);
            params.push(id, businessId);

            const query = `
                UPDATE early_payment_terms
                SET ${updates.join(', ')}
                WHERE id = $${paramCount++} AND business_id = $${paramCount}
                RETURNING *
            `;

            const result = await client.query(query, params);

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'early_payment_terms.updated',
                resourceType: 'early_payment_terms',
                resourceId: id,
                oldValues: existing.rows[0],
                newValues: result.rows[0]
            });

            log.info('Early payment terms updated', { businessId, userId, termId: id });

            await client.query('COMMIT');
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error updating early payment terms', { error: error.message, id });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Delete/deactivate early payment terms
     */
    static async deleteTerms(id, businessId, userId) {
        return this.updateTerms(id, { is_active: false }, businessId, userId);
    }

    /**
     * =====================================================
     * SECTION 2: CUSTOMER ASSIGNMENT
     * =====================================================
     */

    /**
     * Assign payment terms to a customer
     * Note: You'll need to create a customer_payment_terms junction table
     */
    static async assignTermsToCustomer(customerId, termId, businessId, userId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            // First, check if terms exist and belong to business
            const termsCheck = await client.query(
                `SELECT id FROM early_payment_terms
                 WHERE id = $1 AND business_id = $2`,
                [termId, businessId]
            );

            if (termsCheck.rows.length === 0) {
                throw new Error('Payment terms not found');
            }

            // Check if customer exists and belongs to business
            const customerCheck = await client.query(
                `SELECT id FROM customers
                 WHERE id = $1 AND business_id = $2`,
                [customerId, businessId]
            );

            if (customerCheck.rows.length === 0) {
                throw new Error('Customer not found');
            }

            // Insert or update in customer_payment_terms table
            // Create this table if it doesn't exist
            const result = await client.query(
                `INSERT INTO customer_payment_terms (customer_id, term_id, assigned_by, assigned_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (customer_id)
                 DO UPDATE SET term_id = EXCLUDED.term_id, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()
                 RETURNING *`,
                [customerId, termId, userId]
            );

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'customer_payment_terms.assigned',
                resourceType: 'customer',
                resourceId: customerId,
                newValues: { term_id: termId }
            });

            log.info('Payment terms assigned to customer', {
                businessId,
                userId,
                customerId,
                termId
            });

            await client.query('COMMIT');
            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error assigning terms to customer', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get customer's assigned payment terms
     */
    static async getCustomerTerms(customerId, businessId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT ept.*
                 FROM early_payment_terms ept
                 JOIN customer_payment_terms cpt ON ept.id = cpt.term_id
                 WHERE cpt.customer_id = $1 AND ept.business_id = $2 AND ept.is_active = true`,
                [customerId, businessId]
            );

            return result.rows[0] || null;

        } catch (error) {
            log.error('Error getting customer terms', { error: error.message, customerId });
            return null;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 3: CALCULATION
     * =====================================================
     */

    /**
     * Calculate early payment discount for an invoice
     */
    static async calculateEarlyPaymentDiscount(invoiceId, paymentDate) {
        const client = await getClient();

        try {
            // Get invoice details
            const invoiceResult = await client.query(
                `SELECT i.*, c.id as customer_id, c.terms_id as customer_terms_id
                 FROM invoices i
                 JOIN customers c ON i.customer_id = c.id
                 WHERE i.id = $1`,
                [invoiceId]
            );

            if (invoiceResult.rows.length === 0) {
                throw new Error('Invoice not found');
            }

            const invoice = invoiceResult.rows[0];

            // Get payment terms (either customer-specific or default)
            let terms = null;

            if (invoice.customer_terms_id) {
                // Customer has specific terms
                const termsResult = await client.query(
                    `SELECT * FROM early_payment_terms WHERE id = $1 AND is_active = true`,
                    [invoice.customer_terms_id]
                );
                terms = termsResult.rows[0] || null;
            }

            if (!terms) {
                // Get default terms for business
                const termsResult = await client.query(
                    `SELECT * FROM early_payment_terms
                     WHERE business_id = $1 AND is_active = true
                     ORDER BY discount_percentage DESC
                     LIMIT 1`,
                    [invoice.business_id]
                );
                terms = termsResult.rows[0] || null;
            }

            if (!terms) {
                return {
                    eligible: false,
                    reason: 'No payment terms found',
                    discountAmount: 0,
                    finalAmount: invoice.total_amount
                };
            }

            // Calculate eligibility
            const invoiceDate = new Date(invoice.invoice_date);
            const paymentDateTime = new Date(paymentDate);
            const daysDiff = Math.floor((paymentDateTime - invoiceDate) / (1000 * 60 * 60 * 24));

            const isEligible = daysDiff <= terms.discount_days;

            if (!isEligible) {
                return {
                    eligible: false,
                    reason: `Payment after ${terms.discount_days} days (${daysDiff} days)`,
                    discountAmount: 0,
                    finalAmount: invoice.total_amount,
                    daysLate: daysDiff - terms.discount_days,
                    netDueDate: this.calculateNetDueDate(invoice.invoice_date, terms.net_days)
                };
            }

            // Calculate discount
            const discountAmount = DiscountCore.calculateDiscount(
                invoice.total_amount,
                'PERCENTAGE',
                parseFloat(terms.discount_percentage)
            );

            return {
                eligible: true,
                terms: terms,
                discountAmount: discountAmount,
                finalAmount: invoice.total_amount - discountAmount,
                daysEarly: terms.discount_days - daysDiff,
                paymentDate: paymentDate,
                invoiceDate: invoice.invoice_date,
                daysAfterInvoice: daysDiff
            };

        } catch (error) {
            log.error('Error calculating early payment discount', { error: error.message, invoiceId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Determine if payment is eligible for discount
     */
    static isEligible(invoiceDate, paymentDate, discountDays) {
        const invoice = new Date(invoiceDate);
        const payment = new Date(paymentDate);
        const daysDiff = Math.floor((payment - invoice) / (1000 * 60 * 60 * 24));

        return {
            eligible: daysDiff <= discountDays,
            daysDiff: daysDiff,
            discountDays: discountDays
        };
    }

    /**
     * Calculate net due date
     */
    static calculateNetDueDate(invoiceDate, netDays) {
        const dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + netDays);
        return dueDate.toISOString().split('T')[0];
    }

    /**
     * =====================================================
     * SECTION 4: JOURNAL ENTRIES
     * =====================================================
     */

    /**
     * Create journal entry for early payment discount
     * Uses account 4112 (Early Payment Discounts)
     */
    static async createEarlyPaymentJournalEntry(invoice, discountAmount, userId) {
        const client = await getClient();

        try {
            await client.query('BEGIN');

            // Get discount account (4112 - Early Payment Discounts)
            const accountResult = await client.query(
                `SELECT id FROM chart_of_accounts
                 WHERE account_code = '4112' AND business_id = $1`,
                [invoice.business_id]
            );

            if (accountResult.rows.length === 0) {
                throw new Error('Early payment discount account not found');
            }

            const discountAccountId = accountResult.rows[0].id;

            // Get revenue account (4100 - Sales Revenue)
            const revenueResult = await client.query(
                `SELECT id FROM chart_of_accounts
                 WHERE account_code = '4100' AND business_id = $1`,
                [invoice.business_id]
            );

            if (revenueResult.rows.length === 0) {
                throw new Error('Revenue account not found');
            }

            const revenueAccountId = revenueResult.rows[0].id;

            // Create journal entry
            const journalResult = await client.query(
                `INSERT INTO journal_entries (
                    business_id, entry_number, entry_date, description,
                    reference_type, reference_id, created_by, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                RETURNING id`,
                [
                    invoice.business_id,
                    await this._generateJournalEntryNumber(invoice.business_id),
                    new Date().toISOString().split('T')[0],
                    `Early payment discount for invoice ${invoice.invoice_number}`,
                    'invoice',
                    invoice.id,
                    userId
                ]
            );

            const journalId = journalResult.rows[0].id;

            // Create journal lines (debit discount account, credit revenue account)
            await client.query(
                `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
                 VALUES
                    ($1, $2, $3, 0, 'Early payment discount'),
                    ($1, $4, 0, $3, 'Reduction in revenue from early payment')`,
                [journalId, discountAccountId, discountAmount, revenueAccountId]
            );

            log.info('Early payment journal entry created', {
                businessId: invoice.business_id,
                userId,
                journalId,
                invoiceId: invoice.id,
                discountAmount
            });

            await client.query('COMMIT');
            return {
                journalId,
                entryNumber: journalResult.rows[0].entry_number,
                discountAmount
            };

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error creating early payment journal entry', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Generate unique journal entry number
     */
    static async _generateJournalEntryNumber(businessId) {
        const client = await getClient();

        try {
            const year = new Date().getFullYear();
            const result = await client.query(
                `SELECT COUNT(*) + 1 as next_num
                 FROM journal_entries
                 WHERE business_id = $1
                    AND entry_number LIKE $2`,
                [businessId, `JE-${year}-%`]
            );

            const nextNum = String(result.rows[0].next_num).padStart(4, '0');
            return `JE-${year}-${nextNum}`;

        } catch (error) {
            log.error('Error generating journal entry number', { error: error.message });
            return `JE-${new Date().getFullYear()}-${Date.now()}`;
        } finally {
            client.release();
        }
    }

    /**
     * =====================================================
     * SECTION 5: BULK OPERATIONS
     * =====================================================
     */

    /**
     * Bulk import early payment terms
     * FIXED: Use proper UUID format for audit log
     */
    static async bulkImportTerms(terms, businessId, userId) {
        const client = await getClient();
        const results = [];

        try {
            await client.query('BEGIN');

            for (const term of terms) {
                try {
                    const result = await client.query(
                        `INSERT INTO early_payment_terms (
                            business_id, term_name, discount_percentage,
                            discount_days, net_days, is_active, created_at, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                        RETURNING id, term_name`,
                        [
                            businessId,
                            term.term_name,
                            term.discount_percentage,
                            term.discount_days,
                            term.net_days,
                            term.is_active !== false
                        ]
                    );

                    results.push({
                        success: true,
                        id: result.rows[0].id,
                        term_name: result.rows[0].term_name
                    });

                } catch (error) {
                    results.push({
                        success: false,
                        term_name: term.term_name,
                        error: error.message
                    });
                }
            }

            // Generate a UUID-compatible string for bulk operation
            const timestamp = Date.now().toString().padStart(12, '0').slice(-12);
            const bulkUuid = `00000000-0000-0000-0000-${timestamp}`;

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'early_payment_terms.bulk_imported',
                resourceType: 'early_payment_terms',
                resourceId: bulkUuid,
                newValues: {
                    total: terms.length,
                    successful: results.filter(r => r.success).length,
                    failed: results.filter(r => !r.success).length
                }
            });

            await client.query('COMMIT');
            return results;

        } catch (error) {
            await client.query('ROLLBACK');
            log.error('Error bulk importing terms', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Export terms to CSV
     */
    static async exportTerms(businessId) {
        const terms = await this.getTerms(businessId);

        const csvRows = [];
        csvRows.push(['ID', 'Term Name', 'Discount %', 'Discount Days', 'Net Days', 'Is Active', 'Created At'].join(','));

        for (const term of terms) {
            csvRows.push([
                term.id,
                `"${term.term_name}"`,
                term.discount_percentage,
                term.discount_days,
                term.net_days,
                term.is_active,
                new Date(term.created_at).toISOString()
            ].join(','));
        }

        return csvRows.join('\n');
    }

    /**
     * =====================================================
     * SECTION 6: ANALYTICS
     * =====================================================
     */

    /**
     * Get early payment discount statistics
     */
    static async getEarlyPaymentStats(businessId, startDate, endDate) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT
                    COUNT(DISTINCT i.id) as invoices_with_discount,
                    COUNT(*) as total_discounts,
                    COALESCE(SUM(da.total_discount_amount), 0) as total_discount_amount,
                    AVG(da.total_discount_amount) as avg_discount_amount,
                    MIN(da.total_discount_amount) as min_discount,
                    MAX(da.total_discount_amount) as max_discount,
                    COUNT(DISTINCT i.customer_id) as unique_customers
                 FROM discount_allocations da
                 JOIN invoices i ON da.invoice_id = i.id
                 JOIN early_payment_terms ept ON da.discount_rule_id = ept.id
                 WHERE da.business_id = $1
                    AND da.status = 'APPLIED'
                    AND da.created_at BETWEEN $2 AND $3`,
                [businessId, startDate, endDate]
            );

            return result.rows[0];

        } catch (error) {
            log.error('Error getting early payment stats', { error: error.message });
            throw error;
        } finally {
            client.release();
        }
    }
}

export default EarlyPaymentService;
