const fs = require('fs');

const walletServicePath = 'walletService.js';
let content = fs.readFileSync(walletServicePath, 'utf8');

// Find the position to insert after getWalletStatistics method
const insertPoint = content.indexOf('static async getWalletStatistics(businessId) {');
const methodStart = content.lastIndexOf('static async', insertPoint);
const methodEnd = content.indexOf('}', insertPoint) + 1;

// Get the complete getWalletStatistics method to find where to insert after it
const nextMethodStart = content.indexOf('static async', methodEnd);

// The missing getAllTransactions method
const newMethod = `
  /**
   * Get all transactions across all wallets for a business
   */
  static async getAllTransactions(businessId, filters = {}) {
    const client = await getClient();
    try {
      const {
        transaction_type,
        start_date,
        end_date,
        page = 1,
        limit = 50
      } = filters;

      let queryStr = \`
        SELECT 
          wt.*,
          mw.name as wallet_name,
          mw.wallet_type,
          mw.currency
        FROM wallet_transactions wt
        INNER JOIN money_wallets mw ON wt.wallet_id = mw.id
        WHERE mw.business_id = \$1
      \`;
      const params = [businessId];
      let paramCount = 1;

      if (transaction_type) {
        paramCount++;
        queryStr += \` AND wt.transaction_type = \$\${paramCount}\`;
        params.push(transaction_type);
      }

      if (start_date) {
        paramCount++;
        queryStr += \` AND wt.created_at >= \$\${paramCount}\`;
        params.push(start_date);
      }

      if (end_date) {
        paramCount++;
        queryStr += \` AND wt.created_at <= \$\${paramCount}\`;
        params.push(end_date);
      }

      queryStr += \` ORDER BY wt.created_at DESC\`;

      // Add pagination
      if (limit) {
        paramCount++;
        queryStr += \` LIMIT \$\${paramCount}\`;
        params.push(limit);
      }

      if (page && limit) {
        paramCount++;
        const offset = (page - 1) * limit;
        queryStr += \` OFFSET \$\${paramCount}\`;
        params.push(offset);
      }

      const result = await client.query(queryStr, params);

      // Get total count for pagination info
      let countQuery = \`
        SELECT COUNT(*) 
        FROM wallet_transactions wt
        INNER JOIN money_wallets mw ON wt.wallet_id = mw.id
        WHERE mw.business_id = \$1
      \`;
      const countParams = [businessId];

      if (transaction_type) {
        countQuery += \` AND wt.transaction_type = \$2\`;
        countParams.push(transaction_type);
      }

      const countResult = await client.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      return {
        transactions: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      log.error('Error fetching all wallet transactions:', error);
      throw error;
    } finally {
      client.release();
    }
  }
`;

// Insert the new method after getWalletStatistics
const newContent = content.slice(0, nextMethodStart) + newMethod + content.slice(nextMethodStart);

fs.writeFileSync(walletServicePath, newContent);
console.log('✅ WalletService.getAllTransactions() implemented successfully!');
