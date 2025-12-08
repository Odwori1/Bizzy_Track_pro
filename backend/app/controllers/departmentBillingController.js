import { DepartmentBillingService } from '../services/departmentBillingService.js';
import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export const departmentBillingController = {
  async getDepartmentBilling(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      const billingData = await DepartmentBillingService.getDepartmentBilling(businessId, filters);

      res.json({
        success: true,
        data: billingData,
        message: 'Department billing fetched successfully'
      });

    } catch (error) {
      log.error('Department billing fetch controller error', error);
      next(error);
    }
  },

  async getConsolidatedBilling(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      const consolidatedBills = await DepartmentBillingService.getConsolidatedBilling(businessId, filters);

      res.json({
        success: true,
        data: consolidatedBills,
        message: 'Consolidated billing fetched successfully'
      });

    } catch (error) {
      log.error('Consolidated billing fetch controller error', error);
      next(error);
    }
  },

  async getBillingByDepartment(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { departmentId } = req.params;
      const filters = req.query;

      const departmentBilling = await DepartmentBillingService.getBillingByDepartment(
        businessId, 
        departmentId, 
        filters
      );

      res.json({
        success: true,
        data: departmentBilling,
        message: 'Department billing details fetched successfully'
      });

    } catch (error) {
      log.error('Department billing details fetch controller error', error);
      next(error);
    }
  },

  async generateConsolidatedBill(req, res, next) {
    try {
      const { job_id } = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Generating consolidated bill', {
        businessId,
        userId,
        jobId: job_id
      });

      const consolidatedBill = await DepartmentBillingService.generateConsolidatedBill(
        businessId,
        job_id,
        userId
      );

      res.json({
        success: true,
        message: 'Consolidated bill generated successfully',
        data: consolidatedBill
      });

    } catch (error) {
      log.error('Consolidated bill generation controller error', error);
      next(error);
    }
  },

  async allocateDepartmentCharge(req, res, next) {
    try {
      const chargeData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Allocating department charge', {
        businessId,
        userId,
        jobId: chargeData.job_id,
        departmentId: chargeData.department_id
      });

      const allocatedCharge = await DepartmentBillingService.allocateDepartmentCharge(
        businessId,
        chargeData,
        userId
      );

      res.json({
        success: true,
        message: 'Department charge allocated successfully',
        data: allocatedCharge
      });

    } catch (error) {
      log.error('Department charge allocation controller error', error);
      next(error);
    }
  },

  async allocateChargeToInvoice(req, res, next) {
    try {
      const { billingEntryId, invoiceId } = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Allocating billing entry to invoice', {
        businessId,
        userId,
        billingEntryId,
        invoiceId
      });

      const client = await getClient();

      try {
        await client.query('BEGIN');

        // Verify billing entry belongs to business
        const billingCheck = await client.query(
          'SELECT * FROM department_billing_entries WHERE id = $1 AND business_id = $2',
          [billingEntryId, businessId]
        );

        if (billingCheck.rows.length === 0) {
          throw new Error('Billing entry not found or access denied');
        }

        // Verify invoice belongs to business
        const invoiceCheck = await client.query(
          'SELECT * FROM invoices WHERE id = $1 AND business_id = $2',
          [invoiceId, businessId]
        );

        if (invoiceCheck.rows.length === 0) {
          throw new Error('Invoice not found or access denied');
        }

        // Update billing entry with invoice ID
        const result = await client.query(
          'UPDATE department_billing_entries SET invoice_id = $1 WHERE id = $2 RETURNING *',
          [invoiceId, billingEntryId]
        );

        const updatedEntry = result.rows[0];

        await auditLogger.logAction({
          businessId,
          userId,
          action: 'department-charge.invoice-allocated',
          resourceType: 'department-billing',
          resourceId: billingEntryId,
          oldValues: { invoice_id: null },
          newValues: { invoice_id: invoiceId }
        });

        await client.query('COMMIT');

        res.json({
          success: true,
          message: 'Billing entry allocated to invoice successfully',
          data: updatedEntry
        });

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      log.error('Billing entry allocation controller error', error);
      next(error);
    }
  }
};
