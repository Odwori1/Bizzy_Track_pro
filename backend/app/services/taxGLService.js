// File: backend/app/services/taxGLService.js
// Pattern follows: openingBalanceService.js, taxService.js
// Purpose: Tax-to-GL posting service

import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class TaxGLService {

    /**
     * Post a single tax transaction to GL
     * @param {string} businessId - Business UUID
     * @param {string} taxId - Tax transaction ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Result with journal entry ID
     */
    static async postTaxToGL(businessId, taxId, userId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT * FROM post_tax_to_gl($1, $2)`,
                [taxId, userId]
            );

            if (!result.rows[0]) {
                throw new Error('Failed to post tax to GL');
            }

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'tax.post_to_gl',
                resourceType: 'transaction_taxes',
                resourceId: taxId,
                newValues: {
                    journal_entry_id: result.rows[0].journal_entry_id,
                    success: result.rows[0].success
                }
            });

            log.info('Tax posted to GL', {
                businessId,
                taxId,
                journalEntryId: result.rows[0].journal_entry_id
            });

            return {
                success: result.rows[0].success,
                journalEntryId: result.rows[0].journal_entry_id,
                message: result.rows[0].message
            };

        } catch (error) {
            log.error('Error posting tax to GL:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Batch post all unposted taxes for a date range
     * @param {string} businessId - Business UUID
     * @param {Date|string} startDate - Start date
     * @param {Date|string} endDate - End date
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Batch result
     */
    static async batchPostTaxes(businessId, startDate, endDate, userId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT * FROM post_all_taxes_for_period($1, $2, $3, $4)`,
                [businessId, startDate, endDate, userId]
            );

            if (!result.rows[0]) {
                throw new Error('Failed to batch post taxes');
            }

            await auditLogger.logAction({
                businessId,
                userId,
                action: 'tax.batch_post',
                resourceType: 'transaction_taxes',
                newValues: {
                    start_date: startDate,
                    end_date: endDate,
                    processed: result.rows[0].processed,
                    succeeded: result.rows[0].succeeded,
                    failed: result.rows[0].failed
                }
            });

            log.info('Batch tax posting completed', {
                businessId,
                processed: result.rows[0].processed,
                succeeded: result.rows[0].succeeded,
                failed: result.rows[0].failed
            });

            return {
                success: true,
                processed: parseInt(result.rows[0].processed),
                succeeded: parseInt(result.rows[0].succeeded),
                failed: parseInt(result.rows[0].failed),
                details: result.rows[0].details,
                message: `Batch complete: ${result.rows[0].succeeded} succeeded, ${result.rows[0].failed} failed`
            };

        } catch (error) {
            log.error('Error batch posting taxes:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get all unposted taxes
     * @param {string} businessId - Business UUID
     * @param {Date|string} startDate - Optional start date
     * @param {Date|string} endDate - Optional end date
     * @returns {Promise<Object>} List of unposted taxes
     */
    static async getUnpostedTaxes(businessId, startDate = null, endDate = null) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT * FROM get_unposted_taxes($1, $2, $3)`,
                [businessId, startDate, endDate]
            );

            const totalTaxAmount = result.rows.reduce(
                (sum, row) => sum + parseFloat(row.tax_amount), 0
            );

            return {
                success: true,
                taxes: result.rows.map(row => ({
                    id: row.tax_id,
                    transaction_type: row.transaction_type,
                    transaction_id: row.transaction_id,
                    transaction_date: row.transaction_date,
                    taxable_amount: parseFloat(row.taxable_amount),
                    tax_rate: parseFloat(row.tax_rate),
                    tax_amount: parseFloat(row.tax_amount),
                    is_posted: row.is_posted
                })),
                count: result.rows.length,
                total_tax_amount: totalTaxAmount
            };

        } catch (error) {
            log.error('Error getting unposted taxes:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get tax liability report
     * @param {string} businessId - Business UUID
     * @param {Date|string} startDate - Start date
     * @param {Date|string} endDate - End date
     * @returns {Promise<Object>} Tax liability report
     */
    static async getTaxLiabilityReport(businessId, startDate, endDate) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT * FROM get_tax_liability_report($1, $2, $3)`,
                [businessId, startDate, endDate]
            );

            const report = result.rows[0] || {};

            await auditLogger.logAction({
                businessId,
                action: 'tax.liability_report.viewed',
                resourceType: 'report',
                newValues: {
                    start_date: startDate,
                    end_date: endDate,
                    net_payable: report.net_payable
                }
            });

            return {
                success: true,
                period: { start_date: startDate, end_date: endDate },
                tax_type: report.tax_type || 'VAT',
                collected_amount: parseFloat(report.collected_amount || 0),
                paid_amount: parseFloat(report.paid_amount || 0),
                net_payable: parseFloat(report.net_payable || 0)
            };

        } catch (error) {
            log.error('Error getting tax liability report:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Backfill all unposted taxes for a business
     * @param {string} businessId - Business UUID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Backfill result
     */
    static async backfillAllTaxes(businessId, userId) {
        return this.batchPostTaxes(
            businessId,
            '2000-01-01',
            new Date().toISOString().split('T')[0],
            userId
        );
    }
}

export default TaxGLService;
