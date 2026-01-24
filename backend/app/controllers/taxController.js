// File: backend/app/controllers/taxController.js
import { TaxService } from '../services/taxService.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

/**
 * TAX CONTROLLER - API endpoints for tax calculations
 */
export class TaxController {
  /**
   * Calculate tax for a single item
   */
  static async calculateItem(req, res) {
    try {
      const {
        productCategory,
        amount,
        transactionType = 'sale',
        customerType = 'company',
        isExport = false,
        transactionDate,
        countryCode = 'UG'
      } = req.body;

      // Get businessId from user session
      const businessId = req.user?.businessId || req.user?.business_id;
      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      // Validate required fields
      if (!productCategory || !amount) {
        return res.status(400).json({
          success: false,
          message: 'productCategory and amount are required'
        });
      }

      log.info('Calculating item tax', {
        businessId,
        productCategory,
        amount
      });

      const tax = await TaxService.calculateItemTax({
        businessId,
        countryCode,
        productCategory,
        amount,
        transactionType,
        customerType,
        isExport,
        transactionDate
      });

      // Log audit trail
      await auditLogger.logAction({
        businessId,
        userId: req.user?.userId || req.user?.id,
        action: 'tax.calculation.performed',
        resourceType: 'tax_calculation',
        resourceId: tax.taxId,
        newValues: {
          taxCode: tax.taxCode,
          taxAmount: tax.taxAmount,
          productCategory,
          amount
        }
      });

      return res.status(200).json({
        success: true,
        data: tax,
        message: 'Tax calculated successfully'
      });

    } catch (error) {
      log.error('Tax calculation controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to calculate tax',
        error: error.message
      });
    }
  }

  /**
   * Calculate tax for multiple items (invoice)
   */
  static async calculateInvoice(req, res) {
    try {
      const { lineItems, countryCode = 'UG' } = req.body;

      // Get businessId from user session
      const businessId = req.user?.businessId || req.user?.business_id;
      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      // Validate lineItems
      if (!Array.isArray(lineItems) || lineItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'lineItems must be a non-empty array'
        });
      }

      // Validate each line item
      for (const [index, item] of lineItems.entries()) {
        if (!item.productCategory || !item.amount) {
          return res.status(400).json({
            success: false,
            message: `Line item ${index + 1} must have productCategory and amount`
          });
        }
      }

      log.info('Calculating invoice tax', {
        businessId,
        lineItemCount: lineItems.length
      });

      const invoiceTax = await TaxService.calculateInvoiceTax(lineItems, businessId, countryCode);

      // Log audit trail
      await auditLogger.logAction({
        businessId,
        userId: req.user?.userId || req.user?.id,
        action: 'tax.invoice_calculation.performed',
        resourceType: 'tax_calculation',
        resourceId: `invoice_${Date.now()}`,
        newValues: {
          lineItemCount: lineItems.length,
          totalTaxAmount: invoiceTax.totals.totalTaxAmount,
          uniqueTaxTypes: invoiceTax.summary.uniqueTaxTypes
        }
      });

      return res.status(200).json({
        success: true,
        data: invoiceTax,
        message: 'Invoice tax calculated successfully'
      });

    } catch (error) {
      log.error('Invoice tax calculation controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to calculate invoice tax',
        error: error.message
      });
    }
  }

  /**
   * Get available tax categories
   */
  static async getCategories(req, res) {
    try {
      const { countryCode = 'UG' } = req.query;

      log.info('Getting tax categories', { countryCode });

      const categories = await TaxService.getTaxCategories(countryCode);

      return res.status(200).json({
        success: true,
        data: categories,
        message: 'Tax categories retrieved successfully'
      });

    } catch (error) {
      log.error('Get categories controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve tax categories',
        error: error.message
      });
    }
  }

  /**
   * Get tax configuration
   */
  static async getConfiguration(req, res) {
    try {
      const { countryCode = 'UG' } = req.query;

      log.info('Getting tax configuration', { countryCode });

      const configuration = await TaxService.getTaxConfiguration(countryCode);

      return res.status(200).json({
        success: true,
        data: configuration,
        message: 'Tax configuration retrieved successfully'
      });

    } catch (error) {
      log.error('Get configuration controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve tax configuration',
        error: error.message
      });
    }
  }

  /**
   * Run test scenarios
   */
  static async runTests(req, res) {
    try {
      // Get businessId from user session or use default test business
      const businessId = req.user?.businessId || req.user?.business_id || 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';

      log.info('Running tax test scenarios', { businessId });

      const testResults = await TaxService.runTestScenarios(businessId);

      return res.status(200).json({
        success: true,
        data: testResults,
        message: 'Tax tests completed'
      });

    } catch (error) {
      log.error('Test scenarios controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to run tax tests',
        error: error.message
      });
    }
  }

  /**
   * Test controller endpoint
   */
  static async testController(req, res) {
    try {
      // Get businessId from user session
      const businessId = req.user?.businessId || req.user?.business_id;

      return res.status(200).json({
        success: true,
        data: {
          businessId,
          timestamp: new Date().toISOString(),
          status: 'Tax controller is operational',
          features: [
            'Single item tax calculation',
            'Invoice tax calculation',
            'Tax categories lookup',
            'Tax configuration',
            'Test scenarios'
          ],
          database: 'Uses PostgreSQL calculate_item_tax function',
          supportedCountries: ['UG'],
          notes: 'WHT mappings fixed for Uganda'
        },
        message: 'Tax system is working correctly'
      });

    } catch (error) {
      log.error('Tax controller test failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Controller test failed',
        details: error.message
      });
    }
  }

  /**
   * Get tax rate for specific category
   */
  static async getTaxRate(req, res) {
    try {
      const { category, country = 'UG', date } = req.query;

      if (!category) {
        return res.status(400).json({
          success: false,
          message: 'Category is required'
        });
      }

      log.info('Getting tax rate', { category, country, date });

      const taxRate = await TaxService.getTaxRate(category, country, date);

      return res.status(200).json({
        success: true,
        data: taxRate,
        message: 'Tax rate retrieved successfully'
      });

    } catch (error) {
      log.error('Get tax rate controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve tax rate',
        error: error.message
      });
    }
  }

  /**
   * Get all tax rules
   */
  static async getTaxRules(req, res) {
    try {
      const { countryCode = 'UG' } = req.query;

      log.info('Getting tax rules', { countryCode });

      const taxRules = await TaxService.getTaxRules(countryCode);

      return res.status(200).json({
        success: true,
        data: taxRules,
        message: 'Tax rules retrieved successfully'
      });

    } catch (error) {
      log.error('Get tax rules controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve tax rules',
        error: error.message
      });
    }
  }
}

export default TaxController;
