// File: backend/app/services/taxService.js
import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';

/**
 * TAX SERVICE - Core tax calculation logic
 * Uses the verified PostgreSQL calculate_item_tax function
 */
export class TaxService {
  /**
   * Calculate tax for a single line item
   */
  static async calculateItemTax(params) {
    const client = await getClient();

    const {
      businessId,
      countryCode = 'UG',
      productCategory,
      amount,
      transactionType = 'sale',
      customerType = 'company',
      isExport = false,
      transactionDate = new Date().toISOString().split('T')[0]
    } = params;

    try {
      // FIXED: Don't specify column definitions for functions with OUT parameters
      const query = `
        SELECT * FROM calculate_item_tax(
          $1, $2, $3, $4, $5, $6, $7, $8
        );
      `;

      const values = [
        businessId,
        countryCode,
        productCategory,
        parseFloat(amount),
        transactionType,
        customerType,
        isExport,
        transactionDate
      ];

      log.debug('Calculating tax for item', {
        businessId,
        productCategory,
        amount
      });

      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('No tax result returned from database');
      }

      const tax = result.rows[0];

      return {
        taxId: tax.tax_id,
        taxCode: tax.tax_type_code,
        taxName: tax.tax_type_name,
        taxRate: parseFloat(tax.tax_rate),
        taxableAmount: parseFloat(tax.taxable_amount),
        taxAmount: parseFloat(tax.tax_amount),
        isExempt: tax.is_exempt,
        isZeroRated: tax.is_zero_rated,
        ledgerAccount: tax.ledger_account,
        calculationDetails: {
          countryCode,
          productCategory,
          transactionType,
          transactionDate,
          amount: parseFloat(amount),
          customerType,
          isExport
        }
      };

    } catch (error) {
      log.error('Tax calculation error:', error);
      throw new Error(`Tax calculation failed: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Calculate tax for multiple line items (invoice)
   */
  static async calculateInvoiceTax(lineItems, businessId, countryCode = 'UG') {
    const calculations = [];
    let totalTaxableAmount = 0;
    let totalTaxAmount = 0;
    const taxBreakdown = {};

    log.info('Calculating invoice tax', {
      businessId,
      lineItemCount: lineItems.length
    });

    for (const [index, item] of lineItems.entries()) {
      try {
        const tax = await this.calculateItemTax({
          businessId,
          countryCode,
          productCategory: item.productCategory,
          amount: item.amount,
          transactionType: item.transactionType || 'sale',
          customerType: item.customerType || 'company',
          isExport: item.isExport || false,
          transactionDate: item.transactionDate
        });

        calculations.push(tax);
        totalTaxableAmount += tax.taxableAmount;
        totalTaxAmount += tax.taxAmount;

        // Group by tax code
        if (!taxBreakdown[tax.taxCode]) {
          taxBreakdown[tax.taxCode] = {
            taxCode: tax.taxCode,
            taxName: tax.taxName,
            taxRate: tax.taxRate,
            totalAmount: 0,
            items: []
          };
        }

        taxBreakdown[tax.taxCode].totalAmount += tax.taxAmount;
        taxBreakdown[tax.taxCode].items.push({
          taxableAmount: tax.taxableAmount,
          taxAmount: tax.taxAmount,
          productCategory: item.productCategory
        });

      } catch (error) {
        log.error(`Failed to calculate tax for line item ${index + 1}:`, error);
        throw new Error(`Line item ${index + 1}: ${error.message}`);
      }
    }

    return {
      calculations,
      totals: {
        totalTaxableAmount,
        totalTaxAmount
      },
      taxBreakdown: Object.values(taxBreakdown),
      summary: {
        lineItemCount: lineItems.length,
        uniqueTaxTypes: Object.keys(taxBreakdown).length,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Get available tax categories for a country
   */
  static async getTaxCategories(countryCode = 'UG') {
    const client = await getClient();

    try {
      const query = `
        SELECT
          pc.category_code,
          pc.category_name,
          pc.global_treatment,
          pc.description,
          pc.is_active,
          COALESCE(
            json_agg(
              json_build_object(
                'taxCode', tt.tax_code,
                'taxName', tt.tax_name,
                'priority', ctm.priority,
                'isActive', ctm.is_active
              )
            ) FILTER (WHERE tt.id IS NOT NULL),
            '[]'::json
          ) as tax_mappings
        FROM product_tax_categories pc
        LEFT JOIN country_product_tax_mappings ctm
          ON pc.category_code = ctm.product_category_code
          AND ctm.country_code = $1
        LEFT JOIN tax_types tt ON ctm.tax_type_id = tt.id
        WHERE pc.is_active = true
        GROUP BY pc.category_code, pc.category_name, pc.global_treatment, pc.description, pc.is_active
        ORDER BY pc.category_code;
      `;

      const result = await client.query(query, [countryCode]);
      return result.rows;

    } catch (error) {
      log.error('Error fetching tax categories:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get tax configuration for a country
   */
  static async getTaxConfiguration(countryCode = 'UG') {
    const client = await getClient();

    try {
      // Get tax rates
      const ratesQuery = await client.query(`
        SELECT
          tt.tax_code,
          tt.tax_name,
          tt.description,
          tt.tax_category,
          tt.is_recoverable,
          ctr.tax_rate,
          ctr.effective_from,
          ctr.effective_to,
          ctr.is_default,
          ctr.notes
        FROM country_tax_rates ctr
        JOIN tax_types tt ON ctr.tax_type_id = tt.id
        WHERE ctr.country_code = $1
        ORDER BY tt.tax_code, ctr.effective_from
      `, [countryCode]);

      // Get categories
      const categories = await this.getTaxCategories(countryCode);

      return {
        countryCode,
        taxRates: ratesQuery.rows,
        taxCategories: categories,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      log.error('Error fetching tax configuration:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run test scenarios to verify tax system
   */
  static async runTestScenarios(businessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256') {
    const tests = [];

    try {
      // Test 1: VAT calculations
      const vatTests = [
        { date: '2024-06-15', expectedRate: 18.00, description: 'June 2024 (18% VAT)' },
        { date: '2024-08-15', expectedRate: 20.00, description: 'August 2024 (20% VAT)' }
      ];

      for (const test of vatTests) {
        try {
          const result = await this.calculateItemTax({
            businessId,
            productCategory: 'STANDARD_GOODS',
            amount: 1000000,
            transactionType: 'sale',
            transactionDate: test.date
          });

          tests.push({
            test: test.description,
            expected: test.expectedRate,
            actual: result.taxRate,
            passed: result.taxRate === test.expectedRate,
            error: null
          });
        } catch (error) {
          tests.push({
            test: test.description,
            expected: test.expectedRate,
            actual: null,
            passed: false,
            error: error.message
          });
        }
      }

      // Test 2: Exempt/Zero-rated
      const exemptTests = [
        { category: 'FINANCIAL_SERVICES', field: 'isExempt', expected: true, description: 'Financial Services (Exempt)' },
        { category: 'ESSENTIAL_GOODS', field: 'isZeroRated', expected: true, description: 'Essential Goods (Zero-rated)' }
      ];

      for (const test of exemptTests) {
        try {
          const result = await this.calculateItemTax({
            businessId,
            productCategory: test.category,
            amount: 500000,
            transactionType: 'sale'
          });

          tests.push({
            test: test.description,
            expected: test.expected,
            actual: result[test.field],
            passed: result[test.field] === test.expected,
            error: null
          });
        } catch (error) {
          tests.push({
            test: test.description,
            expected: test.expected,
            actual: null,
            passed: false,
            error: error.message
          });
        }
      }

      // Test 3: WHT calculation
      try {
        const whtResult = await this.calculateItemTax({
          businessId,
          productCategory: 'SERVICES',
          amount: 1000000,
          transactionType: 'sale'
        });

        tests.push({
          test: 'Services WHT (6%)',
          expected: 6.00,
          actual: whtResult.taxRate,
          passed: whtResult.taxRate === 6.00,
          error: null
        });
      } catch (error) {
        tests.push({
          test: 'Services WHT (6%)',
          expected: 6.00,
          actual: null,
          passed: false,
          error: error.message
        });
      }

      return {
        tests,
        summary: {
          total: tests.length,
          passed: tests.filter(t => t.passed).length,
          failed: tests.filter(t => !t.passed && !t.error).length,
          errors: tests.filter(t => t.error).length
        },
        timestamp: new Date().toISOString(),
        businessId
      };

    } catch (error) {
      log.error('Tax test scenarios error:', error);
      throw error;
    }
  }

  /**
   * Get tax rate for specific category and country
   */
  static async getTaxRate(productCategory, countryCode = 'UG', date = new Date().toISOString().split('T')[0]) {
    const client = await getClient();
    
    try {
      // Use a test business ID since function requires it
      const testBusinessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
      
      const query = `
        SELECT * FROM calculate_item_tax(
          $1, $2, $3, 100.00, 'sale', 'company', false, $4
        );
      `;

      const values = [
        testBusinessId,
        countryCode,
        productCategory,
        date
      ];

      const result = await client.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('No tax rate found');
      }

      const tax = result.rows[0];
      
      return {
        productCategory,
        countryCode,
        date,
        taxCode: tax.tax_type_code,
        taxName: tax.tax_type_name,
        taxRate: parseFloat(tax.tax_rate),
        isExempt: tax.is_exempt,
        isZeroRated: tax.is_zero_rated
      };

    } catch (error) {
      log.error('Error getting tax rate:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all tax rules (from country_product_tax_mappings)
   */
  static async getTaxRules(countryCode = 'UG') {
    const client = await getClient();
    
    try {
      const query = `
        SELECT 
          ctm.id,
          ctm.country_code,
          ctm.product_category_code,
          pc.category_name,
          pc.global_treatment,
          tt.tax_code,
          tt.tax_name,
          ctm.conditions,
          ctm.priority,
          ctm.is_active,
          ctm.created_at,
          ctm.updated_at
        FROM country_product_tax_mappings ctm
        JOIN product_tax_categories pc ON ctm.product_category_code = pc.category_code
        JOIN tax_types tt ON ctm.tax_type_id = tt.id
        WHERE ctm.country_code = $1
        ORDER BY ctm.product_category_code, ctm.priority;
      `;

      const result = await client.query(query, [countryCode]);
      return result.rows;

    } catch (error) {
      log.error('Error fetching tax rules:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export default TaxService;
