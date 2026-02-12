// File: backend/app/controllers/whtReturnController.js
// Description: Complete WHT Returns Controller - Phase 5
// Created: February 12, 2026
// Status: ✅ PRODUCTION READY

import { WHTReturnService } from '../services/whtReturnService.js';
import { log } from '../utils/logger.js';

export class WHTReturnController {
    /**
     * List returns with filtering
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

            log.info('Listing WHT returns', { businessId, filters });

            const result = await WHTReturnService.listReturns(businessId, filters);

            return res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            log.error('Return listing error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to list returns: ${error.message}`
            });
        }
    }

    /**
     * Get single return by ID
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

            log.info('Getting WHT return', { returnId: id, businessId });

            const whtReturn = await WHTReturnService.getReturnById(id, businessId);

            if (!whtReturn) {
                return res.status(404).json({
                    success: false,
                    message: 'Return not found'
                });
            }

            return res.status(200).json({
                success: true,
                data: whtReturn
            });

        } catch (error) {
            log.error('Return retrieval error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to get return: ${error.message}`
            });
        }
    }

    /**
     * Generate new return from certificates
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

            log.info('Generating WHT return', {
                businessId,
                userId,
                period_start,
                period_end,
                return_type
            });

            const result = await WHTReturnService.generateReturn(
                businessId,
                period_start,
                period_end,
                return_type || 'monthly',
                userId
            );

            return res.status(201).json({
                success: true,
                message: 'Return generated successfully',
                data: result
            });

        } catch (error) {
            log.error('Return generation error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to generate return: ${error.message}`
            });
        }
    }

    /**
     * Submit return to URA
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

            log.info('Submitting WHT return to URA', {
                returnId: id,
                businessId,
                userId
            });

            const result = await WHTReturnService.submitToURA(id, businessId, userId);

            return res.status(200).json({
                success: true,
                message: 'Return submitted to URA successfully',
                data: result
            });

        } catch (error) {
            log.error('URA submission error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to submit to URA: ${error.message}`
            });
        }
    }

    /**
     * Calculate penalty for return
     */
    static async calculatePenalty(req, res) {
        try {
            const { id } = req.params;
            const businessId = req.user?.businessId || req.user?.business_id;

            if (!businessId) {
                return res.status(400).json({
                    success: false,
                    message: 'Business ID not found in user session'
                });
            }

            const result = await WHTReturnService.calculatePenalty(id, businessId);

            return res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            log.error('Penalty calculation error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to calculate penalty: ${error.message}`
            });
        }
    }

    /**
     * Add approval to return
     */
    static async addApproval(req, res) {
        try {
            const { id } = req.params;
            const businessId = req.user?.businessId || req.user?.business_id;
            const userId = req.user?.id || req.user?.userId;
            const { level, level_name, comments } = req.body;

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

            if (!level || !level_name) {
                return res.status(400).json({
                    success: false,
                    message: 'level and level_name are required'
                });
            }

            const result = await WHTReturnService.addApproval(
                id,
                businessId,
                userId,
                parseInt(level),
                level_name,
                comments
            );

            return res.status(200).json({
                success: true,
                message: `Level ${level} approval added successfully`,
                data: result
            });

        } catch (error) {
            log.error('Approval addition error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to add approval: ${error.message}`
            });
        }
    }

    /**
     * Record payment for return
     */
    static async recordPayment(req, res) {
        try {
            const { id } = req.params;
            const businessId = req.user?.businessId || req.user?.business_id;
            const userId = req.user?.id || req.user?.userId;
            const paymentData = req.body;

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

            if (!paymentData.payment_amount || !paymentData.payment_method) {
                return res.status(400).json({
                    success: false,
                    message: 'payment_amount and payment_method are required'
                });
            }

            const result = await WHTReturnService.recordPayment(
                id,
                businessId,
                paymentData,
                userId
            );

            return res.status(200).json({
                success: true,
                message: 'Payment recorded successfully',
                data: result
            });

        } catch (error) {
            log.error('Payment recording error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to record payment: ${error.message}`
            });
        }
    }

    /**
     * Get return statistics
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

            const stats = await WHTReturnService.getStatistics(businessId, year);

            return res.status(200).json({
                success: true,
                data: stats
            });

        } catch (error) {
            log.error('Statistics retrieval error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to get statistics: ${error.message}`
            });
        }
    }

    /**
     * Void return
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

            const result = await WHTReturnService.voidReturn(id, businessId, userId, reason);

            return res.status(200).json({
                success: true,
                message: 'Return voided successfully',
                data: result
            });

        } catch (error) {
            log.error('Return void error:', error);
            return res.status(500).json({
                success: false,
                message: `Failed to void return: ${error.message}`
            });
        }
    }

    /**
     * Test return generation
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

            log.info('Testing WHT return generation', { businessId, userId });

            const result = await WHTReturnService.testReturnGeneration(businessId, userId);

            return res.status(200).json({
                success: true,
                message: 'Test return generated successfully',
                data: result
            });

        } catch (error) {
            log.error('Return test error:', {
                error: error.message,
                stack: error.stack
            });
            return res.status(500).json({
                success: false,
                message: `Test return generation failed: ${error.message}`
            });
        }
    }
}

export default WHTReturnController;
