import { ReportingService } from '../services/reportingService.js';
import { log } from '../utils/logger.js';

export class ReportingController {

  // Create scheduled report
  static async createScheduledReport(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const reportData = req.body;

      log.info('Creating scheduled report', { businessId, userId, reportData: { name: reportData.name } });

      const report = await ReportingService.createScheduledReport(businessId, reportData, userId);

      res.status(201).json({
        success: true,
        message: 'Scheduled report created successfully',
        data: report
      });

    } catch (error) {
      log.error('Error creating scheduled report', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to create scheduled report',
        error: error.message
      });
    }
  }

  // Get scheduled reports
  static async getScheduledReports(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      log.info('Fetching scheduled reports', { businessId, filters });

      const reports = await ReportingService.getScheduledReports(businessId, filters);

      res.json({
        success: true,
        data: reports,
        count: reports.length
      });

    } catch (error) {
      log.error('Error fetching scheduled reports', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch scheduled reports',
        error: error.message
      });
    }
  }

  // Generate financial report
  static async generateFinancialReport(req, res) {
    try {
      const businessId = req.user.businessId;
      const { period } = req.query;

      log.info('Generating financial report', { businessId, period });

      const report = await ReportingService.generateFinancialReport(businessId, period);

      res.json({
        success: true,
        message: 'Financial report generated successfully',
        data: report
      });

    } catch (error) {
      log.error('Error generating financial report', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to generate financial report',
        error: error.message
      });
    }
  }

  // Generate customer report
  static async generateCustomerReport(req, res) {
    try {
      const businessId = req.user.businessId;
      const { period } = req.query;

      log.info('Generating customer report', { businessId, period });

      const report = await ReportingService.generateCustomerReport(businessId, period);

      res.json({
        success: true,
        message: 'Customer report generated successfully',
        data: report
      });

    } catch (error) {
      log.error('Error generating customer report', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to generate customer report',
        error: error.message
      });
    }
  }
}
