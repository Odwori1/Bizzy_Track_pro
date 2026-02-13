// File: backend/app/controllers/vatReturnController.js
// Description: Complete VAT Returns Controller - URA Form 4
// Created: February 13, 2026

import { VATReturnService } from '../services/vatReturnService.js';
import { log } from '../utils/logger.js';

export class VATReturnController {
    /**
     * List VAT returns with filtering
     */
    static async listReturns(req, res) {
        try {
            const businessId = req.user?.businessId || req.user?.business_id;
            const filters = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Listing VAT returns', { businessId, filters });

            const result = await VATReturnService.listReturns(businessId, filters);

            return res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            log.error('VAT return listing error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to list VAT returns: ${error.message}`
            });
        }
    }

    /**
     * Get single VAT return by ID
     */
    static async getReturn(req, res) {
        try {
            const { id } = req.params;
            const businessId = req.user?.businessId || req.user?.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            log.info('Getting VAT return', { returnId: id, businessId });

            const vatReturn = await VATReturnService.getReturnById(id, businessId);

            if (!vatReturn) {
                return res.status(404).json({
                    success: false,
                    message: 'VAT return not found'
                });
            }

            return res.status(200).json({
                success: true,
                data: vatReturn
            });

        } catch (error) {
            log.error('VAT return retrieval error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to get VAT return: ${error.message}`
            });
        }
    }

    /**
     * Generate new VAT return from invoices and purchases
     */
    static async generateReturn(req, res) {
        try {
            const businessId = req.user?.businessId || req.user?.business_id;
            const userId = req.user?.id || req.user?.userId;
            const { period_start, period_end, return_type } = req.body;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID not found in session'
                });
            }

            if (!period_start || !period_end) {
                return res.status(400).json({
                    success: false,
                    message: 'period_start and period_end are required'
                });
            }

            log.info('Generating VAT return', {
                businessId,
                userId,
                period_start,
                period_end,
                return_type
            });

            const result = await VATReturnService.generateReturn(
                businessId,
                period_start,
                period_end,
                return_type || 'monthly',
                userId
            );

            return res.status(201).json({
                success: true,
                message: 'VAT return generated successfully',
                data: result
            });

        } catch (error) {
            log.error('VAT return generation error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to generate VAT return: ${error.message}`
            });
        }
    }

    /**
     * Submit VAT return to URA
     */
    static async submitToURA(req, res) {
        try {
            const { id } = req.params;
            const businessId = req.user?.businessId || req.user?.business_id;
            const userId = req.user?.id || req.user?.userId;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID not found in session'
                });
            }

            log.info('Submitting VAT return to URA', {
                returnId: id,
                businessId,
                userId
            });

            const result = await VATReturnService.submitToURA(id, businessId, userId);

            return res.status(200).json({
                success: true,
                message: 'VAT return submitted to URA successfully',
                data: result
            });

        } catch (error) {
            log.error('VAT URA submission error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to submit to URA: ${error.message}`
            });
        }
    }

    /**
     * Get VAT return statistics
     */
    static async getStatistics(req, res) {
        try {
            const businessId = req.user?.businessId || req.user?.business_id;
            const { year } = req.query;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const stats = await VATReturnService.getStatistics(businessId, year);

            return res.status(200).json({
                success: true,
                data: stats
            });

        } catch (error) {
            log.error('VAT statistics error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to get VAT statistics: ${error.message}`
            });
        }
    }

    /**
     * Test VAT return generation
     */
    static async testReturn(req, res) {
        try {
            const businessId = req.user?.businessId || req.user?.business_id;
            const userId = req.user?.id || req.user?.userId;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID not found in session'
                });
            }

            log.info('Testing VAT return generation', { businessId, userId });

            const result = await VATReturnService.testReturnGeneration(businessId, userId);

            return res.status(200).json({
                success: true,
                message: 'Test VAT return generated successfully',
                data: result
            });

        } catch (error) {
            log.error('VAT test error:', {
                error: error.message,
                stack: error.stack
            });
            return res.status(500).json({
                success: false,
                message: `Test VAT return generation failed: ${error.message}`
            });
        }
    }

    /**
     * Void VAT return
     */
    static async voidReturn(req, res) {
        try {
            const { id } = req.params;
            const businessId = req.user?.businessId || req.user?.business_id;
            const userId = req.user?.id || req.user?.userId;
            const { reason } = req.body;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID not found in session'
                });
            }

            if (!reason) {
                return res.status(400).json({
                    success: false,
                    message: 'reason is required to void a return'
                });
            }

            log.info('Voiding VAT return', { returnId: id, businessId, userId, reason });

            const result = await VATReturnService.voidReturn(id, businessId, userId, reason);

            return res.status(200).json({
                success: true,
                message: 'VAT return voided successfully',
                data: result
            });

        } catch (error) {
            log.error('VAT return void error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to void VAT return: ${error.message}`
            });
        }
    }
}

export default VATReturnController;
