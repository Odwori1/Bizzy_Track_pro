// File: backend/app/services/openingBalanceService.js
// Purpose: Opening balance service - dynamic business initialization
// Pattern follows: refundService.js

import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class OpeningBalanceService {

    /**
     * Initialize business accounting (creates standard chart of accounts)
     * @param {string} businessId - UUID of the business
     * @param {string} userId - UUID of the user initializing
     * @param {Object} options - Optional settings { fiscalYearStart, currencyCode }
     * @returns {Promise<Object>} Result with success status and account count
     */
    static async initializeBusinessAccounting(businessId, userId, options = {}) {
        const client = await getClient();

        try {
            const { fiscalYearStart, currencyCode } = options;

            const result = await client.query(
                `SELECT * FROM initialize_business_accounting($1, $2, $3, $4)`,
                [businessId, userId, fiscalYearStart || null, currencyCode || null]
            );

            if (!result.rows[0]) {
                throw new Error('Failed to initialize business accounting');
            }

            log.info('Business accounting initialized', {
                businessId,
                userId,
                accountsCreated: result.rows[0].accounts_created,
                message: result.rows[0].message
            });

            return {
                success: result.rows[0].success,
                message: result.rows[0].message,
                accountsCreated: parseInt(result.rows[0].accounts_created || 0)
            };

        } catch (error) {
            log.error('Error initializing business accounting:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Set opening balance for a specific account
     * @param {string} businessId - Business ID
     * @param {string} accountCode - Account code (e.g., '1110')
     * @param {number} amount - Balance amount
     * @param {string} balanceType - 'debit' or 'credit'
     * @param {string} userId - User ID
     * @param {string} asOfDate - Date for opening balance (YYYY-MM-DD)
     * @param {string} notes - Optional notes
     * @returns {Promise<Object>} Result with balance ID
     */
    static async setOpeningBalance(businessId, accountCode, amount, balanceType, userId, asOfDate = null, notes = null) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT * FROM set_opening_balance($1, $2, $3, $4, $5, $6, $7)`,
                [businessId, accountCode, amount, balanceType, userId, asOfDate || new Date().toISOString().split('T')[0], notes]
            );

            if (!result.rows[0]) {
                throw new Error('Failed to set opening balance');
            }

            log.info('Opening balance set', {
                businessId,
                accountCode,
                amount,
                balanceType,
                userId
            });

            return {
                success: result.rows[0].success,
                message: result.rows[0].message,
                balanceId: result.rows[0].balance_id
            };

        } catch (error) {
            log.error('Error setting opening balance:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get all opening balances for a business
     * @param {string} businessId - Business ID
     * @param {string} asOfDate - Optional date filter
     * @returns {Promise<Object>} List of opening balances
     */
    static async getOpeningBalances(businessId, asOfDate = null) {
        const client = await getClient();

        try {
            let query = `
                SELECT 
                    ob.id,
                    ob.account_code,
                    ca.account_name,
                    ca.account_type,
                    ob.balance_type,
                    ob.balance_amount,
                    ob.as_of_date,
                    ob.is_adjusted,
                    ob.notes,
                    ob.created_at,
                    ob.updated_at
                FROM opening_balances ob
                JOIN chart_of_accounts ca ON ob.account_id = ca.id
                WHERE ob.business_id = $1
            `;
            const params = [businessId];

            if (asOfDate) {
                query += ` AND ob.as_of_date = $2`;
                params.push(asOfDate);
            }

            query += ` ORDER BY ca.account_code`;

            const result = await client.query(query, params);

            // Calculate totals
            const totalDebits = result.rows
                .filter(row => row.balance_type === 'debit')
                .reduce((sum, row) => sum + parseFloat(row.balance_amount), 0);

            const totalCredits = result.rows
                .filter(row => row.balance_type === 'credit')
                .reduce((sum, row) => sum + parseFloat(row.balance_amount), 0);

            return {
                success: true,
                balances: result.rows.map(row => ({
                    id: row.id,
                    account_code: row.account_code,
                    account_name: row.account_name,
                    account_type: row.account_type,
                    balance_type: row.balance_type,
                    balance_amount: parseFloat(row.balance_amount),
                    as_of_date: row.as_of_date,
                    is_adjusted: row.is_adjusted,
                    notes: row.notes,
                    created_at: row.created_at,
                    updated_at: row.updated_at
                })),
                summary: {
                    total_debits: totalDebits,
                    total_credits: totalCredits,
                    difference: totalDebits - totalCredits,
                    is_balanced: Math.abs(totalDebits - totalCredits) < 0.01,
                    account_count: result.rows.length
                }
            };

        } catch (error) {
            log.error('Error getting opening balances:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Validate opening balances (debits = credits)
     * @param {string} businessId - Business ID
     * @param {string} asOfDate - Date to validate
     * @returns {Promise<Object>} Validation result
     */
    static async validateBalances(businessId, asOfDate = null) {
        const client = await getClient();

        try {
            const dateToUse = asOfDate || new Date().toISOString().split('T')[0];

            const result = await client.query(
                `SELECT * FROM validate_opening_balances($1, $2)`,
                [businessId, dateToUse]
            );

            if (!result.rows[0]) {
                throw new Error('Failed to validate opening balances');
            }

            return {
                success: true,
                isValid: result.rows[0].is_valid,
                totalDebits: parseFloat(result.rows[0].total_debits),
                totalCredits: parseFloat(result.rows[0].total_credits),
                difference: parseFloat(result.rows[0].difference),
                message: result.rows[0].message
            };

        } catch (error) {
            log.error('Error validating opening balances:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Create journal entry from opening balances
     * @param {string} businessId - Business ID
     * @param {string} userId - User ID
     * @param {string} asOfDate - Date for journal entry
     * @returns {Promise<Object>} Journal entry result
     */
    static async postOpeningBalances(businessId, userId, asOfDate = null) {
        const client = await getClient();

        try {
            const dateToUse = asOfDate || new Date().toISOString().split('T')[0];

            const result = await client.query(
                `SELECT * FROM create_opening_balance_journal_entry($1, $2, $3)`,
                [businessId, userId, dateToUse]
            );

            if (!result.rows[0]) {
                throw new Error('Failed to create opening balance journal entry');
            }

            // Audit log
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'opening_balances.posted',
                resourceType: 'journal_entry',
                resourceId: result.rows[0].journal_entry_id,
                newValues: {
                    as_of_date: dateToUse,
                    lines_created: result.rows[0].lines_created
                }
            });

            log.info('Opening balance journal entry created', {
                businessId,
                userId,
                journalEntryId: result.rows[0].journal_entry_id,
                linesCreated: result.rows[0].lines_created
            });

            return {
                success: result.rows[0].success,
                journalEntryId: result.rows[0].journal_entry_id,
                message: result.rows[0].message,
                linesCreated: result.rows[0].lines_created
            };

        } catch (error) {
            log.error('Error posting opening balances:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get opening balance status for a business
     * @param {string} businessId - Business ID
     * @returns {Promise<Object>} Status information
     */
    static async getStatus(businessId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT * FROM get_opening_balances_status($1)`,
                [businessId]
            );

            if (!result.rows[0]) {
                // Return default status if no record
                return {
                    success: true,
                    chartOfAccountsCreated: false,
                    openingBalancesSet: false,
                    openingBalancesPosted: false,
                    isBalanced: false,
                    totalDebits: 0,
                    totalCredits: 0,
                    difference: 0,
                    fiscalYearStart: null,
                    fiscalYearEnd: null,
                    currencyCode: 'UGX',
                    initializationStatus: 'PENDING'
                };
            }

            return {
                success: true,
                chartOfAccountsCreated: result.rows[0].chart_of_accounts_created,
                openingBalancesSet: result.rows[0].opening_balances_set,
                openingBalancesPosted: result.rows[0].opening_balances_posted,
                isBalanced: result.rows[0].is_balanced,
                totalDebits: parseFloat(result.rows[0].total_debits || 0),
                totalCredits: parseFloat(result.rows[0].total_credits || 0),
                difference: parseFloat(result.rows[0].difference || 0),
                fiscalYearStart: result.rows[0].fiscal_year_start,
                fiscalYearEnd: result.rows[0].fiscal_year_end,
                currencyCode: result.rows[0].currency_code,
                initializationStatus: result.rows[0].initialization_status
            };

        } catch (error) {
            log.error('Error getting opening balance status:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Delete an opening balance entry
     * @param {string} businessId - Business ID
     * @param {string} accountCode - Account code
     * @param {string} userId - User ID
     * @param {string} asOfDate - Date
     * @returns {Promise<Object>} Result
     */
    static async deleteOpeningBalance(businessId, accountCode, userId, asOfDate = null) {
        const client = await getClient();

        try {
            const dateToUse = asOfDate || new Date().toISOString().split('T')[0];

            const result = await client.query(
                `SELECT * FROM delete_opening_balance($1, $2, $3, $4)`,
                [businessId, accountCode, userId, dateToUse]
            );

            if (!result.rows[0]) {
                throw new Error('Failed to delete opening balance');
            }

            // Audit log
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'opening_balance.deleted',
                resourceType: 'opening_balance',
                resourceId: null,
                newValues: {
                    account_code: accountCode,
                    as_of_date: dateToUse
                }
            });

            log.info('Opening balance deleted', {
                businessId,
                userId,
                accountCode
            });

            return {
                success: result.rows[0].success,
                message: result.rows[0].message,
                wasDeleted: result.rows[0].was_deleted
            };

        } catch (error) {
            log.error('Error deleting opening balance:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get all available accounts that can have opening balances
     * @param {string} businessId - Business ID
     * @returns {Promise<Object>} List of accounts
     */
    static async getAvailableAccounts(businessId) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT 
                    ca.account_code,
                    ca.account_name,
                    ca.account_type,
                    CASE 
                        WHEN ca.account_type IN ('asset', 'expense') THEN 'debit'
                        ELSE 'credit'
                    END as normal_balance,
                    EXISTS (
                        SELECT 1 FROM opening_balances ob 
                        WHERE ob.account_id = ca.id 
                        AND ob.business_id = ca.business_id
                    ) as has_opening_balance
                FROM chart_of_accounts ca
                WHERE ca.business_id = $1
                    AND ca.is_active = true
                    AND ca.account_code NOT IN ('1000', '2000', '3000', '4000', '5000')
                ORDER BY ca.account_code`,
                [businessId]
            );

            return {
                success: true,
                accounts: result.rows.map(row => ({
                    account_code: row.account_code,
                    account_name: row.account_name,
                    account_type: row.account_type,
                    normal_balance: row.normal_balance,
                    has_opening_balance: row.has_opening_balance
                })),
                count: result.rows.length
            };

        } catch (error) {
            log.error('Error getting available accounts:', error);
            throw error;
        } finally {
            client.release();
        }
    }
}

export default OpeningBalanceService;
