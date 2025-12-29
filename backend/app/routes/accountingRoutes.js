// File: backend/app/routes/accountingRoutes.js
import express from 'express';
import { AccountingController } from '../controllers/accountingController.js';
import { validateRequest } from '../middleware/validation.js';
import { AccountingService } from '../services/accountingService.js';
import { validateAccountingRequest } from '../middleware/accountingValidation.js';
import { AccountingSchemas } from '../schemas/accountingSchemas.js';

const router = express.Router();

/**
 * @route   GET /api/accounting/test
 * @desc    Test accounting controller
 * @access  Private
 */
router.get('/test', AccountingController.testController);

/**
 * @route   GET /api/accounting/journal-entries
 * @desc    Get all journal entries with filters
 * @access  Private
 */
router.get('/journal-entries', AccountingController.getJournalEntries);

/**
 * @route   POST /api/accounting/journal-entries
 * @desc    Create a manual journal entry
 * @access  Private
 */
router.post(
  '/journal-entries',
  validateRequest(AccountingSchemas.journalEntrySchema),
  AccountingController.createJournalEntry
);

/**
 * @route   GET /api/accounting/trial-balance
 * @desc    Get trial balance report
 * @access  Private
 */
router.get(
  '/trial-balance',
  validateAccountingRequest(AccountingSchemas.trialBalanceSchema),
  AccountingController.getTrialBalance
);

/**
 * @route   GET /api/accounting/general-ledger/:account_code
 * @desc    Get general ledger for specific account
 * @access  Private
 */
router.get(
  '/general-ledger/:account_code',
  validateAccountingRequest(AccountingSchemas.generalLedgerSchema),
  AccountingController.getGeneralLedger
);

/**
 * @route   GET /api/accounting/inventory-valuation
 * @desc    Get inventory valuation report
 * @access  Private
 */
router.get(
  '/inventory-valuation',
  validateAccountingRequest(null), // No schema for now
  AccountingController.getInventoryValuation
);

/**
 * @route   GET /api/accounting/cogs-report
 * @desc    Get COGS report
 * @access  Private
 */
router.get(
  '/cogs-report',
  validateAccountingRequest(AccountingSchemas.cogsReportSchema),
  AccountingController.getCogsReport
);

/**
 * @route   GET /api/accounting/sync-status
 * @desc    Get inventory sync status
 * @access  Private
 */
router.get('/sync-status', AccountingController.getSyncStatus);

/**
 * @route   POST /api/accounting/sync-all-inventory
 * @desc    Sync all inventory to products (bulk operation)
 * @access  Private
 */
router.post(
  '/sync-all-inventory',
  validateRequest(AccountingSchemas.inventorySyncSchema),
  AccountingController.syncAllInventory
);

/**
 * @route   GET /api/accounting/health
 * @desc    Check accounting system health
 * @access  Private
 */
router.get('/health', AccountingController.testController);

/**
 * @route   GET /api/accounting/transaction/:transaction_id
 * @desc    Get accounting details for a transaction
 * @access  Private
 */
router.get('/transaction/:transaction_id', (req, res) => {
  return res.status(501).json({
    success: false,
    error: 'Endpoint not implemented',
    message: 'Transaction accounting endpoint coming soon'
  });
});

/**
 * @route   GET /api/accounting/profit-loss
 * @desc    Get profit and loss statement from accounting data
 * @access  Private
 */
router.get(
  '/profit-loss',
  AccountingController.getProfitLoss
);

/**
 * @route   POST /api/accounting/process-pos
 * @desc    Process accounting for POS transaction
 * @access  Private
 */
router.post('/process-pos', async (req, res) => {
  try {
    const { transactionId } = req.body;
    const userId = req.user.userId || req.user.id;
    const businessId = req.user.businessId || req.user.business_id;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }
    
    const result = await AccountingService.processPosAccounting(transactionId, userId);
    
    res.json({
      success: result.success,
      message: result.message,
      data: {
        journalEntryId: result.journalEntryId,
        linesCreated: result.linesCreated
      }
    });
    
  } catch (error) {
    console.error('POS accounting API error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing accounting'
    });
  }
});

/**
 * @route   POST /api/accounting/repair
 * @desc    Repair missing accounting entries
 * @access  Private (Admin/Owner only)
 */
router.post('/repair', async (req, res) => {
  try {
    // Check permissions - only owner/admin can repair
    if (!['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied'
      });
    }
    
    const { limit = 100 } = req.body;
    const userId = req.user.userId || req.user.id;
    
    const result = await AccountingService.repairMissingAccounting(userId, limit);
    
    res.json({
      success: result.success,
      message: result.message,
      data: {
        transactions: result.transactions
      }
    });
    
  } catch (error) {
    console.error('Repair API error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error repairing accounting'
    });
  }
});

/**
 * @route   GET /api/accounting/stats
 * @desc    Get accounting processing statistics
 * @access  Private
 */
router.get('/stats', async (req, res) => {
  try {
    const businessId = req.user.businessId || req.user.business_id;
    
    const result = await AccountingService.getAccountingStats(businessId);
    
    if (!result.success) {
      return res.status(500).json(result);
    }
    
    res.json({
      success: true,
      data: result.stats
    });
    
  } catch (error) {
    console.error('Stats API error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting accounting stats'
    });
  }
});

export default router;
