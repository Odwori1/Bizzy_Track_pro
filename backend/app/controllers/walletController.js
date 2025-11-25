import { WalletService } from '../services/walletService.js';
import { log } from '../utils/logger.js';

export const walletController = {
  // NEW: Get All Wallet Transactions
  async getAllTransactions(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { transaction_type, start_date, end_date, page, limit } = req.query;

      const filters = {};
      if (transaction_type) filters.transaction_type = transaction_type;
      if (start_date) filters.start_date = start_date;
      if (end_date) filters.end_date = end_date;
      if (page) filters.page = parseInt(page);
      if (limit) filters.limit = parseInt(limit);

      log.info('Fetching all wallet transactions', { businessId, filters });

      const transactions = await WalletService.getAllTransactions(businessId, filters);

      res.json({
        success: true,
        data: transactions,
        count: transactions.length,
        message: 'All wallet transactions fetched successfully'
      });

    } catch (error) {
      log.error('All wallet transactions fetch controller error', error);
      next(error);
    }
  },

  async createWallet(req, res, next) {
    try {
      const walletData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating money wallet', { businessId, userId, walletName: walletData.name });

      const newWallet = await WalletService.createWallet(businessId, walletData, userId);

      res.status(201).json({
        success: true,
        message: 'Money wallet created successfully',
        data: newWallet
      });

    } catch (error) {
      log.error('Wallet creation controller error', error);
      next(error);
    }
  },

  async recordTransaction(req, res, next) {
    try {
      const transactionData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Recording wallet transaction', {
        businessId,
        userId,
        walletId: transactionData.wallet_id,
        transactionType: transactionData.transaction_type
      });

      const result = await WalletService.recordTransaction(businessId, transactionData, userId);

      res.status(201).json({
        success: true,
        message: 'Wallet transaction recorded successfully',
        data: result
      });

    } catch (error) {
      log.error('Wallet transaction recording controller error', error);
      next(error);
    }
  },

  async transferBetweenWallets(req, res, next) {
    try {
      const transferData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Transferring between wallets', {
        businessId,
        userId,
        fromWallet: transferData.from_wallet_id,
        toWallet: transferData.to_wallet_id
      });

      const result = await WalletService.transferBetweenWallets(businessId, transferData, userId);

      res.status(201).json({
        success: true,
        message: 'Wallet transfer completed successfully',
        data: result
      });

    } catch (error) {
      log.error('Wallet transfer controller error', error);
      next(error);
    }
  },

  async getWallets(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { wallet_type, is_active } = req.query;

      const filters = {};
      if (wallet_type) filters.wallet_type = wallet_type;
      if (is_active !== undefined) filters.is_active = is_active === 'true';

      const wallets = await WalletService.getWallets(businessId, filters);

      res.json({
        success: true,
        data: wallets,
        count: wallets.length,
        message: 'Money wallets fetched successfully'
      });

    } catch (error) {
      log.error('Wallets fetch controller error', error);
      next(error);
    }
  },

  async getWalletTransactions(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { wallet_id } = req.params;
      const { transaction_type, start_date, end_date, page, limit } = req.query;

      const filters = {};
      if (transaction_type) filters.transaction_type = transaction_type;
      if (start_date) filters.start_date = start_date;
      if (end_date) filters.end_date = end_date;
      if (page) filters.page = parseInt(page);
      if (limit) filters.limit = parseInt(limit);

      const transactions = await WalletService.getWalletTransactions(businessId, wallet_id, filters);

      res.json({
        success: true,
        data: transactions,
        count: transactions.length,
        message: 'Wallet transactions fetched successfully'
      });

    } catch (error) {
      log.error('Wallet transactions fetch controller error', error);
      next(error);
    }
  },

  async getStatistics(req, res, next) {
    try {
      const businessId = req.user.businessId;

      const statistics = await WalletService.getWalletStatistics(businessId);

      res.json({
        success: true,
        data: statistics,
        message: 'Wallet statistics fetched successfully'
      });

    } catch (error) {
      log.error('Wallet statistics fetch controller error', error);
      next(error);
    }
  }
};
