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

            // Build summary object for frontend compatibility
            const summary = {
                total_revenue: result.revenue?.total || 0,
                total_cogs: result.cost_of_goods_sold?.total || 0,
                gross_profit: result.gross_profit || 0,
                total_expenses: result.expenses?.total || 0,
                net_profit: result.net_profit || 0,
                gross_margin: result.revenue?.total > 0 ? ((result.gross_profit || 0) / result.revenue.total) * 100 : 0,
                net_margin: result.revenue?.total > 0 ? ((result.net_profit || 0) / result.revenue.total) * 100 : 0
            };

            // Return with both detailed data and summary
            return res.status(200).json({
                success: true,
                data: {
                    period: result.period,
                    summary: summary,
                    revenue: result.revenue,
                    cost_of_goods_sold: result.cost_of_goods_sold,
                    expenses: result.expenses,
                    gross_profit: result.gross_profit,
                    net_profit: result.net_profit,
                    has_comparison: result.has_comparison
                },
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

    // ============================================================================
    // PERIOD CLOSING METHODS
    // ============================================================================

    /**
     * GET /api/accounting/periods
     * List all accounting periods
     */
    static async listAccountingPeriods(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const { period_type, status, from_date, to_date } = req.query;

            log.info('Listing accounting periods', {
                businessId,
                filters: { period_type, status, from_date, to_date }
            });

            const result = await FinancialStatementService.listAccountingPeriods(
                businessId,
                { period_type, status, from_date, to_date }
            );

            return res.status(200).json({
                success: true,
                data: result,
                message: 'Accounting periods retrieved successfully'
            });

        } catch (error) {
            log.error('Error listing accounting periods:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to list accounting periods',
                error: error.message
            });
        }
    }

    /**
     * GET /api/accounting/periods/status
     * Get current period status
     */
    static async getCurrentPeriodStatus(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const { date } = req.query;

            log.info('Getting current period status', {
                businessId,
                date
            });

            const result = await FinancialStatementService.getCurrentPeriodStatus(
                businessId,
                date
            );

            return res.status(200).json({
                success: true,
                data: result.data,
                message: 'Period status retrieved successfully'
            });

        } catch (error) {
            log.error('Error getting period status:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get period status',
                error: error.message
            });
        }
    }

    /**
     * POST /api/accounting/periods/close
     * Close an accounting period
     */
    static async closeAccountingPeriod(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.id || req.user.userId;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const { period_id, period_name } = req.body;

            if (!period_id && !period_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Either period_id or period_name is required'
                });
            }

            log.info('Closing accounting period', {
                businessId,
                userId,
                period_id,
                period_name
            });

            const result = await FinancialStatementService.closeAccountingPeriod(
                businessId,
                period_id,
                period_name,
                userId
            );

            return res.status(200).json({
                success: true,
                data: result.data,
                message: result.data.message || 'Period closed successfully'
            });

        } catch (error) {
            log.error('Error closing period:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to close period',
                error: error.message
            });
        }
    }

    /**
     * POST /api/accounting/periods/reopen
     * Reopen an accounting period
     */
    static async reopenAccountingPeriod(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.id || req.user.userId;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const { period_id, period_name, reason } = req.body;

            if (!period_id && !period_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Either period_id or period_name is required'
                });
            }

            log.info('Reopening accounting period', {
                businessId,
                userId,
                period_id,
                period_name,
                reason
            });

            const result = await FinancialStatementService.reopenAccountingPeriod(
                businessId,
                period_id,
                period_name,
                userId,
                reason
            );

            return res.status(200).json({
                success: true,
                data: result.data,
                message: result.data.message || 'Period reopened successfully'
            });

        } catch (error) {
            log.error('Error reopening period:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to reopen period',
                error: error.message
            });
        }
    }
}

export default FinancialStatementController;
