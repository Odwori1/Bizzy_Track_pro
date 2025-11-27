import { log } from '../utils/logger.js';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

export class ExportService {
  /**
   * Generate PDF report for financial data
   */
  static async generatePDF(reportData, reportType, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const chunks = [];
        
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(chunks);
          resolve(pdfBuffer);
        });
        
        // Add header
        doc.fontSize(20).text(`Financial ${reportType} Report`, 100, 100);
        doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, 100, 130);
        
        // Add report content based on type
        switch (reportType) {
          case 'profit-loss':
            this.addProfitLossContent(doc, reportData);
            break;
          case 'balance-sheet':
            this.addBalanceSheetContent(doc, reportData);
            break;
          case 'cash-flow':
            this.addCashFlowContent(doc, reportData);
            break;
          case 'monthly-summary':
            this.addMonthlySummaryContent(doc, reportData);
            break;
          default:
            doc.text('Report type not supported', 100, 160);
        }
        
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Add Profit & Loss content to PDF
   */
  static addProfitLossContent(doc, data) {
    let yPosition = 160;
    
    doc.fontSize(16).text('Profit & Loss Statement', 100, yPosition);
    yPosition += 40;
    
    // Revenue section
    doc.fontSize(14).text('Revenue', 100, yPosition);
    yPosition += 25;
    doc.fontSize(12).text(`Total Income: $${data.revenue?.total_income?.toLocaleString() || 0}`, 120, yPosition);
    yPosition += 20;
    
    // Expenses section
    doc.text('Expenses', 100, yPosition);
    yPosition += 25;
    doc.text(`Total Expenses: $${data.expenses?.total_expenses?.toLocaleString() || 0}`, 120, yPosition);
    yPosition += 20;
    
    // Net Profit section
    doc.text('Net Profit', 100, yPosition);
    yPosition += 25;
    const netProfit = data.net_profit || 0;
    const profitColor = netProfit >= 0 ? '#00ff00' : '#ff0000';
    doc.fillColor(profitColor).text(`$${netProfit.toLocaleString()}`, 120, yPosition);
    doc.fillColor('#000000');
    yPosition += 20;
    
    // Profit Margin
    doc.text(`Profit Margin: ${data.profit_margin?.toFixed(2) || 0}%`, 120, yPosition);
  }

  /**
   * Add Balance Sheet content to PDF
   */
  static addBalanceSheetContent(doc, data) {
    let yPosition = 160;
    
    doc.fontSize(16).text('Balance Sheet', 100, yPosition);
    yPosition += 40;
    
    // Assets
    doc.fontSize(14).text('Assets', 100, yPosition);
    yPosition += 25;
    doc.fontSize(12).text(`Total Assets: $${data.assets?.total_assets?.toLocaleString() || 0}`, 120, yPosition);
    yPosition += 20;
    
    // Liabilities
    doc.text('Liabilities', 100, yPosition);
    yPosition += 25;
    doc.text(`Total Liabilities: $${data.liabilities?.total_liabilities?.toLocaleString() || 0}`, 120, yPosition);
    yPosition += 20;
    
    // Equity
    doc.text('Equity', 100, yPosition);
    yPosition += 25;
    doc.text(`Total Equity: $${data.equity?.total_equity?.toLocaleString() || 0}`, 120, yPosition);
    yPosition += 20;
    
    // Verification
    const isBalanced = data.verification?.balanced || false;
    const balanceColor = isBalanced ? '#00ff00' : '#ff0000';
    doc.fillColor(balanceColor).text(`Balanced: ${isBalanced ? 'Yes' : 'No'}`, 120, yPosition);
    doc.fillColor('#000000');
  }

  /**
   * Add Cash Flow content to PDF
   */
  static addCashFlowContent(doc, data) {
    let yPosition = 160;
    
    doc.fontSize(16).text('Cash Flow Statement', 100, yPosition);
    yPosition += 40;
    
    if (Array.isArray(data)) {
      data.forEach((period, index) => {
        if (yPosition > 700) {
          doc.addPage();
          yPosition = 100;
        }
        
        doc.fontSize(12).text(`Period: ${period.period_display}`, 100, yPosition);
        yPosition += 20;
        doc.text(`Income: $${period.total_income?.toLocaleString() || 0}`, 120, yPosition);
        yPosition += 20;
        doc.text(`Expenses: $${period.total_expenses?.toLocaleString() || 0}`, 120, yPosition);
        yPosition += 20;
        
        const cashFlow = period.net_cash_flow || 0;
        const cashFlowColor = cashFlow >= 0 ? '#00ff00' : '#ff0000';
        doc.fillColor(cashFlowColor).text(`Net Cash Flow: $${cashFlow.toLocaleString()}`, 120, yPosition);
        doc.fillColor('#000000');
        yPosition += 30;
      });
    }
  }

  /**
   * Add Monthly Summary content to PDF
   */
  static addMonthlySummaryContent(doc, data) {
    let yPosition = 160;
    
    doc.fontSize(16).text('Monthly Summary Report', 100, yPosition);
    yPosition += 40;
    
    // Current Month
    doc.fontSize(14).text('Current Month', 100, yPosition);
    yPosition += 25;
    doc.fontSize(12).text(`Income: $${data.current_month?.income?.toLocaleString() || 0}`, 120, yPosition);
    yPosition += 20;
    doc.text(`Expenses: $${data.current_month?.expenses?.toLocaleString() || 0}`, 120, yPosition);
    yPosition += 20;
    doc.text(`Net Profit: $${data.current_month?.net_profit?.toLocaleString() || 0}`, 120, yPosition);
    yPosition += 30;
    
    // Trends
    doc.text('Trends vs Previous Month:', 100, yPosition);
    yPosition += 20;
    doc.text(`Income Trend: ${data.trends?.income?.toFixed(1) || 0}%`, 120, yPosition);
    yPosition += 20;
    doc.text(`Expense Trend: ${data.trends?.expenses?.toFixed(1) || 0}%`, 120, yPosition);
    yPosition += 20;
    doc.text(`Profit Trend: ${data.trends?.profit?.toFixed(1) || 0}%`, 120, yPosition);
  }

  /**
   * Generate Excel report for financial data
   */
  static async generateExcel(reportData, reportType, options = {}) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(reportType.replace('-', ' '));
    
    // Add header
    worksheet.mergeCells('A1:D1');
    worksheet.getCell('A1').value = `Financial ${reportType} Report`;
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };
    
    worksheet.getCell('A2').value = 'Generated on:';
    worksheet.getCell('B2').value = new Date().toLocaleDateString();
    
    let currentRow = 4;
    
    // Add report content based on type
    switch (reportType) {
      case 'profit-loss':
        currentRow = this.addProfitLossToExcel(worksheet, reportData, currentRow);
        break;
      case 'balance-sheet':
        currentRow = this.addBalanceSheetToExcel(worksheet, reportData, currentRow);
        break;
      case 'cash-flow':
        currentRow = this.addCashFlowToExcel(worksheet, reportData, currentRow);
        break;
      case 'monthly-summary':
        currentRow = this.addMonthlySummaryToExcel(worksheet, reportData, currentRow);
        break;
    }
    
    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = 15;
    });
    
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  /**
   * Add Profit & Loss data to Excel
   */
  static addProfitLossToExcel(worksheet, data, startRow) {
    let row = startRow;
    
    // Revenue
    worksheet.getCell(`A${row}`).value = 'Revenue';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;
    
    worksheet.getCell(`B${row}`).value = 'Total Income';
    worksheet.getCell(`C${row}`).value = data.revenue?.total_income || 0;
    worksheet.getCell(`C${row}`).numFmt = '$#,##0.00';
    row++;
    
    // Expenses
    worksheet.getCell(`A${row}`).value = 'Expenses';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;
    
    worksheet.getCell(`B${row}`).value = 'Total Expenses';
    worksheet.getCell(`C${row}`).value = data.expenses?.total_expenses || 0;
    worksheet.getCell(`C${row}`).numFmt = '$#,##0.00';
    row++;
    
    // Net Profit
    worksheet.getCell(`A${row}`).value = 'Net Profit';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;
    
    const netProfit = data.net_profit || 0;
    worksheet.getCell(`B${row}`).value = 'Amount';
    worksheet.getCell(`C${row}`).value = netProfit;
    worksheet.getCell(`C${row}`).numFmt = '$#,##0.00';
    worksheet.getCell(`C${row}`).font = { color: { argb: netProfit >= 0 ? 'FF00FF00' : 'FFFF0000' } };
    row++;
    
    // Profit Margin
    worksheet.getCell(`B${row}`).value = 'Profit Margin';
    worksheet.getCell(`C${row}`).value = data.profit_margin || 0;
    worksheet.getCell(`C${row}`).numFmt = '0.00"%';
    row++;
    
    return row;
  }

  /**
   * Add Balance Sheet data to Excel
   */
  static addBalanceSheetToExcel(worksheet, data, startRow) {
    let row = startRow;
    
    // Assets
    worksheet.getCell(`A${row}`).value = 'Assets';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;
    
    worksheet.getCell(`B${row}`).value = 'Total Assets';
    worksheet.getCell(`C${row}`).value = data.assets?.total_assets || 0;
    worksheet.getCell(`C${row}`).numFmt = '$#,##0.00';
    row++;
    
    // Liabilities
    worksheet.getCell(`A${row}`).value = 'Liabilities';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;
    
    worksheet.getCell(`B${row}`).value = 'Total Liabilities';
    worksheet.getCell(`C${row}`).value = data.liabilities?.total_liabilities || 0;
    worksheet.getCell(`C${row}`).numFmt = '$#,##0.00';
    row++;
    
    // Equity
    worksheet.getCell(`A${row}`).value = 'Equity';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;
    
    worksheet.getCell(`B${row}`).value = 'Total Equity';
    worksheet.getCell(`C${row}`).value = data.equity?.total_equity || 0;
    worksheet.getCell(`C${row}`).numFmt = '$#,##0.00';
    row++;
    
    // Verification
    worksheet.getCell(`A${row}`).value = 'Verification';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;
    
    worksheet.getCell(`B${row}`).value = 'Balanced';
    worksheet.getCell(`C${row}`).value = data.verification?.balanced ? 'Yes' : 'No';
    worksheet.getCell(`C${row}`).font = { color: { argb: data.verification?.balanced ? 'FF00FF00' : 'FFFF0000' } };
    row++;
    
    return row;
  }

  /**
   * Add Cash Flow data to Excel
   */
  static addCashFlowToExcel(worksheet, data, startRow) {
    let row = startRow;
    
    worksheet.getCell(`A${row}`).value = 'Period';
    worksheet.getCell(`B${row}`).value = 'Income';
    worksheet.getCell(`C${row}`).value = 'Expenses';
    worksheet.getCell(`D${row}`).value = 'Net Cash Flow';
    
    // Style header row
    ['A', 'B', 'C', 'D'].forEach(col => {
      worksheet.getCell(`${col}${row}`).font = { bold: true };
      worksheet.getCell(`${col}${row}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6FA' }
      };
    });
    row++;
    
    if (Array.isArray(data)) {
      data.forEach(period => {
        worksheet.getCell(`A${row}`).value = period.period_display;
        worksheet.getCell(`B${row}`).value = period.total_income || 0;
        worksheet.getCell(`C${row}`).value = period.total_expenses || 0;
        worksheet.getCell(`D${row}`).value = period.net_cash_flow || 0;
        
        // Format numbers
        ['B', 'C', 'D'].forEach(col => {
          worksheet.getCell(`${col}${row}`).numFmt = '$#,##0.00';
        });
        
        // Color net cash flow
        const netCashFlow = period.net_cash_flow || 0;
        worksheet.getCell(`D${row}`).font = {
          color: { argb: netCashFlow >= 0 ? 'FF00FF00' : 'FFFF0000' }
        };
        
        row++;
      });
    }
    
    return row;
  }

  /**
   * Add Monthly Summary data to Excel
   */
  static addMonthlySummaryToExcel(worksheet, data, startRow) {
    let row = startRow;
    
    // Current Month
    worksheet.getCell(`A${row}`).value = 'Current Month';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;
    
    worksheet.getCell(`B${row}`).value = 'Income';
    worksheet.getCell(`C${row}`).value = data.current_month?.income || 0;
    worksheet.getCell(`C${row}`).numFmt = '$#,##0.00';
    row++;
    
    worksheet.getCell(`B${row}`).value = 'Expenses';
    worksheet.getCell(`C${row}`).value = data.current_month?.expenses || 0;
    worksheet.getCell(`C${row}`).numFmt = '$#,##0.00';
    row++;
    
    worksheet.getCell(`B${row}`).value = 'Net Profit';
    worksheet.getCell(`C${row}`).value = data.current_month?.net_profit || 0;
    worksheet.getCell(`C${row}`).numFmt = '$#,##0.00';
    worksheet.getCell(`C${row}`).font = {
      color: { argb: data.current_month?.net_profit >= 0 ? 'FF00FF00' : 'FFFF0000' }
    };
    row++;
    
    // Trends
    worksheet.getCell(`A${row}`).value = 'Trends (%)';
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;
    
    worksheet.getCell(`B${row}`).value = 'Income Trend';
    worksheet.getCell(`C${row}`).value = data.trends?.income || 0;
    worksheet.getCell(`C${row}`).numFmt = '0.00"%';
    row++;
    
    worksheet.getCell(`B${row}`).value = 'Expense Trend';
    worksheet.getCell(`C${row}`).value = data.trends?.expenses || 0;
    worksheet.getCell(`C${row}`).numFmt = '0.00"%';
    row++;
    
    worksheet.getCell(`B${row}`).value = 'Profit Trend';
    worksheet.getCell(`C${row}`).value = data.trends?.profit || 0;
    worksheet.getCell(`C${row}`).numFmt = '0.00"%';
    row++;
    
    return row;
  }
}
