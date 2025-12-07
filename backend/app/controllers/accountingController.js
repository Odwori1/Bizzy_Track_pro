// File: backend/app/controllers/accountingController.js
import { AccountingService } from '../services/accountingService.js';
import { InventoryAccountingService } from '../services/inventoryAccountingService.js';
import { InventorySyncService } from '../services/inventorySyncService.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

/**
 * ACCOUNTING CONTROLLER
 * UPDATED TO WORK WITH ACCOUNTING VALIDATION MIDDLEWARE
 */
export class AccountingController {
  /**
   * Get all journal entries with filters
   */
  static async getJournalEntries(req, res) {
    try {
      // Get business_id from user (handle both camelCase and snake_case)
      const business_id = req.user.businessId || req.user.business_id;
      if (!business_id) {
        return res.status(400).json({
          success: false,
          error: 'Business ID not found in user session'
        });
      }

      const {
        start_date,
        end_date,
        account_code,
        reference_type,
        status,
        page = 1,
        limit = 10
      } = req.query; // Direct from query, not validatedData

      const result = await AccountingService.getJournalEntries(business_id, {
        start_date,
        end_date,
        account_code,
        reference_type,
        status,
        page: parseInt(page),
        limit: parseInt(limit)
      });

      return res.status(200).json({
        success: true,
        data: result,
        message: 'Journal entries retrieved successfully'
      });

    } catch (error) {
      log.error('Error getting journal entries:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve journal entries',
        details: error.message
      });
    }
  }

  /**
   * Create a manual journal entry
   */
  static async createJournalEntry(req, res) {
    try {
      // Get business_id and userId from user (handle both formats)
      const business_id = req.user.businessId || req.user.business_id;
      const userId = req.user.userId || req.user.id;

      if (!business_id || !userId) {
        return res.status(400).json({
          success: false,
          error: 'Business ID or User ID not found in user session'
        });
      }

      const entryData = req.body;

      log.info('Creating manual journal entry', {
        business_id,
        userId,
        description: entryData.description
      });

      // Add business_id to entry data
      const completeEntryData = {
        ...entryData,
        business_id
      };

      // Create journal entry using corrected service
      const result = await AccountingService.createJournalEntry(
        completeEntryData,
        userId
      );

      // Log the audit trail
      await auditLogger.logAction({
        businessId: business_id,
        userId,
        action: 'accounting.manual_journal_entry.created',
        resourceType: 'journal_entry',
        resourceId: result.journal_entry.id,
        newValues: {
          description: result.journal_entry.description,
          total_amount: result.journal_entry.total_amount,
          line_count: result.lines.length,
          reference_number: result.journal_entry.reference_number
        }
      });

      log.info('Manual journal entry created successfully', {
        journal_entry_id: result.journal_entry.id,
        reference_number: result.journal_entry.reference_number
      });

      return res.status(201).json({
        success: true,
        data: result,
        message: 'Journal entry created successfully'
      });

    } catch (error) {
      log.error('Error creating journal entry:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create journal entry',
        details: error.message
      });
    }
  }

  /**
   * Get trial balance report - UPDATED to use validated data
   */
  static async getTrialBalance(req, res) {
    try {
      // Get business_id from user
      const business_id = req.user.businessId || req.user.business_id;
      if (!business_id) {
        return res.status(400).json({
          success: false,
          error: 'Business ID not found in user session'
        });
      }

      // Use validated data OR query params
      const { start_date, end_date } = req.validatedData || req.query;

      const startDate = start_date ? new Date(start_date) : null;
      const endDate = end_date ? new Date(end_date) : null;

      const trialBalance = await AccountingService.getTrialBalance(
        business_id,
        startDate,
        endDate
      );

      return res.status(200).json({
        success: true,
        data: trialBalance,
        message: 'Trial balance retrieved successfully'
      });

    } catch (error) {
      log.error('Error getting trial balance:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve trial balance',
        details: error.message
      });
    }
  }

  /**
   * Get general ledger for specific account - UPDATED to use validated data
   */
  static async getGeneralLedger(req, res) {
    try {
      // Get business_id from user (handle both formats)
      const business_id = req.user.businessId || req.user.business_id;
      if (!business_id) {
        return res.status(400).json({
          success: false,
          error: 'Business ID not found in user session'
        });
      }

      // Use validated data from middleware (combines params and query)
      const { account_code, start_date, end_date } = req.validatedData || {
        ...req.params,
        ...req.query
      };

      log.info('Getting general ledger', {
        business_id,
        account_code,
        start_date,
        end_date
      });

      const startDate = start_date ? new Date(start_date) : null;
      const endDate = end_date ? new Date(end_date) : null;

      const generalLedger = await AccountingService.getGeneralLedger(
        business_id,
        account_code,
        startDate,
        endDate
      );

      return res.status(200).json({
        success: true,
        data: generalLedger,
        message: 'General ledger retrieved successfully'
      });

    } catch (error) {
      log.error('Error getting general ledger:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve general ledger',
        details: error.message
      });
    }
  }

  /**
   * Get inventory valuation report - UPDATED to use validated data
   */
  static async getInventoryValuation(req, res) {
    try {
      // Get business_id from user (handle both formats)
      const business_id = req.user.businessId || req.user.business_id;
      if (!business_id) {
        return res.status(400).json({
          success: false,
          error: 'Business ID not found in user session'
        });
      }

      // Use validated data from middleware
      const { method = 'fifo', as_of_date } = req.validatedData || req.query;

      log.info('Getting inventory valuation', {
        business_id,
        method,
        as_of_date
      });

      const asOfDate = as_of_date ? new Date(as_of_date) : new Date();

      const valuation = await InventoryAccountingService.getInventoryValuation(
        business_id,
        method,
        asOfDate
      );

      return res.status(200).json({
        success: true,
        data: valuation,
        message: 'Inventory valuation retrieved successfully'
      });

    } catch (error) {
      log.error('Error getting inventory valuation:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve inventory valuation',
        details: error.message
      });
    }
  }

  /**
   * Get COGS report - UPDATED to use validated data
   */
  static async getCogsReport(req, res) {
    try {
      // Get business_id from user (handle both formats)
      const business_id = req.user.businessId || req.user.business_id;
      if (!business_id) {
        return res.status(400).json({
          success: false,
          error: 'Business ID not found in user session'
        });
      }

      // Use validated data from middleware
      const { start_date, end_date } = req.validatedData || req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: 'Both start_date and end_date are required'
        });
      }

      log.info('Getting COGS report', {
        business_id,
        start_date,
        end_date
      });

      const startDate = new Date(start_date);
      const endDate = new Date(end_date);

      if (startDate > endDate) {
        return res.status(400).json({
          success: false,
          error: 'Start date cannot be after end date'
        });
      }

      const cogsReport = await InventoryAccountingService.getCogsReport(
        business_id,
        startDate,
        endDate
      );

      return res.status(200).json({
        success: true,
        data: cogsReport,
        message: 'COGS report retrieved successfully'
      });

    } catch (error) {
      log.error('Error getting COGS report:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve COGS report',
        details: error.message
      });
    }
  }

  /**
   * Get profit and loss statement - NEW METHOD
   */
  static async getProfitLoss(req, res) {
    try {
      // Get business_id from user (handle both camelCase and snake_case)
      const business_id = req.user.businessId || req.user.business_id;
      if (!business_id) {
        return res.status(400).json({
          success: false,
          error: 'Business ID not found in user session'
        });
      }

      // Get parameters
      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: 'Both start_date and end_date are required'
        });
      }

      const startDate = new Date(start_date);
      const endDate = new Date(end_date);

      if (startDate > endDate) {
        return res.status(400).json({
          success: false,
          error: 'Start date cannot be after end date'
        });
      }

      log.info('Getting profit and loss statement', {
        business_id,
        start_date,
        end_date
      });

      // Use the new AccountingService method
      const profitLoss = await AccountingService.getProfitLoss(
        business_id,
        startDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
        endDate.toISOString().split('T')[0]
      );

      return res.status(200).json({
        success: true,
        data: profitLoss,
        message: 'Profit and loss statement generated successfully'
      });

    } catch (error) {
      log.error('Error getting profit loss:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate profit and loss statement',
        details: error.message
      });
    }
  }

  /**
   * Get inventory sync status
   */
  static async getSyncStatus(req, res) {
    try {
      // Get business_id from user (handle both formats)
      const business_id = req.user.businessId || req.user.business_id;
      if (!business_id) {
        return res.status(400).json({
          success: false,
          error: 'Business ID not found in user session'
        });
      }

      log.info('Getting inventory sync status', { business_id });

      const syncStatus = await InventorySyncService.getSyncStatus(business_id);

      return res.status(200).json({
        success: true,
        data: syncStatus,
        message: 'Sync status retrieved successfully'
      });

    } catch (error) {
      log.error('Error getting sync status:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve sync status',
        details: error.message
      });
    }
  }

  /**
   * Sync all inventory to products
   */
  static async syncAllInventory(req, res) {
    try {
      // Get business_id and userId from user (handle both formats)
      const business_id = req.user.businessId || req.user.business_id;
      const userId = req.user.userId || req.user.id;

      if (!business_id || !userId) {
        return res.status(400).json({
          success: false,
          error: 'Business ID or User ID not found in user session'
        });
      }

      const { source = 'inventory' } = req.body;

      log.info('Syncing all inventory to products', {
        business_id,
        userId,
        source
      });

      if (!['product', 'inventory', 'average'].includes(source)) {
        return res.status(400).json({
          success: false,
          error: 'Source must be "product", "inventory", or "average"'
        });
      }

      const result = await InventorySyncService.fixStockDiscrepancies(
        business_id,
        source,
        userId
      );

      return res.status(200).json({
        success: true,
        data: result,
        message: 'Inventory sync completed successfully'
      });

    } catch (error) {
      log.error('Error syncing inventory:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to sync inventory',
        details: error.message
      });
    }
  }

  /**
   * Test endpoint
   */
  static async testController(req, res) {
    try {
      // Get business_id from user (handle both formats)
      const business_id = req.user.businessId || req.user.business_id;

      return res.status(200).json({
        success: true,
        data: {
          business_id,
          timestamp: new Date().toISOString(),
          status: 'Accounting controller is operational',
          schema: 'Uses line_type matching actual database',
          validation: 'Using accounting-specific validation middleware'
        },
        message: 'Accounting system is working correctly'
      });

    } catch (error) {
      log.error('Controller test failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Controller test failed',
        details: error.message
      });
    }
  }
}

export default AccountingController;
