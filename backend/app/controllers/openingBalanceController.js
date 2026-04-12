// File: backend/app/controllers/openingBalanceController.js
// Pattern follows: refundController.js

import { OpeningBalanceService } from '../services/openingBalanceService.js';
import { OpeningBalanceSchemas } from '../schemas/openingBalanceSchemas.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { getClient } from '../utils/database.js';

export class OpeningBalanceController {

    /**
     * Initialize business accounting
     * POST /api/accounting/opening-balances/initialize
     */
    static async initializeBusiness(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            const { fiscal_year_start, currency_code } = req.body;

            log.info('Initializing business accounting', {
                businessId,
                userId,
                fiscal_year_start,
                currency_code
            });

            const result = await OpeningBalanceService.initializeBusinessAccounting(
                businessId,
                userId,
                { fiscalYearStart: fiscal_year_start, currencyCode: currency_code }
            );

            return res.status(200).json({
                success: true,
                data: result,
                message: result.message
            });

        } catch (error) {
            log.error('Error initializing business accounting:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to initialize business accounting',
                error: error.message
            });
        }
    }

    /**
     * Set opening balance for an account
     * POST /api/accounting/opening-balances
     */
    static async setOpeningBalance(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            // Validate request
            const validation = OpeningBalanceSchemas.validateSetBalance(req.body);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: validation.errors
                });
            }

            const { account_code, amount, balance_type, as_of_date, notes } = validation.value;

            log.info('Setting opening balance', {
                businessId,
                userId,
                account_code,
                amount,
                balance_type
            });

            const result = await OpeningBalanceService.setOpeningBalance(
                businessId,
                account_code,
                amount,
                balance_type,
                userId,
                as_of_date,
                notes
            );

            return res.status(200).json({
                success: true,
                data: {
                    balance_id: result.balanceId
                },
                message: result.message
            });

        } catch (error) {
            log.error('Error setting opening balance:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to set opening balance',
                error: error.message
            });
        }
    }

    /**
     * Get all opening balances
     * GET /api/accounting/opening-balances
     */
    static async getOpeningBalances(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const { as_of_date } = req.query;

            const result = await OpeningBalanceService.getOpeningBalances(businessId, as_of_date);

            return res.status(200).json({
                success: true,
                data: result.balances,
                summary: result.summary,
                message: 'Opening balances retrieved successfully'
            });

        } catch (error) {
            log.error('Error getting opening balances:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get opening balances',
                error: error.message
            });
        }
    }

    /**
     * Validate opening balances (check debits = credits)
     * POST /api/accounting/opening-balances/validate
     */
    static async validateBalances(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const { as_of_date } = req.body;

            const result = await OpeningBalanceService.validateBalances(businessId, as_of_date);

            return res.status(200).json({
                success: true,
                data: {
                    is_valid: result.isValid,
                    total_debits: result.totalDebits,
                    total_credits: result.totalCredits,
                    difference: result.difference
                },
                message: result.message
            });

        } catch (error) {
            log.error('Error validating opening balances:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to validate opening balances',
                error: error.message
            });
        }
    }

    /**
     * Post opening balances to journal (create journal entry)
     * POST /api/accounting/opening-balances/post
     */
    static async postOpeningBalances(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            const { as_of_date } = req.body;

            log.info('Posting opening balances to journal', {
                businessId,
                userId,
                as_of_date
            });

            // First validate
            const validation = await OpeningBalanceService.validateBalances(businessId, as_of_date);
            if (!validation.isValid) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot post: ${validation.message}`,
                    data: {
                        total_debits: validation.totalDebits,
                        total_credits: validation.totalCredits,
                        difference: validation.difference
                    }
                });
            }

            const result = await OpeningBalanceService.postOpeningBalances(businessId, userId, as_of_date);

            return res.status(200).json({
                success: true,
                data: {
                    journal_entry_id: result.journalEntryId,
                    lines_created: result.linesCreated
                },
                message: result.message
            });

        } catch (error) {
            log.error('Error posting opening balances:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to post opening balances',
                error: error.message
            });
        }
    }

    /**
     * Get opening balance status
     * GET /api/accounting/opening-balances/status
     */
    static async getStatus(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const result = await OpeningBalanceService.getStatus(businessId);

            return res.status(200).json({
                success: true,
                data: result,
                message: 'Status retrieved successfully'
            });

        } catch (error) {
            log.error('Error getting opening balance status:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get status',
                error: error.message
            });
        }
    }

    /**
     * Delete an opening balance
     * DELETE /api/accounting/opening-balances/:accountCode
     */
    static async deleteOpeningBalance(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { accountCode } = req.params;
            const { as_of_date } = req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Deleting opening balance', {
                businessId,
                userId,
                accountCode
            });

            const result = await OpeningBalanceService.deleteOpeningBalance(
                businessId,
                accountCode,
                userId,
                as_of_date
            );

            if (!result.wasDeleted) {
                return res.status(404).json({
                    success: false,
                    message: result.message
                });
            }

            return res.status(200).json({
                success: true,
                message: result.message
            });

        } catch (error) {
            log.error('Error deleting opening balance:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to delete opening balance',
                error: error.message
            });
        }
    }

    /**
     * Get available accounts (accounts that can have opening balances)
     * GET /api/accounting/opening-balances/accounts
     */
    static async getAvailableAccounts(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const result = await OpeningBalanceService.getAvailableAccounts(businessId);

            return res.status(200).json({
                success: true,
                data: result.accounts,
                count: result.count,
                message: 'Available accounts retrieved successfully'
            });

        } catch (error) {
            log.error('Error getting available accounts:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get available accounts',
                error: error.message
            });
        }
    }
}

export default OpeningBalanceController;
