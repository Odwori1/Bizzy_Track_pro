// File: backend/app/controllers/taxDashboardController.js
import { TaxDashboardService } from '../services/taxDashboardService.js';
import { ReportGenerationService } from '../services/reportGenerationService.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

/**
 * TAX DASHBOARD CONTROLLER - API endpoints for dashboard and reports
 * Phase 8: Tax Dashboard & Reporting
 */
export class TaxDashboardController {

    // =========================================================================
    // DASHBOARD ENDPOINTS
    // =========================================================================

    /**
     * Get complete dashboard summary
     * GET /api/tax/dashboard/summary
     */
    static async getDashboardSummary(req, res) {
        try {
            const businessId = req.user.businessId;
            const userId = req.user.id;
            const { period = 'month' } = req.query;

            log.info('Dashboard summary requested', {
                businessId,
                userId,
                period
            });

            // Pass userId to service for preferences
            const summary = await TaxDashboardService.getDashboardSummary(
                businessId,
                period,
                userId  // Add userId parameter
            );

            // Log audit
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'dashboard.viewed',
                resourceType: 'dashboard',
                resourceId: 'summary',
                newValues: { period }
            });

            return res.status(200).json({
                success: true,
                data: summary,
                message: 'Dashboard summary retrieved successfully'
            });

        } catch (error) {
            log.error('Dashboard summary error:', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id,
                businessId: req.user?.businessId
            });
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve dashboard summary',
                error: error.message
            });
        }
    }

    /**
     * Get current tax liabilities
     * GET /api/tax/dashboard/liabilities
     */
    static async getTaxLiabilities(req, res) {
        try {
            const businessId = req.user.businessId;
            const { asOfDate } = req.query;

            const liabilities = await TaxDashboardService.getTaxLiabilities(
                businessId,
                asOfDate
            );

            return res.status(200).json({
                success: true,
                data: liabilities,
                message: 'Tax liabilities retrieved successfully'
            });

        } catch (error) {
            log.error('Tax liabilities error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve tax liabilities',
                error: error.message
            });
        }
    }

    /**
     * Get upcoming filing deadlines
     * GET /api/tax/dashboard/deadlines
     */
    static async getUpcomingDeadlines(req, res) {
        try {
            const businessId = req.user.businessId;
            const { limit = 10 } = req.query;

            const deadlines = await TaxDashboardService.getUpcomingDeadlines(
                businessId,
                parseInt(limit)
            );

            return res.status(200).json({
                success: true,
                data: deadlines,
                message: 'Upcoming deadlines retrieved successfully'
            });

        } catch (error) {
            log.error('Upcoming deadlines error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve upcoming deadlines',
                error: error.message
            });
        }
    }

    /**
     * Get compliance scorecard
     * GET /api/tax/dashboard/compliance
     */
    static async getComplianceScore(req, res) {
        try {
            const businessId = req.user.businessId;

            const compliance = await TaxDashboardService.getComplianceScore(businessId);

            return res.status(200).json({
                success: true,
                data: compliance,
                message: 'Compliance score retrieved successfully'
            });

        } catch (error) {
            log.error('Compliance score error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve compliance score',
                error: error.message
            });
        }
    }

    /**
     * Get tax forecast
     * GET /api/tax/dashboard/forecast
     */
    static async getTaxForecast(req, res) {
        try {
            const businessId = req.user.businessId;
            const { months = 3 } = req.query;

            const forecast = await TaxDashboardService.getTaxForecast(
                businessId,
                parseInt(months)
            );

            return res.status(200).json({
                success: true,
                data: forecast,
                message: 'Tax forecast retrieved successfully'
            });

        } catch (error) {
            log.error('Tax forecast error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve tax forecast',
                error: error.message
            });
        }
    }

    /**
     * Get tax alerts
     * GET /api/tax/dashboard/alerts
     */
    static async getTaxAlerts(req, res) {
        try {
            const businessId = req.user.businessId;

            const alerts = await TaxDashboardService.getTaxAlerts(businessId);

            return res.status(200).json({
                success: true,
                data: alerts,
                message: 'Tax alerts retrieved successfully'
            });

        } catch (error) {
            log.error('Tax alerts error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve tax alerts',
                error: error.message
            });
        }
    }

    // =========================================================================
    // REPORT ENDPOINTS
    // =========================================================================

    /**
     * Generate a specific report
     * GET /api/tax/reports/:reportName
     */
    static async generateReport(req, res) {
        try {
            const businessId = req.user.businessId;
            const userId = req.user.id;
            const { reportName } = req.params;
            const { 
                startDate, 
                endDate, 
                format = 'json',
                ...filters 
            } = req.query;

            log.info('Generating report', {
                businessId,
                userId,
                reportName,
                startDate,
                endDate,
                format
            });

            let report;
            const params = { startDate, endDate, ...filters };

            // Route to appropriate report generator
            switch (reportName) {
                case 'sales-tax-summary':
                    report = await ReportGenerationService.generateSalesTaxReport(businessId, params);
                    break;
                case 'wht-certificate-register':
                    report = await ReportGenerationService.generateWHTRegister(businessId, params);
                    break;
                case 'vat-returns-history':
                    report = await ReportGenerationService.generateVATReturnsHistory(businessId, params);
                    break;
                case 'tax-credit-report':
                    report = await ReportGenerationService.generateTaxCreditReport(businessId, params);
                    break;
                case 'supplier-compliance':
                    report = await ReportGenerationService.generateSupplierComplianceReport(businessId, params);
                    break;
                default:
                    return res.status(400).json({
                        success: false,
                        message: `Unknown report: ${reportName}`
                    });
            }

            // Export in requested format
            const exported = await ReportGenerationService.exportReport(report, format);

            // Log audit
            await auditLogger.logAction({
                businessId,
                userId,
                action: 'report.generated',
                resourceType: 'report',
                resourceId: reportName,
                newValues: { format, params }
            });

            // Set appropriate content type for downloads
            if (format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
                return res.send(exported.data);
            }

            return res.status(200).json({
                success: true,
                data: exported,
                message: 'Report generated successfully'
            });

        } catch (error) {
            log.error('Report generation error:', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id,
                businessId: req.user?.businessId,
                reportName: req.params.reportName
            });
            return res.status(500).json({
                success: false,
                message: 'Failed to generate report',
                error: error.message
            });
        }
    }

    /**
     * Schedule a report
     * POST /api/tax/reports/:reportName/schedule
     */
    static async scheduleReport(req, res) {
        try {
            const businessId = req.user.businessId;
            const userId = req.user.id;
            const { reportName } = req.params;
            const {
                scheduleType,
                recipients,
                exportFormats,
                reportParameters,
                weeklyDay,
                monthlyDay,
                runTime
            } = req.body;

            // Validate required fields
            if (!scheduleType || !recipients || !exportFormats) {
                return res.status(400).json({
                    success: false,
                    message: 'scheduleType, recipients, and exportFormats are required'
                });
            }

            // Insert into report_schedules table
            const client = await TaxDashboardService.pool.connect();
            try {
                const result = await client.query(`
                    INSERT INTO report_schedules (
                        business_id,
                        created_by,
                        report_name,
                        report_parameters,
                        schedule_type,
                        weekly_day,
                        monthly_day,
                        run_time,
                        export_formats,
                        recipients,
                        is_active
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
                    RETURNING id
                `, [
                    businessId,
                    userId,
                    reportName,
                    reportParameters || {},
                    scheduleType,
                    weeklyDay || null,
                    monthlyDay || null,
                    runTime || '08:00:00',
                    exportFormats,
                    recipients
                ]);

                return res.status(201).json({
                    success: true,
                    data: {
                        scheduleId: result.rows[0].id,
                        reportName,
                        scheduleType
                    },
                    message: 'Report scheduled successfully'
                });

            } finally {
                client.release();
            }

        } catch (error) {
            log.error('Schedule report error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to schedule report',
                error: error.message
            });
        }
    }

    /**
     * Get all scheduled reports
     * GET /api/tax/reports/scheduled
     */
    static async getScheduledReports(req, res) {
        try {
            const businessId = req.user.businessId;

            const client = await TaxDashboardService.pool.connect();
            try {
                const result = await client.query(`
                    SELECT
                        id,
                        report_name,
                        schedule_type,
                        weekly_day,
                        monthly_day,
                        run_time,
                        export_formats,
                        recipients,
                        is_active,
                        last_run_at,
                        last_run_status,
                        next_run_at,
                        total_runs,
                        successful_runs,
                        created_at
                    FROM report_schedules
                    WHERE business_id = $1
                    ORDER BY next_run_at NULLS LAST, created_at DESC
                `, [businessId]);

                return res.status(200).json({
                    success: true,
                    data: result.rows,
                    message: 'Scheduled reports retrieved successfully'
                });

            } finally {
                client.release();
            }

        } catch (error) {
            log.error('Get scheduled reports error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve scheduled reports',
                error: error.message
            });
        }
    }

    /**
     * Delete/cancel a scheduled report
     * DELETE /api/tax/reports/schedule/:scheduleId
     */
    static async deleteSchedule(req, res) {
        try {
            const businessId = req.user.businessId;
            const { scheduleId } = req.params;

            const client = await TaxDashboardService.pool.connect();
            try {
                const result = await client.query(`
                    DELETE FROM report_schedules
                    WHERE id = $1 AND business_id = $2
                    RETURNING id
                `, [scheduleId, businessId]);

                if (result.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: 'Schedule not found'
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: 'Schedule deleted successfully'
                });

            } finally {
                client.release();
            }

        } catch (error) {
            log.error('Delete schedule error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to delete schedule',
                error: error.message
            });
        }
    }

    // =========================================================================
    // DASHBOARD PREFERENCES
    // =========================================================================

    /**
     * Get user dashboard preferences
     * GET /api/tax/dashboard/preferences
     */
    static async getPreferences(req, res) {
        try {
            const businessId = req.user.businessId;
            const userId = req.user.id;

            const preferences = await TaxDashboardService.getUserPreferences(businessId, userId);

            return res.status(200).json({
                success: true,
                data: preferences,
                message: 'Dashboard preferences retrieved successfully'
            });

        } catch (error) {
            log.error('Get preferences error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve dashboard preferences',
                error: error.message
            });
        }
    }

    /**
     * Update user dashboard preferences
     * PUT /api/tax/dashboard/preferences
     */
    static async updatePreferences(req, res) {
        try {
            const businessId = req.user.businessId;
            const userId = req.user.id;
            const { widget_config, default_date_range, auto_refresh_interval, color_scheme } = req.body;

            const client = await TaxDashboardService.pool.connect();
            try {
                const result = await client.query(`
                    INSERT INTO dashboard_preferences (
                        business_id,
                        user_id,
                        widget_config,
                        default_date_range,
                        auto_refresh_interval,
                        color_scheme,
                        created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (business_id, user_id)
                    DO UPDATE SET
                        widget_config = EXCLUDED.widget_config,
                        default_date_range = EXCLUDED.default_date_range,
                        auto_refresh_interval = EXCLUDED.auto_refresh_interval,
                        color_scheme = EXCLUDED.color_scheme,
                        updated_at = NOW()
                    RETURNING *
                `, [
                    businessId,
                    userId,
                    widget_config || { widgets: [] },
                    default_date_range || 'month',
                    auto_refresh_interval || null,
                    color_scheme || 'light',
                    userId
                ]);

                return res.status(200).json({
                    success: true,
                    data: result.rows[0],
                    message: 'Dashboard preferences updated successfully'
                });

            } finally {
                client.release();
            }

        } catch (error) {
            log.error('Update preferences error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to update dashboard preferences',
                error: error.message
            });
        }
    }
}

export default TaxDashboardController;
