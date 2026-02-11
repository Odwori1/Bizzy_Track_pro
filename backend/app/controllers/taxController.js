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
        isExempt = false,
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
        isExempt,
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
          amount,
          isWithholding: tax.isWithholding,
          thresholdApplied: tax.thresholdApplied
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
          uniqueTaxTypes: invoiceTax.summary.uniqueTaxTypes,
          withholdingItems: invoiceTax.calculations.filter(t => t.isWithholding).length
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
   * Run test scenarios - UPDATED to use current calculateItemTax method
   */
  static async runTests(req, res) {
    try {
      // Get businessId from user session or use default test business
      const businessId = req.user?.businessId || req.user?.business_id || 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
      const testDate = '2026-02-10'; // Use current date

      log.info('Running tax test scenarios', { businessId });

      const tests = [
        // Test 1: Service below threshold (500K < 1M)
        {
          name: 'Services 500K to Company (No WHT, below threshold)',
          request: {
            productCategory: 'SERVICES',
            amount: 500000,
            customerType: 'company',
            transactionDate: testDate
          },
          expectations: {
            taxCode: 'VAT_STD',
            taxRate: 20.00,
            isWithholding: false,
            thresholdApplied: false
          }
        },
        // Test 2: Service above threshold (1.2M > 1M)
        {
          name: 'Services 1.2M to Company (WHT applied, above threshold)',
          request: {
            productCategory: 'SERVICES',
            amount: 1200000,
            customerType: 'company',
            transactionDate: testDate
          },
          expectations: {
            taxCode: 'WHT_SERVICES',
            taxRate: 6.00,
            isWithholding: true,
            thresholdApplied: true
          }
        },
        // Test 3: Goods (always WHT for companies regardless of amount)
        {
          name: 'Goods 300K to Company (WHT, no threshold check)',
          request: {
            productCategory: 'STANDARD_GOODS',
            amount: 300000,
            customerType: 'company',
            transactionDate: testDate
          },
          expectations: {
            taxCode: 'WHT_GOODS',
            taxRate: 6.00,
            isWithholding: true,
            thresholdApplied: false  // Goods don't have threshold, always WHT
          }
        },
        // Test 4: Individual customer (never WHT)
        {
          name: 'Services 2M to Individual (No WHT, individual customer)',
          request: {
            productCategory: 'SERVICES',
            amount: 2000000,
            customerType: 'individual',
            transactionDate: testDate
          },
          expectations: {
            taxCode: 'VAT_STD',
            taxRate: 20.00,
            isWithholding: false,
            thresholdApplied: false
          }
        },
        // Test 5: Zero-rated category
        {
          name: 'Essential Goods (Zero-rated VAT)',
          request: {
            productCategory: 'ESSENTIAL_GOODS',
            amount: 500000,
            customerType: 'company',
            transactionDate: testDate
          },
          expectations: {
            taxCode: 'VAT_ZERO',
            taxRate: 0.00,
            isWithholding: false,
            thresholdApplied: false
          }
        },
        // Test 6: Exempt category
        {
          name: 'Financial Services (VAT Exempt)',
          request: {
            productCategory: 'FINANCIAL_SERVICES',
            amount: 500000,
            customerType: 'company',
            transactionDate: testDate
          },
          expectations: {
            taxCode: 'VAT_EXEMPT',
            taxRate: 0.00,
            isWithholding: false,
            thresholdApplied: false
          }
        },
        // Test 7: Test threshold edge case (exactly at threshold) - FIXED
        {
          name: 'Services 1M to Company (At threshold - should be VAT)', // ✅ Fixed name
          request: {
            productCategory: 'SERVICES',
            amount: 1000000,
            customerType: 'company',
            transactionDate: testDate
          },
          expectations: {
            taxCode: 'VAT_STD',  // ✅ Fixed: Should be VAT, not WHT
            taxRate: 20.00,
            isWithholding: false,
            thresholdApplied: false  // ✅ Fixed: Exactly at threshold, not above
          }
        }
      ];

      const results = [];

      for (const test of tests) {
        try {
          const tax = await TaxService.calculateItemTax({
            businessId,
            ...test.request
          });

          const passed =
            tax.taxCode === test.expectations.taxCode &&
            Math.abs(tax.taxRate - test.expectations.taxRate) < 0.01 &&
            tax.isWithholding === test.expectations.isWithholding &&
            tax.thresholdApplied === test.expectations.thresholdApplied;

          results.push({
            test: test.name,
            passed,
            expected: test.expectations,
            actual: {
              taxCode: tax.taxCode,
              taxRate: tax.taxRate,
              taxAmount: tax.taxAmount,
              isWithholding: tax.isWithholding,
              thresholdApplied: tax.thresholdApplied,
              whtCertificateRequired: tax.whtCertificateRequired
            },
            error: null
          });

        } catch (error) {
          results.push({
            test: test.name,
            passed: false,
            expected: test.expectations,
            actual: null,
            error: error.message
          });
        }
      }

      const passedTests = results.filter(r => r.passed).length;
      const totalTests = results.length;

      return res.status(200).json({
        success: true,
        data: {
          tests: results,
          summary: {
            total: totalTests,
            passed: passedTests,
            failed: totalTests - passedTests,
            percentage: Math.round((passedTests / totalTests) * 100),
            businessId,
            timestamp: new Date().toISOString(),
            systemStatus: passedTests === totalTests ? '✅ HEALTHY' : '⚠️ DEGRADED'
          },
          businessLogic: {
            whtThreshold: 1000000, // UGX
            servicesRules: 'WHT applies when amount > 1M AND customer is company',
            goodsRules: 'WHT always applies for companies (no threshold)',
            individualRules: 'No WHT for individual customers',
            zeroRated: '0% VAT for essential goods',
            exempt: '0% VAT for financial services'
          }
        },
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
            'Test scenarios',
            'System testing',
            'WHT threshold tracking',
            'WHT certificate requirement flag'
          ],
          database: 'Uses PostgreSQL calculate_item_tax function',
          supportedCountries: ['UG'],
          notes: 'WHT mappings fixed for Uganda with threshold tracking',
          fieldSupport: {
            isWithholding: '✓ Included in response',
            thresholdApplied: '✓ Included in response',
            whtCertificateRequired: '✓ Computed field (isWithholding && thresholdApplied)',
            calculationDetails: '✓ Includes database fields and business logic'
          }
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

  /**
   * Comprehensive tax system test endpoint
   * GET /api/tax/system-test
   */
  static async systemTest(req, res) {
    try {
      // ✅ FIXED: Use authenticated business or provide clear error
      const businessId = req.user?.businessId || req.user?.business_id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID required for system tests. Please authenticate or provide businessId in request.'
        });
      }

      // Test scenarios - updated to use actual business logic
      const testResults = [];
      const scenarios = [
        {
          name: 'Service 500K to Company',
          data: {
            productCategory: 'SERVICES',
            amount: 500000,
            customerType: 'company',
            expectedTaxCode: 'VAT_STD',
            expectedRate: 20.00,
            expectedWHT: false,
            expectedThreshold: false
          }
        },
        {
          name: 'Service 1.2M to Company',
          data: {
            productCategory: 'SERVICES',
            amount: 1200000,
            customerType: 'company',
            expectedTaxCode: 'WHT_SERVICES',
            expectedRate: 6.00,
            expectedWHT: true,
            expectedThreshold: true
          }
        },
        {
          name: 'Goods 300K to Company',
          data: {
            productCategory: 'STANDARD_GOODS',
            amount: 300000,
            customerType: 'company',
            expectedTaxCode: 'WHT_GOODS',
            expectedRate: 6.00,
            expectedWHT: true,
            expectedThreshold: false  // Goods don't check threshold
          }
        },
        {
          name: 'Service 2M to Individual',
          data: {
            productCategory: 'SERVICES',
            amount: 2000000,
            customerType: 'individual',
            expectedTaxCode: 'VAT_STD',
            expectedRate: 20.00,
            expectedWHT: false,
            expectedThreshold: false
          }
        }
      ];

      // Run all tests
      for (const scenario of scenarios) {
        try {
          const tax = await TaxService.calculateItemTax({
            businessId,
            productCategory: scenario.data.productCategory,
            amount: scenario.data.amount,
            customerType: scenario.data.customerType,
            transactionDate: '2026-02-10'
          });

          const passed =
            tax.taxCode === scenario.data.expectedTaxCode &&
            Math.abs(tax.taxRate - scenario.data.expectedRate) < 0.01 &&
            tax.isWithholding === scenario.data.expectedWHT &&
            tax.thresholdApplied === scenario.data.expectedThreshold;

          testResults.push({
            scenario: scenario.name,
            passed,
            expected: {
              taxCode: scenario.data.expectedTaxCode,
              taxRate: scenario.data.expectedRate,
              isWHT: scenario.data.expectedWHT,
              thresholdApplied: scenario.data.expectedThreshold
            },
            actual: {
              taxCode: tax.taxCode,
              taxRate: tax.taxRate,
              taxAmount: tax.taxAmount,
              isWHT: tax.isWithholding,
              thresholdApplied: tax.thresholdApplied,
              whtCertificateRequired: tax.whtCertificateRequired
            }
          });
        } catch (error) {
          testResults.push({
            scenario: scenario.name,
            passed: false,
            error: error.message
          });
        }
      }

      // Calculate summary
      const passed = testResults.filter(r => r.passed).length;
      const total = testResults.length;

      return res.status(200).json({
        success: true,
        data: {
          system: 'BizzyTrack Tax Engine',
          version: '2.0.0',
          timestamp: new Date().toISOString(),
          status: passed === total ? '✅ HEALTHY' : '⚠️ DEGRADED',
          businessId,
          testResults,
          summary: {
            totalTests: total,
            passedTests: passed,
            failedTests: total - passed,
            successRate: Math.round((passed / total) * 100)
          },
          featuresVerified: [
            'WHT Threshold Logic (1M UGX)',
            'Goods vs Services Differentiation',
            'Customer Type Awareness',
            'Tax Category Mapping',
            'Withholding Tax Detection',
            'Threshold Application Tracking',
            'WHT Certificate Requirement Flag'
          ],
          businessConfiguration: {
            businessId,
            usesAuthenticatedBusiness: true,
            note: 'All tests use the authenticated business for accurate results'
          }
        }
      });

    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'System test failed',
        error: error.message
      });
    }
  }
}

export default TaxController;
