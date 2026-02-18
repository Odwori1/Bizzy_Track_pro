// File: backend/app/services/supplierComplianceService.js
import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * SUPPLIER COMPLIANCE SERVICE
 * Handles TIN verification and supplier compliance tracking
 */
export class SupplierComplianceService {
  
  /**
   * Verify supplier TIN against URA database (mock)
   */
  static async verifySupplierTIN(supplierId, businessId, userId) {
    const client = await getClient();
    
    try {
      // Get supplier details
      const supplierResult = await client.query(
        `SELECT s.*, b.country_code 
         FROM suppliers s
         JOIN businesses b ON b.id = s.business_id
         WHERE s.id = $1 AND s.business_id = $2`,
        [supplierId, businessId]
      );
      
      if (supplierResult.rows.length === 0) {
        throw new Error('Supplier not found');
      }
      
      const supplier = supplierResult.rows[0];
      
      if (!supplier.tax_id) {
        throw new Error('Supplier has no tax ID');
      }
      
      // Mock URA verification
      const verificationResult = this.mockURAVerification(
        supplier.tax_id, 
        supplier.name
      );
      
      // Update supplier verification status
      await client.query(
        `UPDATE suppliers 
         SET tin_verified = $1,
             tin_verified_at = $2,
             tin_verification_status = $3,
             compliance_score = $4,
             last_compliance_check = NOW()
         WHERE id = $5`,
        [
          verificationResult.valid,
          verificationResult.valid ? new Date() : null,
          verificationResult.valid ? 'verified' : 'failed',
          verificationResult.valid ? 100 : 50,
          supplierId
        ]
      );
      
      // Log verification attempt
      await client.query(
        `INSERT INTO supplier_tin_verification_log 
         (id, business_id, supplier_id, tin, verification_request, 
          verification_response, verification_result, error_message, verified_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          uuidv4(),
          businessId,
          supplierId,
          supplier.tax_id,
          JSON.stringify({ tax_id: supplier.tax_id, name: supplier.name }),
          JSON.stringify(verificationResult),
          verificationResult.valid ? 'valid' : 'invalid',
          verificationResult.error,
          userId
        ]
      );
      
      return {
        success: true,
        supplierId,
        ...verificationResult
      };
      
    } catch (error) {
      log.error('Error verifying supplier TIN:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Mock URA TIN verification
   */
  static mockURAVerification(taxId, supplierName) {
    // TIN format: 9-12 digits for Uganda
    const isValidFormat = /^\d{9,12}$/.test(taxId);
    
    if (!isValidFormat) {
      return {
        valid: false,
        error: 'Invalid TIN format. Must be 9-12 digits.'
      };
    }
    
    // Mock successful verification (90% of attempts succeed)
    const success = Math.random() > 0.1;
    
    if (success) {
      return {
        valid: true,
        taxId: taxId,
        registeredName: supplierName,
        taxStatus: 'compliant',
        registrationDate: '2020-01-01'
      };
    } else {
      return {
        valid: false,
        error: 'TIN not found in URA database'
      };
    }
  }
  
  /**
   * Get supplier compliance status
   */
  static async getSupplierCompliance(supplierId, businessId) {
    try {
      const result = await getClient().then(client => 
        client.query(
          `SELECT s.id, s.name, s.tax_id, 
                  s.tin_verified, s.tin_verified_at, s.tin_verification_status,
                  s.compliance_score, s.risk_level, s.last_compliance_check
           FROM suppliers s
           WHERE s.id = $1 AND s.business_id = $2`,
          [supplierId, businessId]
        ).then(res => {
          client.release();
          return res;
        })
      );
      
      return result.rows[0] || null;
      
    } catch (error) {
      log.error('Error getting supplier compliance:', error);
      throw error;
    }
  }
  
  /**
   * Get compliance dashboard data
   */
  static async getComplianceDashboard(businessId) {
    try {
      const result = await getClient().then(client =>
        client.query(
          `SELECT 
            COUNT(*) as total_suppliers,
            COUNT(CASE WHEN tin_verified = true THEN 1 END) as verified_count,
            COUNT(CASE WHEN tin_verification_status = 'pending' THEN 1 END) as pending_count,
            COUNT(CASE WHEN tin_verification_status = 'failed' THEN 1 END) as failed_count,
            AVG(compliance_score) as avg_compliance_score,
            COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk_count,
            COUNT(CASE WHEN risk_level = 'medium' THEN 1 END) as medium_risk_count,
            COUNT(CASE WHEN risk_level = 'low' THEN 1 END) as low_risk_count
           FROM suppliers
           WHERE business_id = $1`,
          [businessId]
        ).then(res => {
          client.release();
          return res;
        })
      );
      
      return result.rows[0] || {
        total_suppliers: 0,
        verified_count: 0,
        pending_count: 0,
        failed_count: 0,
        avg_compliance_score: 0,
        high_risk_count: 0,
        medium_risk_count: 0,
        low_risk_count: 0
      };
      
    } catch (error) {
      log.error('Error getting compliance dashboard:', error);
      throw error;
    }
  }
  
  /**
   * Update supplier compliance score
   */
  static async updateComplianceScore(supplierId, businessId, score) {
    try {
      const result = await getClient().then(client =>
        client.query(
          `UPDATE suppliers 
           SET compliance_score = $1,
               last_compliance_check = NOW()
           WHERE id = $2 AND business_id = $3
           RETURNING id, name, compliance_score, risk_level`,
          [score, supplierId, businessId]
        ).then(res => {
          client.release();
          return res;
        })
      );
      
      return result.rows[0];
      
    } catch (error) {
      log.error('Error updating compliance score:', error);
      throw error;
    }
  }
}

export default SupplierComplianceService;
