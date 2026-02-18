// File: backend/app/controllers/purchaseTaxController.js
import { PurchaseTaxService } from '../services/purchaseTaxService.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

/**
 * PURCHASE TAX CONTROLLER
 * API endpoints for purchase tax calculations and credits
 */
export class PurchaseTaxController {
  
  /**
   * Calculate input tax for a purchase order
   * POST /api/purchase-tax/calculate/:purchaseOrderId
   */
  static async calculateInputTax(req, res) {
    try {
      const { purchaseOrderId } = req.params;
      const businessId = req.user?.businessId || req.user?.business_id;
      const userId = req.user?.userId || req.user?.id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      if (!purchaseOrderId) {
        return res.status(400).json({
          success: false,
          message: 'Purchase order ID is required'
        });
      }

      log.info('Calculating input tax', {
        businessId,
        purchaseOrderId,
        userId
      });

      const result = await PurchaseTaxService.calculateInputTax(
        purchaseOrderId,
        businessId,
        userId
      );

      // Log audit trail
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'purchase.tax.calculated',
        resourceType: 'purchase_order',
        resourceId: purchaseOrderId,
        newValues: {
          vat_amount: result.vat_amount,
          wht_amount: result.wht_amount,
          vat_claimable: result.vat_claimable
        }
      });

      return res.status(200).json({
        success: true,
        data: result,
        message: 'Input tax calculated successfully'
      });

    } catch (error) {
      log.error('Calculate input tax controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to calculate input tax',
        error: error.message
      });
    }
  }

  /**
   * Calculate import duty
   * POST /api/purchase-tax/import-duty
   */
  static async calculateImportDuty(req, res) {
    try {
      const businessId = req.user?.businessId || req.user?.business_id;
      const userId = req.user?.userId || req.user?.id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      const {
        purchaseOrderId,
        supplierId,
        hsCode,
        countryOfOrigin,
        customsValue,
        freightCharges,
        insuranceCharges,
        dutyRate,
        exciseDutyRate,
        vatRate
      } = req.body;

      // Validate required fields
      if (!purchaseOrderId || !supplierId || !customsValue || !dutyRate) {
        return res.status(400).json({
          success: false,
          message: 'purchaseOrderId, supplierId, customsValue, and dutyRate are required'
        });
      }

      const result = await PurchaseTaxService.calculateImportDuty(
        {
          purchaseOrderId,
          supplierId,
          hsCode,
          countryOfOrigin,
          customsValue,
          freightCharges,
          insuranceCharges,
          dutyRate,
          exciseDutyRate,
          vatRate
        },
        businessId,
        userId
      );

      // Log audit trail
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'import.duty.calculated',
        resourceType: 'purchase_order',
        resourceId: purchaseOrderId,
        newValues: {
          customs_value: customsValue,
          total_duty: result.summary.duty_amount + result.summary.excise_duty_amount,
          vat_amount: result.summary.vat_amount
        }
      });

      return res.status(200).json({
        success: true,
        data: result,
        message: 'Import duty calculated successfully'
      });

    } catch (error) {
      log.error('Calculate import duty controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to calculate import duty',
        error: error.message
      });
    }
  }

  /**
   * Generate WHT certificate for a payment
   * POST /api/purchase-tax/generate-wht/:paymentId
   */
  static async generateWhtCertificate(req, res) {
    try {
      const { paymentId } = req.params;
      const businessId = req.user?.businessId || req.user?.business_id;
      const userId = req.user?.userId || req.user?.id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      if (!paymentId) {
        return res.status(400).json({
          success: false,
          message: 'Payment ID is required'
        });
      }

      const result = await PurchaseTaxService.generateWhtCertificate(
        paymentId,
        businessId,
        userId
      );

      // Log audit trail
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'purchase.wht_certificate.generated',
        resourceType: 'purchase_wht_certificate',
        resourceId: result.certificate?.id,
        newValues: {
          certificate_number: result.certificate?.certificate_number,
          wht_amount: result.certificate?.wht_amount,
          existing: result.existing
        }
      });

      return res.status(200).json({
        success: true,
        data: result,
        message: result.existing ? 'WHT certificate already exists' : 'WHT certificate generated successfully'
      });

    } catch (error) {
      log.error('Generate WHT certificate controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate WHT certificate',
        error: error.message
      });
    }
  }

  /**
   * Get tax credit summary
   * GET /api/purchase-tax/credits
   */
  static async getTaxCreditSummary(req, res) {
    try {
      const businessId = req.user?.businessId || req.user?.business_id;
      const { supplierId } = req.query;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      const summary = await PurchaseTaxService.getTaxCreditSummary(businessId, supplierId);

      return res.status(200).json({
        success: true,
        data: summary
      });

    } catch (error) {
      log.error('Get tax credit summary controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get tax credit summary',
        error: error.message
      });
    }
  }

  /**
   * Utilize a tax credit
   * POST /api/purchase-tax/credits/:creditId/utilize
   */
  static async utilizeTaxCredit(req, res) {
    try {
      const { creditId } = req.params;
      const { amount } = req.body;
      const businessId = req.user?.businessId || req.user?.business_id;
      const userId = req.user?.userId || req.user?.id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      if (!creditId) {
        return res.status(400).json({
          success: false,
          message: 'Credit ID is required'
        });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid amount greater than 0 is required'
        });
      }

      const result = await PurchaseTaxService.utilizeTaxCredit(
        creditId,
        amount,
        businessId
      );

      // Log audit trail
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'tax_credit.utilized',
        resourceType: 'purchase_tax_credit',
        resourceId: creditId,
        newValues: {
          utilized_amount: amount,
          remaining: result.remaining
        }
      });

      return res.status(200).json({
        success: true,
        data: result,
        message: 'Tax credit utilized successfully'
      });

    } catch (error) {
      log.error('Utilize tax credit controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to utilize tax credit',
        error: error.message
      });
    }
  }

  /**
   * Test controller endpoint
   * GET /api/purchase-tax/test
   */
  static async testController(req, res) {
    try {
      const businessId = req.user?.businessId || req.user?.business_id;

      return res.status(200).json({
        success: true,
        data: {
          businessId,
          timestamp: new Date().toISOString(),
          status: 'Purchase tax controller is operational',
          features: [
            'Input tax calculation',
            'Import duty calculation',
            'WHT certificate generation',
            'Tax credit tracking',
            'Credit utilization'
          ],
          database: 'Phase 7 tables: purchase_tax_credits, import_duty_calculations, purchase_wht_certificates'
        },
        message: 'Purchase tax system is working correctly'
      });

    } catch (error) {
      log.error('Purchase tax controller test failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Controller test failed',
        details: error.message
      });
    }
  }
}

export default PurchaseTaxController;
