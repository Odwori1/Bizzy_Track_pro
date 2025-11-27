import { FinancialReportService } from '../services/financialReportService.js';
import { ExportService } from '../services/exportService.js';
import { log } from '../utils/logger.js';

export const financialReportController = {
  // NEW: Balance Sheet Report
  async getBalanceSheet(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: 'Start date and end date are required for balance sheet report'
        });
      }

      log.info('Generating balance sheet', { businessId, start_date, end_date });

      const balanceSheet = await FinancialReportService.getBalanceSheet(businessId, start_date, end_date);

      res.json({
        success: true,
        data: balanceSheet,
        message: 'Balance sheet generated successfully'
      });

    } catch (error) {
      log.error('Balance sheet generation controller error', error);
      next(error);
    }
  },

  async getFinancialReport(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { start_date, end_date } = req.query;

      log.info('Generating financial report', { businessId, start_date, end_date });

      const report = await FinancialReportService.getFinancialReport(businessId, start_date, end_date);

      res.json({
        success: true,
        data: report,
        message: 'Financial report generated successfully'
      });

    } catch (error) {
      log.error('Financial report generation controller error', error);
      next(error);
    }
  },

  async calculateTithe(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { start_date, end_date, percentage, enabled } = req.query;

      log.info('Calculating tithe', { businessId, start_date, end_date, percentage, enabled });

      const titheCalculation = await FinancialReportService.calculateTithe(businessId, {
        start_date: start_date || null,
        end_date: end_date || null,
        percentage: percentage ? parseFloat(percentage) : 10,
        enabled: enabled !== 'false' // Default to true unless explicitly false
      });

      res.json({
        success: true,
        data: titheCalculation,
        message: titheCalculation.enabled ? 'Tithe calculated successfully' : 'Tithe calculation is disabled'
      });

    } catch (error) {
      log.error('Tithe calculation controller error', error);
      next(error);
    }
  },

  async getCashFlowReport(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: 'Start date and end date are required for cash flow report'
        });
      }

      log.info('Generating cash flow report', { businessId, start_date, end_date });

      const cashFlow = await FinancialReportService.getCashFlowReport(businessId, start_date, end_date);

      res.json({
        success: true,
        data: cashFlow,
        message: 'Cash flow report generated successfully'
      });

    } catch (error) {
      log.error('Cash flow report generation controller error', error);
      next(error);
    }
  },

  async getProfitAndLoss(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: 'Start date and end date are required for profit and loss statement'
        });
      }

      log.info('Generating profit and loss statement', { businessId, start_date, end_date });

      const pnl = await FinancialReportService.getProfitAndLoss(businessId, start_date, end_date);

      res.json({
        success: true,
        data: pnl,
        message: 'Profit and loss statement generated successfully'
      });

    } catch (error) {
      log.error('Profit and loss statement generation controller error', error);
      next(error);
    }
  },

  // NEW: Quick Reports Endpoints
  async getMonthlySummary(req, res, next) {
    try {
      const businessId = req.user.businessId;

      log.info('Generating monthly summary', { businessId });

      const monthlySummary = await FinancialReportService.getMonthlySummary(businessId);

      res.json({
        success: true,
        data: monthlySummary,
        message: 'Monthly summary generated successfully'
      });

    } catch (error) {
      log.error('Monthly summary generation controller error', error);
      next(error);
    }
  },

  async getExpenseAnalysis(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: 'Start date and end date are required for expense analysis'
        });
      }

      log.info('Generating expense analysis', { businessId, start_date, end_date });

      const expenseAnalysis = await FinancialReportService.getExpenseAnalysis(businessId, start_date, end_date);

      res.json({
        success: true,
        data: expenseAnalysis,
        message: 'Expense analysis generated successfully'
      });

    } catch (error) {
      log.error('Expense analysis generation controller error', error);
      next(error);
    }
  },

  async getRevenueReport(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: 'Start date and end date are required for revenue report'
        });
      }

      log.info('Generating revenue report', { businessId, start_date, end_date });

      const revenueReport = await FinancialReportService.getRevenueReport(businessId, start_date, end_date);

      res.json({
        success: true,
        data: revenueReport,
        message: 'Revenue report generated successfully'
      });

    } catch (error) {
      log.error('Revenue report generation controller error', error);
      next(error);
    }
  },

  // NEW: Export Endpoints
  async exportPDF(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { report_type, start_date, end_date } = req.body;

      if (!report_type) {
        return res.status(400).json({
          success: false,
          error: 'Report type is required for PDF export'
        });
      }

      log.info('Generating PDF export', { businessId, report_type, start_date, end_date });

      // Fetch the appropriate report data
      let reportData;
      switch (report_type) {
        case 'profit-loss':
          if (!start_date || !end_date) {
            return res.status(400).json({
              success: false,
              error: 'Start date and end date are required for profit-loss export'
            });
          }
          reportData = await FinancialReportService.getProfitAndLoss(businessId, start_date, end_date);
          break;
        case 'balance-sheet':
          if (!start_date || !end_date) {
            return res.status(400).json({
              success: false,
              error: 'Start date and end date are required for balance-sheet export'
            });
          }
          reportData = await FinancialReportService.getBalanceSheet(businessId, start_date, end_date);
          break;
        case 'cash-flow':
          if (!start_date || !end_date) {
            return res.status(400).json({
              success: false,
              error: 'Start date and end date are required for cash-flow export'
            });
          }
          reportData = await FinancialReportService.getCashFlowReport(businessId, start_date, end_date);
          break;
        case 'monthly-summary':
          reportData = await FinancialReportService.getMonthlySummary(businessId);
          break;
        default:
          return res.status(400).json({
            success: false,
            error: 'Unsupported report type for export'
          });
      }

      // Generate PDF
      const pdfBuffer = await ExportService.generatePDF(reportData, report_type, {
        start_date,
        end_date
      });

      // Set response headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${report_type}-report-${new Date().toISOString().split('T')[0]}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      res.send(pdfBuffer);

    } catch (error) {
      log.error('PDF export generation controller error', error);
      next(error);
    }
  },

  async exportExcel(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { report_type, start_date, end_date } = req.body;

      if (!report_type) {
        return res.status(400).json({
          success: false,
          error: 'Report type is required for Excel export'
        });
      }

      log.info('Generating Excel export', { businessId, report_type, start_date, end_date });

      // Fetch the appropriate report data
      let reportData;
      switch (report_type) {
        case 'profit-loss':
          if (!start_date || !end_date) {
            return res.status(400).json({
              success: false,
              error: 'Start date and end date are required for profit-loss export'
            });
          }
          reportData = await FinancialReportService.getProfitAndLoss(businessId, start_date, end_date);
          break;
        case 'balance-sheet':
          if (!start_date || !end_date) {
            return res.status(400).json({
              success: false,
              error: 'Start date and end date are required for balance-sheet export'
            });
          }
          reportData = await FinancialReportService.getBalanceSheet(businessId, start_date, end_date);
          break;
        case 'cash-flow':
          if (!start_date || !end_date) {
            return res.status(400).json({
              success: false,
              error: 'Start date and end date are required for cash-flow export'
            });
          }
          reportData = await FinancialReportService.getCashFlowReport(businessId, start_date, end_date);
          break;
        case 'monthly-summary':
          reportData = await FinancialReportService.getMonthlySummary(businessId);
          break;
        default:
          return res.status(400).json({
            success: false,
            error: 'Unsupported report type for export'
          });
      }

      // Generate Excel
      const excelBuffer = await ExportService.generateExcel(reportData, report_type, {
        start_date,
        end_date
      });

      // Set response headers for Excel download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${report_type}-report-${new Date().toISOString().split('T')[0]}.xlsx"`);
      res.setHeader('Content-Length', excelBuffer.length);

      res.send(excelBuffer);

    } catch (error) {
      log.error('Excel export generation controller error', error);
      next(error);
    }
  }
};
