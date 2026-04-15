// File: backend/app/controllers/financialStatementController.js
// Pattern follows: openingBalanceController.js, taxController.js
// Purpose: Financial statement HTTP request handlers

import { FinancialStatementService } from '../services/financialStatementService.js';
import { log } from '../utils/logger.js';

export class FinancialStatementController {

    /**
     * GET /api/accounting/statements/profit-loss
     * Get Profit & Loss Statement
     */
    static async getProfitLoss(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const { start_date, end_date, compare_with_previous } = req.query;

            if (!start_date || !end_date) {
                return res.status(400).json({
                    success: false,
                    message: 'start_date and end_date are required'
                });
            }

            log.info('Getting Profit & Loss statement', {
                businessId,
                start_date,
                end_date,
                compare_with_previous
            });

            const result = await FinancialStatementService.getProfitLoss(
                businessId,
                start_date,
                end_date,
                compare_with_previous === 'true'
            );

            return res.status(200).json({
                success: true,
                data: result,
                message: 'Profit & Loss statement generated successfully'
            });

        } catch (error) {
            log.error('Error getting profit & loss:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate profit & loss statement',
                error: error.message
            });
        }
    }

    /**
     * GET /api/accounting/statements/balance-sheet
     * Get Balance Sheet
     */
    static async getBalanceSheet(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const { as_of_date, include_comparative } = req.query;

            if (!as_of_date) {
                return res.status(400).json({
                    success: false,
                    message: 'as_of_date is required'
                });
            }

            log.info('Getting Balance Sheet', {
                businessId,
                as_of_date,
                include_comparative
            });

            const result = await FinancialStatementService.getBalanceSheet(
                businessId,
                as_of_date,
                include_comparative === 'true'
            );

            return res.status(200).json({
                success: true,
                data: result,
                message: 'Balance sheet generated successfully'
            });

        } catch (error) {
            log.error('Error getting balance sheet:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate balance sheet',
                error: error.message
            });
        }
    }

    /**
     * GET /api/accounting/statements/cash-flow
     * Get Cash Flow Statement
     */
    static async getCashFlow(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const { start_date, end_date } = req.query;

            if (!start_date || !end_date) {
                return res.status(400).json({
                    success: false,
                    message: 'start_date and end_date are required'
                });
            }

            log.info('Getting Cash Flow statement', {
                businessId,
                start_date,
                end_date
            });

            const result = await FinancialStatementService.getCashFlow(
                businessId,
                start_date,
                end_date
            );

            return res.status(200).json({
                success: true,
                data: result,
                message: 'Cash flow statement generated successfully'
            });

        } catch (error) {
            log.error('Error getting cash flow:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate cash flow statement',
                error: error.message
            });
        }
    }

    /**
     * GET /api/accounting/statements/trial-balance
     * Get Enhanced Trial Balance
     */
    static async getTrialBalanceEnhanced(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const { as_of_date, include_zero_balances } = req.query;

            const result = await FinancialStatementService.getTrialBalanceEnhanced(
                businessId,
                as_of_date || new Date().toISOString().split('T')[0],
                include_zero_balances === 'true'
            );

            return res.status(200).json({
                success: true,
                data: result,
                message: 'Trial balance generated successfully'
            });

        } catch (error) {
            log.error('Error getting trial balance:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate trial balance',
                error: error.message
            });
        }
    }

    /**
     * GET /api/accounting/statements/summary
     * Get Financial Summary Dashboard
     */
    static async getFinancialSummary(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const { start_date, end_date } = req.query;

            if (!start_date || !end_date) {
                return res.status(400).json({
                    success: false,
                    message: 'start_date and end_date are required'
                });
            }

            log.info('Getting Financial Summary', {
                businessId,
                start_date,
                end_date
            });

            const result = await FinancialStatementService.getFinancialSummary(
                businessId,
                start_date,
                end_date
            );

            return res.status(200).json({
                success: true,
                data: result,
                message: 'Financial summary generated successfully'
            });

        } catch (error) {
            log.error('Error getting financial summary:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate financial summary',
                error: error.message
            });
        }
    }
}

export default FinancialStatementController;
