// File: backend/app/routes/accountingRoutes.js
import express from 'express';
import { AccountingController } from '../controllers/accountingController.js';
import { validateRequest } from '../middleware/validation.js';
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
 * @desc    Get accounting details for a transaction (NEW ENDPOINT)
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

export default router;
