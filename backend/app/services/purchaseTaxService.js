// File: backend/app/services/purchaseTaxService.js
import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import TaxService from './taxService.js';

/**
 * PURCHASE TAX SERVICE
 * Handles input tax calculation, tax credits, and import duties
 */
export class PurchaseTaxService {

  /**
   * Calculate input tax on a purchase order
   */
  static async calculateInputTax(purchaseOrderId, businessId, userId) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get purchase order details
      const poResult = await client.query(
        `SELECT po.*, s.tax_id as supplier_tax_id, s.name as supplier_name,
                s.tin_verified, s.compliance_score,
                po.order_date as transaction_date
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
         WHERE po.id = $1 AND po.business_id = $2`,
        [purchaseOrderId, businessId]
      );
      
      if (poResult.rows.length === 0) {
        throw new Error('Purchase order not found');
      }
      
      const purchaseOrder = poResult.rows[0];
      
      // Get line items
      const itemsResult = await client.query(
        `SELECT * FROM purchase_order_items 
         WHERE purchase_order_id = $1`,
        [purchaseOrderId]
      );
      
      const lineItems = itemsResult.rows;
      
      // Calculate subtotal from line items
      const subtotal = lineItems.reduce((sum, item) => 
        sum + parseFloat(item.quantity) * parseFloat(item.unit_cost), 0
      );
      
      // Determine VAT rate (default 20%)
      let vatRate = 20.00;
      let vatAmount = 0;
      
      // Check if supplier is compliant for input VAT recovery
      const canClaimVAT = purchaseOrder.tin_verified && purchaseOrder.compliance_score >= 70;
      
      // Calculate VAT (standard rate for now)
      vatAmount = subtotal * (vatRate / 100);
      
      // Check if WHT applies (services to companies)
      let whtApplicable = false;
      let whtRate = 0;
      let whtAmount = 0;
      
      // Check line items for services that might have WHT
      for (const item of lineItems) {
        if (item.item_name?.toLowerCase().includes('service') || 
            item.item_name?.toLowerCase().includes('consult')) {
          whtApplicable = true;
          whtRate = 6.00;
          // Calculate WHT on the service portion only
          whtAmount += parseFloat(item.quantity) * parseFloat(item.unit_cost) * (whtRate / 100);
        }
      }
      
      // Update purchase order with tax calculations
      await client.query(
        `UPDATE purchase_orders 
         SET tax_amount = $1,
             tax_rate = $2,
             wht_applicable = $3,
             wht_rate = $4,
             wht_amount = $5,
             subtotal = $6,
             tax_calculation = $7::jsonb
         WHERE id = $8`,
        [
          vatAmount,
          vatRate,
          whtApplicable,
          whtRate,
          whtAmount,
          subtotal,
          JSON.stringify({
            calculation_date: new Date().toISOString(),
            line_items_count: lineItems.length,
            vat_rate: vatRate,
            wht_applicable: whtApplicable,
            can_claim_vat: canClaimVAT,
            line_items: lineItems.map(item => ({
              name: item.item_name,
              amount: item.quantity * item.unit_cost,
              wht_applied: item.item_name?.toLowerCase().includes('service') ? whtRate : 0
            }))
          }),
          purchaseOrderId
        ]
      );
      
      // Get VAT_STD tax_type_id
      const taxTypeResult = await client.query(
        `SELECT id FROM tax_types WHERE tax_code = 'VAT_STD'`
      );
      
