// File: backend/app/controllers/supplierComplianceController.js
import { SupplierComplianceService } from '../services/supplierComplianceService.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

/**
 * SUPPLIER COMPLIANCE CONTROLLER
 * API endpoints for supplier TIN verification and compliance tracking
 */
export class SupplierComplianceController {
  
  /**
   * Verify supplier TIN
   * POST /api/supplier-compliance/verify/:supplierId
   */
  static async verifySupplierTIN(req, res) {
    try {
      const { supplierId } = req.params;
      const businessId = req.user?.businessId || req.user?.business_id;
      const userId = req.user?.userId || req.user?.id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      if (!supplierId) {
        return res.status(400).json({
          success: false,
          message: 'Supplier ID is required'
        });
      }

      log.info('Verifying supplier TIN', {
        businessId,
        supplierId,
        userId
      });

      const result = await SupplierComplianceService.verifySupplierTIN(
        supplierId,
        businessId,
        userId
      );

      // Log audit trail
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'supplier.tin.verified',
        resourceType: 'supplier',
        resourceId: supplierId,
        newValues: {
          verified: result.valid,
          status: result.valid ? 'verified' : 'failed'
        }
      });

      return res.status(200).json({
        success: true,
        data: result,
        message: result.valid ? 'Supplier TIN verified successfully' : 'Supplier TIN verification failed'
      });

    } catch (error) {
      log.error('Supplier TIN verification controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify supplier TIN',
        error: error.message
      });
    }
  }

  /**
   * Get supplier compliance status
   * GET /api/supplier-compliance/:supplierId
   */
  static async getSupplierCompliance(req, res) {
    try {
      const { supplierId } = req.params;
      const businessId = req.user?.businessId || req.user?.business_id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      const compliance = await SupplierComplianceService.getSupplierCompliance(
        supplierId,
        businessId
      );

      if (!compliance) {
        return res.status(404).json({
          success: false,
          message: 'Supplier not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: compliance
      });

    } catch (error) {
      log.error('Get supplier compliance controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get supplier compliance',
        error: error.message
      });
    }
  }

  /**
   * Get compliance dashboard
   * GET /api/supplier-compliance/dashboard
   */
  static async getComplianceDashboard(req, res) {
    try {
      const businessId = req.user?.businessId || req.user?.business_id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      const dashboard = await SupplierComplianceService.getComplianceDashboard(businessId);

      return res.status(200).json({
        success: true,
        data: dashboard
      });

    } catch (error) {
      log.error('Get compliance dashboard controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get compliance dashboard',
        error: error.message
      });
    }
  }

  /**
   * Update supplier compliance score
   * PUT /api/supplier-compliance/:supplierId/score
   */
  static async updateComplianceScore(req, res) {
    try {
      const { supplierId } = req.params;
      const { score } = req.body;
      const businessId = req.user?.businessId || req.user?.business_id;
      const userId = req.user?.userId || req.user?.id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      if (!score || score < 0 || score > 100) {
        return res.status(400).json({
          success: false,
          message: 'Valid score between 0-100 is required'
        });
      }

      const result = await SupplierComplianceService.updateComplianceScore(
        supplierId,
        businessId,
        score
      );

      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Supplier not found'
        });
      }

      // Log audit trail
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'supplier.compliance_score.updated',
        resourceType: 'supplier',
        resourceId: supplierId,
        newValues: { compliance_score: score }
      });

      return res.status(200).json({
        success: true,
        data: result,
        message: 'Compliance score updated successfully'
      });

    } catch (error) {
      log.error('Update compliance score controller error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update compliance score',
        error: error.message
      });
    }
  }

  /**
   * Test controller endpoint
   * GET /api/supplier-compliance/test
   */
  static async testController(req, res) {
    try {
      const businessId = req.user?.businessId || req.user?.business_id;

      return res.status(200).json({
        success: true,
        data: {
          businessId,
          timestamp: new Date().toISOString(),
          status: 'Supplier compliance controller is operational',
          features: [
            'Supplier TIN verification',
            'Compliance status lookup',
            'Compliance dashboard',
            'Compliance score updates'
          ]
        },
        message: 'Supplier compliance system is working correctly'
      });

    } catch (error) {
      log.error('Supplier compliance controller test failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Controller test failed',
        details: error.message
      });
    }
  }
}

export default SupplierComplianceController;
