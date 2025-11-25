import express from 'express';
import { walletController } from '../controllers/walletController.js';
import {
  createWalletSchema,
  createWalletTransactionSchema,
  transferBetweenWalletsSchema,
  walletQuerySchema
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

// Wallet Transactions
router.post(
  '/transactions',
  requirePermission('wallet:update'),
  validateRequest(createWalletTransactionSchema),
  walletController.recordTransaction
);

// NEW: Get All Wallet Transactions
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

router.get(
  '/:wallet_id/transactions',
  requirePermission('wallet:read'),
  walletController.getWalletTransactions
);

// Wallet Reports
router.get(
  '/statistics',
  requirePermission('wallet:read'),
  walletController.getStatistics
);

export default router;
