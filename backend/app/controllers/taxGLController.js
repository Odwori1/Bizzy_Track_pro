// File: backend/app/controllers/taxGLController.js
// Pattern follows: openingBalanceController.js, taxController.js
// Purpose: Tax-to-GL HTTP request handlers

import { TaxGLService } from '../services/taxGLService.js';
import { log } from '../utils/logger.js';

export class TaxGLController {

    /**
     * POST /api/accounting/tax/post/:taxId
     * Post a single tax transaction to GL
     */
    static async postTaxToGL(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { taxId } = req.params;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            if (!taxId) {
                return res.status(400).json({
                    success: false,
                    message: 'Tax ID is required'
                });
            }

            log.info('Posting single tax to GL', {
                businessId,
                taxId,
                userId
            });

            const result = await TaxGLService.postTaxToGL(businessId, taxId, userId);

            return res.status(200).json({
                success: result.success,
                data: {
                    journal_entry_id: result.journalEntryId
                },
                message: result.message
            });

        } catch (error) {
            log.error('Error posting tax to GL:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to post tax to GL',
                error: error.message
            });
        }
    }

    /**
     * POST /api/accounting/tax/batch-post
     * Batch post all unposted taxes for a date range
     */
    static async batchPostTaxes(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;
            const { start_date, end_date } = req.body;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            if (!start_date || !end_date) {
                return res.status(400).json({
                    success: false,
                    message: 'start_date and end_date are required'
                });
            }

            log.info('Batch posting taxes to GL', {
                businessId,
                start_date,
                end_date,
                userId
            });

            const result = await TaxGLService.batchPostTaxes(
                businessId, start_date, end_date, userId
            );

            return res.status(200).json({
                success: true,
                data: {
                    processed: result.processed,
                    succeeded: result.succeeded,
                    failed: result.failed
                },
                message: result.message,
                details: result.details
            });

        } catch (error) {
            log.error('Error batch posting taxes:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to batch post taxes',
                error: error.message
            });
        }
    }

    /**
     * POST /api/accounting/tax/backfill
     * Backfill all unposted taxes for the business
     */
    static async backfillTaxes(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const userId = req.user.userId || req.user.id;

            if (!businessId || !userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID or User ID not found in user session'
                });
            }

            log.info('Backfilling all taxes to GL', { businessId, userId });

            const result = await TaxGLService.backfillAllTaxes(businessId, userId);

            return res.status(200).json({
                success: true,
                data: {
                    processed: result.processed,
                    succeeded: result.succeeded,
                    failed: result.failed
                },
                message: result.message
            });

        } catch (error) {
            log.error('Error backfilling taxes:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to backfill taxes',
                error: error.message
            });
        }
    }

    /**
     * GET /api/accounting/tax/unposted
     * Get all unposted taxes
     */
    static async getUnpostedTaxes(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { start_date, end_date } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const result = await TaxGLService.getUnpostedTaxes(
                businessId, start_date, end_date
            );

            return res.status(200).json({
                success: true,
                data: result.taxes,
                count: result.count,
                total_tax_amount: result.total_tax_amount,
                message: 'Unposted taxes retrieved successfully'
            });

        } catch (error) {
            log.error('Error getting unposted taxes:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get unposted taxes',
                error: error.message
            });
        }
    }

    /**
     * GET /api/accounting/tax/liability-report
     * Get tax liability report
     */
    static async getTaxLiabilityReport(req, res) {
        try {
            const businessId = req.user.businessId || req.user.business_id;
            const { start_date, end_date } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!start_date || !end_date) {
                return res.status(400).json({
                    success: false,
                    message: 'start_date and end_date are required'
                });
            }

            const result = await TaxGLService.getTaxLiabilityReport(
                businessId, start_date, end_date
            );

            return res.status(200).json({
                success: true,
                data: result,
                message: 'Tax liability report generated successfully'
            });

        } catch (error) {
            log.error('Error getting tax liability report:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate tax liability report',
                error: error.message
            });
        }
    }
}

export default TaxGLController;
