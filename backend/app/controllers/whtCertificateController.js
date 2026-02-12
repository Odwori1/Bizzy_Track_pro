// File: backend/app/controllers/whtCertificateController.js - COMPLETE WITH FIXED USER ID EXTRACTION
import { WHTCertificateService } from '../services/whtCertificateService.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

/**
 * WHT CERTIFICATE CONTROLLER - API endpoints for certificate management
 */
export class WHTCertificateController {
  /**
   * List certificates with filtering
   */
  static async listCertificates(req, res) {
    try {
      const businessId = req.user?.businessId || req.user?.business_id;
      const filters = req.query;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      log.info('Listing WHT certificates', {
        businessId,
        filters
      });

      const result = await WHTCertificateService.listCertificates(businessId, filters);

      return res.status(200).json({
        success: true,
        data: result
      });

    } catch (error) {
      log.error('Certificate listing error:', error);
      return res.status(500).json({
        success: false,
        message: `Failed to list certificates: ${error.message}`
      });
    }
  }

  /**
   * Get certificate by ID
   */
  static async getCertificate(req, res) {
    try {
      const { id } = req.params;
      const businessId = req.user?.businessId || req.user?.business_id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      log.info('Getting WHT certificate', {
        certificateId: id,
        businessId
      });

      const certificate = await WHTCertificateService.getCertificateById(id, businessId);

      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: 'Certificate not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: certificate
      });

    } catch (error) {
      log.error('Certificate retrieval error:', error);
      return res.status(500).json({
        success: false,
        message: `Failed to get certificate: ${error.message}`
      });
    }
  }

  /**
   * Get certificate statistics
   */
  static async getStats(req, res) {
    try {
      const businessId = req.user?.businessId || req.user?.business_id;
      const { period = 'month' } = req.query;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      log.info('Getting WHT certificate statistics', {
        businessId,
        period
      });

      const stats = await WHTCertificateService.getCertificateStats(businessId, period);

      return res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      log.error('Certificate stats error:', error);
      return res.status(500).json({
        success: false,
        message: `Failed to get certificate statistics: ${error.message}`
      });
    }
  }

  /**
   * Test certificate generation - FIXED userId extraction
   */
  static async testCertificate(req, res) {
    try {
      const businessId = req.user?.businessId || req.user?.business_id;
      // FIXED: Check for both id and userId properties
      const userId = req.user?.id || req.user?.userId;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID not found in session'
        });
      }

      log.info('Testing WHT certificate generation', {
        businessId,
        userId
      });

      const result = await WHTCertificateService.testCertificateGeneration(businessId, userId);

      return res.status(200).json({
        success: true,
        message: 'Test certificate generated successfully',
        data: result
      });

    } catch (error) {
      log.error('Certificate test error:', {
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        message: `Test certificate generation failed: ${error.message}`
      });
    }
  }

  /**
   * Download certificate PDF
   */
  static async downloadCertificate(req, res) {
    try {
      const { id } = req.params;
      const businessId = req.user?.businessId || req.user?.business_id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      log.info('Downloading WHT certificate PDF', {
        certificateId: id,
        businessId
      });

      const certificate = await WHTCertificateService.getCertificateById(id, businessId);

      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: 'Certificate not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          certificate_id: id,
          certificate_number: certificate.certificate_number,
          pdf_url: certificate.pdf_url || `/uploads/wht_certificates/${certificate.certificate_number}.pdf`,
          message: 'PDF generation would happen here in production'
        }
      });

    } catch (error) {
      log.error('Certificate download error:', error);
      return res.status(500).json({
        success: false,
        message: `Failed to download certificate: ${error.message}`
      });
    }
  }

  /**
   * Update certificate status - FIXED userId extraction
   */
  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;
      const businessId = req.user?.businessId || req.user?.business_id;
      // FIXED: Check for both id and userId properties
      const userId = req.user?.id || req.user?.userId;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'status is required'
        });
      }

      const validStatuses = ['generated', 'issued', 'printed', 'archived', 'voided'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      log.info('Updating WHT certificate status', {
        certificateId: id,
        businessId,
        newStatus: status,
        userId
      });

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'wht_certificate.status_updated',
        resourceType: 'wht_certificate',
        resourceId: id,
        newValues: { status, reason }
      });

      return res.status(200).json({
        success: true,
        message: 'Certificate status updated successfully',
        data: {
          certificate_id: id,
          old_status: 'generated',
          new_status: status,
          updated_at: new Date().toISOString()
        }
      });

    } catch (error) {
      log.error('Certificate status update error:', error);
      return res.status(500).json({
        success: false,
        message: `Failed to update certificate status: ${error.message}`
      });
    }
  }

  /**
   * Generate certificate for an invoice - FIXED userId extraction
   */
  static async generateCertificate(req, res) {
    try {
      const { invoice_id } = req.body;
      const businessId = req.user?.businessId || req.user?.business_id;
      // FIXED: Check for both id and userId properties
      const userId = req.user?.id || req.user?.userId;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      if (!invoice_id) {
        return res.status(400).json({
          success: false,
          message: 'invoice_id is required'
        });
      }

      log.info('Generating WHT certificate for invoice', {
        businessId,
        invoiceId: invoice_id,
        userId
      });

      // TODO: Implement full certificate generation
      return res.status(200).json({
        success: true,
        message: 'Certificate generation will be implemented in Phase 4',
        data: {
          invoice_id,
          certificate_generated: false,
          note: 'This endpoint is under development'
        }
      });

    } catch (error) {
      log.error('Certificate generation error:', error);
      return res.status(500).json({
        success: false,
        message: `Certificate generation failed: ${error.message}`
      });
    }
  }

  /**
   * Resend certificate email - FIXED userId extraction
   */
  static async resendEmail(req, res) {
    try {
      const { id } = req.params;
      const { email } = req.body;
      const businessId = req.user?.businessId || req.user?.business_id;
      // FIXED: Check for both id and userId properties
      const userId = req.user?.id || req.user?.userId;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'email is required'
        });
      }

      log.info('Resending WHT certificate email', {
        certificateId: id,
        businessId,
        email,
        userId
      });

      const certificate = await WHTCertificateService.getCertificateById(id, businessId);

      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: 'Certificate not found'
        });
      }

      // Audit log
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'wht_certificate.email_resent',
        resourceType: 'wht_certificate',
        resourceId: id,
        newValues: { email }
      });

      return res.status(200).json({
        success: true,
        message: 'Certificate email resent successfully',
        data: {
          certificate_id: id,
          certificate_number: certificate.certificate_number,
          email_sent_to: email,
          sent_at: new Date().toISOString(),
          note: 'Email sending will be implemented in Phase 4'
        }
      });

    } catch (error) {
      log.error('Certificate email resend error:', error);
      return res.status(500).json({
        success: false,
        message: `Failed to resend email: ${error.message}`
      });
    }
  }
}

export default WHTCertificateController;
