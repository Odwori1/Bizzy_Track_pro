import express from 'express';
import { walletController } from '../controllers/walletController.js';
import {
  createWalletSchema,
  createWalletTransactionSchema,
  transferBetweenWalletsSchema,
  walletQuerySchema,
  updateWalletSchema
} from '../schemas/walletSchemas.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and RLS context
router.use(authenticate, setRLSContext);

// Wallet Management
router.post(
  '/',
  requirePermission('wallet:create'),
  validateRequest(createWalletSchema),
  walletController.createWallet
);

router.get(
  '/',
  requirePermission('wallet:read'),
  validateRequest(walletQuerySchema, 'query'),
  walletController.getWallets
);

// ✅ SPECIFIC ROUTES FIRST - FIXED ORDER

// Wallet Transactions
router.post(
  '/transactions',
  requirePermission('wallet:update'),
  validateRequest(createWalletTransactionSchema),
  walletController.recordTransaction
);

// Get All Wallet Transactions
router.get(
  '/transactions',
  requirePermission('wallet:read'),
  walletController.getAllTransactions
);

router.post(
  '/transfer',
  requirePermission('wallet:update'),
  validateRequest(transferBetweenWalletsSchema),
  walletController.transferBetweenWallets
);

// Wallet Reports
router.get(
  '/statistics',
  requirePermission('wallet:read'),
  walletController.getStatistics
);

// ✅ PARAMETER ROUTES LAST - FIXED ORDER

// Get and Update Individual Wallets
router.get(
  '/:id',
  requirePermission('wallet:read'),
  walletController.getWalletById
);

router.put(
  '/:id',
  requirePermission('wallet:update'),
  validateRequest(updateWalletSchema),
  walletController.updateWallet
);

// Get transactions for specific wallet
router.get(
  '/:wallet_id/transactions',
  requirePermission('wallet:read'),
  walletController.getWalletTransactions
);

export default router;
