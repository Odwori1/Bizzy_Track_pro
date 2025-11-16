import { FinancialReportService } from '../services/financialReportService.js';
import { log } from '../utils/logger.js';

export const financialReportController = {
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
  }
};