      if (taxTypeResult.rows.length > 0) {
        // Record in transaction_taxes for audit with transaction_date
        await client.query(
          `INSERT INTO transaction_taxes 
           (id, business_id, transaction_id, transaction_type, tax_type_id, 
            taxable_amount, tax_rate, tax_amount, country_code, tax_period,
            transaction_date, calculation_context, customer_type, 
            calculation_version, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            uuidv4(),
            businessId,
            purchaseOrderId,
            'purchase',
            taxTypeResult.rows[0].id,
            subtotal,
            vatRate,
            vatAmount,
            'UG',
            new Date().toISOString().slice(0, 7) + '-01', // First day of current month
            purchaseOrder.order_date || new Date().toISOString().split('T')[0], // Use order_date or today
            JSON.stringify({ source: 'purchase_tax_service' }),
            'company',
            '1.0',
            userId
          ]
        );
        
        // Create tax credit record if VAT is claimable
        if (vatAmount > 0 && canClaimVAT) {
          await client.query(
            `INSERT INTO purchase_tax_credits 
             (id, business_id, purchase_order_id, supplier_id, credit_amount,
              tax_type_id, tax_period, expiry_date, status, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              uuidv4(),
              businessId,
              purchaseOrderId,
              purchaseOrder.supplier_id,
              vatAmount,
              taxTypeResult.rows[0].id,
              new Date().toISOString().slice(0, 7) + '-01',
              new Date(new Date().setFullYear(new Date().getFullYear() + 5)).toISOString().slice(0, 10), // 5 years
              'active',
              userId
            ]
          );
        }
      }
      
      // If WHT applies, record WHT transaction
      if (whtApplicable && whtAmount > 0) {
        const whtTaxTypeResult = await client.query(
          `SELECT id FROM tax_types WHERE tax_code = 'WHT_SERVICES'`
        );
        
        if (whtTaxTypeResult.rows.length > 0) {
          await client.query(
            `INSERT INTO transaction_taxes 
             (id, business_id, transaction_id, transaction_type, tax_type_id, 
              taxable_amount, tax_rate, tax_amount, country_code, tax_period,
              transaction_date, calculation_context, customer_type, 
              calculation_version, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            [
              uuidv4(),
              businessId,
              purchaseOrderId,
              'purchase_wht',
              whtTaxTypeResult.rows[0].id,
              whtAmount / (whtRate / 100), // Taxable amount (reverse calculate)
              whtRate,
              whtAmount,
              'UG',
              new Date().toISOString().slice(0, 7) + '-01',
              purchaseOrder.order_date || new Date().toISOString().split('T')[0],
              JSON.stringify({ source: 'purchase_tax_service', wht_type: 'services' }),
              'company',
              '1.0',
              userId
            ]
          );
        }
      }
      
      await client.query('COMMIT');
      
      return {
        success: true,
        purchase_order_id: purchaseOrderId,
        subtotal,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        wht_applicable: whtApplicable,
        wht_rate: whtRate,
        wht_amount: whtAmount,
        total_with_vat: subtotal + vatAmount,
        vat_claimable: canClaimVAT && vatAmount > 0
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error calculating input tax:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate import duty for international purchases
   */
  static async calculateImportDuty(params, businessId, userId) {
    const client = await getClient();

    try {
      const {
        purchaseOrderId,
        supplierId,
        hsCode,
        countryOfOrigin,
        customsValue,
        freightCharges = 0,
        insuranceCharges = 0,
        dutyRate,
        exciseDutyRate = 0,
        vatRate = 20.00
      } = params;

      // Calculate CIF value
      const cifValue = customsValue + freightCharges + insuranceCharges;

      // Calculate duties
      const dutyAmount = cifValue * (dutyRate / 100);
      const exciseDutyAmount = cifValue * (exciseDutyRate / 100);
      const vatAmount = (cifValue + dutyAmount + exciseDutyAmount) * (vatRate / 100);

      // Insert calculation record
      const result = await client.query(
        `INSERT INTO import_duty_calculations
         (id, business_id, purchase_order_id, supplier_id, hs_code, country_of_origin,
          customs_value, freight_charges, insurance_charges,
          duty_rate, duty_amount, excise_duty_rate, excise_duty_amount,
          vat_rate, vat_amount, calculation_date, calculated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING *`,
        [
          uuidv4(),
          businessId,
          purchaseOrderId,
          supplierId,
          hsCode,
          countryOfOrigin,
          customsValue,
          freightCharges,
          insuranceCharges,
          dutyRate,
          dutyAmount,
          exciseDutyRate,
          exciseDutyAmount,
          vatRate,
          vatAmount,
          new Date(),
          userId
        ]
      );

      return {
        success: true,
        calculation: result.rows[0],
        summary: {
          cif_value: cifValue,
          duty_amount: dutyAmount,
          excise_duty_amount: exciseDutyAmount,
          vat_amount: vatAmount,
          total_import_cost: cifValue + dutyAmount + exciseDutyAmount + vatAmount
        }
      };

    } catch (error) {
      log.error('Error calculating import duty:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate WHT certificate for supplier payment
   */
  static async generateWhtCertificate(paymentId, businessId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get payment details with purchase order
      const paymentResult = await client.query(
        `SELECT vp.*, po.wht_applicable, po.wht_rate, po.wht_amount,
                po.po_number, s.name as supplier_name, s.tax_id as supplier_tin
         FROM vendor_payments vp
         JOIN purchase_orders po ON po.id = vp.purchase_order_id
         JOIN suppliers s ON s.id = vp.supplier_id
         WHERE vp.id = $1 AND vp.business_id = $2`,
        [paymentId, businessId]
      );

      if (paymentResult.rows.length === 0) {
        throw new Error('Payment not found');
      }

      const payment = paymentResult.rows[0];

      if (!payment.wht_applicable) {
        throw new Error('WHT not applicable for this purchase');
      }

      // Check if certificate already exists
      const existingResult = await client.query(
        `SELECT id, certificate_number FROM purchase_wht_certificates
         WHERE payment_id = $1`,
        [paymentId]
      );

      if (existingResult.rows.length > 0) {
        await client.query('COMMIT');
        return {
          success: true,
          existing: true,
          certificate: existingResult.rows[0]
        };
      }

      // Get WHT_GOODS or WHT_SERVICES tax_type_id
      const taxTypeCode = payment.po_number?.includes('SVC') ? 'WHT_SERVICES' : 'WHT_GOODS';
      const taxTypeResult = await client.query(
        `SELECT id FROM tax_types WHERE tax_code = $1`,
        [taxTypeCode]
      );

      // Create certificate
      const certificateResult = await client.query(
        `INSERT INTO purchase_wht_certificates
         (id, business_id, purchase_order_id, supplier_id, payment_id,
          transaction_tax_id, payment_amount, wht_rate, wht_amount,
          transaction_date, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          uuidv4(),
          businessId,
          payment.purchase_order_id,
          payment.supplier_id,
          paymentId,
          null, // transaction_tax_id - would need to lookup
          payment.amount,
          payment.wht_rate,
          payment.wht_amount,
          payment.payment_date,
          'generated',
          userId
        ]
      );

      await client.query('COMMIT');

      return {
        success: true,
        existing: false,
        certificate: certificateResult.rows[0]
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error generating WHT certificate:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get tax credit summary
   */
  static async getTaxCreditSummary(businessId, supplierId = null) {
    try {
      let query = `
        SELECT
          COALESCE(SUM(credit_amount), 0) as total_credits,
          COALESCE(SUM(utilized_amount), 0) as total_utilized,
          COALESCE(SUM(remaining_amount), 0) as total_remaining,
          COUNT(*) as credit_count,
          COUNT(CASE WHEN expiry_date < CURRENT_DATE THEN 1 END) as expired_count,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
          COUNT(CASE WHEN status = 'partially_utilized' THEN 1 END) as partial_count,
          COUNT(CASE WHEN status = 'fully_utilized' THEN 1 END) as utilized_count
        FROM purchase_tax_credits
        WHERE business_id = $1
      `;

      const params = [businessId];

      if (supplierId) {
        query += ` AND supplier_id = $2`;
        params.push(supplierId);
      }

      const result = await getClient().then(client =>
        client.query(query, params).then(res => {
          client.release();
          return res;
        })
      );

      return result.rows[0];

    } catch (error) {
      log.error('Error getting tax credit summary:', error);
      throw error;
    }
  }

  /**
   * Utilize tax credit
   */
  static async utilizeTaxCredit(creditId, amount, businessId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get current credit
      const creditResult = await client.query(
        `SELECT * FROM purchase_tax_credits
         WHERE id = $1 AND business_id = $2 AND status IN ('active', 'partially_utilized')`,
        [creditId, businessId]
      );

      if (creditResult.rows.length === 0) {
        throw new Error('Tax credit not available');
      }

      const credit = creditResult.rows[0];

      if (amount > credit.remaining_amount) {
        throw new Error(`Cannot utilize ${amount}, only ${credit.remaining_amount} remaining`);
      }

      // Update utilized amount
      const newUtilized = credit.utilized_amount + amount;

      await client.query(
        `UPDATE purchase_tax_credits
         SET utilized_amount = $1
         WHERE id = $2`,
        [newUtilized, creditId]
      );

      await client.query('COMMIT');

      return {
        success: true,
        creditId,
        utilized: amount,
        remaining: credit.remaining_amount - amount
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error utilizing tax credit:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export default PurchaseTaxService;
