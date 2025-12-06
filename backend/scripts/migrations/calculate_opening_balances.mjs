// backend/scripts/migrations/calculate_opening_balances.mjs - CORRECTED VERSION
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Calculate opening balances from legacy data for accounting migration
 * 
 * CORRECTIONS APPLIED:
 * 1. Fixed Assets: Use current_value NOT purchase_price
 * 2. Inventory: Only inventory_items, NOT products
 * 3. Revenue: Use pos_transactions.final_amount (includes taxes/fees)
 * 4. Equipment Hire: Treated as Service Revenue
 */

class OpeningBalanceCalculator {
  constructor(businessId) {
    this.businessId = businessId;
    this.pool = new Pool({
      host: 'localhost',
      port: 5434,
      database: 'bizzytrack_pro',
      user: 'postgres',
      password: '0791486006@postgres',
    });
    
    this.results = {
      business_id: businessId,
      calculated_at: new Date().toISOString(),
      assets: {},
      liabilities: {},
      revenue: {},
      expenses: {},
      cogs: {},
      journal_entries: []
    };
  }

  async connect() {
    this.client = await this.pool.connect();
  }

  async disconnect() {
    if (this.client) {
      this.client.release();
    }
    await this.pool.end();
  }

  /**
   * 1. CASH & EQUIVALENTS: USh 3,055,500.00
   * Source: money_wallets table (7 wallets)
   * Accounting Account: 1110 - Cash
   */
  async calculateCash() {
    const query = `
      SELECT 
        SUM(current_balance) as total_cash,
        COUNT(*) as wallet_count
      FROM money_wallets 
      WHERE business_id = $1 AND is_active = true
    `;
    
    const result = await this.client.query(query, [this.businessId]);
    const totalCash = parseFloat(result.rows[0].total_cash) || 0;
    
    this.results.assets.cash = {
      amount: totalCash,
      source: 'money_wallets',
      account_code: '1110',
      details: `${result.rows[0].wallet_count} wallets`
    };
    
    return totalCash;
  }

  /**
   * 2. FIXED ASSETS: USh 246,280.04
   * Source: fixed_assets table (14 assets) - USE current_value
   * Accounting Account: 1300 - Fixed Assets
   */
  async calculateFixedAssets() {
    const query = `
      SELECT 
        SUM(current_value) as total_fixed_assets,
        COUNT(*) as asset_count
      FROM fixed_assets 
      WHERE business_id = $1 AND is_active = true
    `;
    
    const result = await this.client.query(query, [this.businessId]);
    const totalFixedAssets = parseFloat(result.rows[0].total_fixed_assets) || 0;
    
    this.results.assets.fixed_assets = {
      amount: totalFixedAssets,
      source: 'fixed_assets (current_value)',
      account_code: '1300',
      details: `${result.rows[0].asset_count} assets`
    };
    
    return totalFixedAssets;
  }

  /**
   * 3. INVENTORY ASSETS: USh 305,000.00
   * Source: inventory_items table ONLY (3 items) - NOT products
   * Accounting Account: 1300 - Inventory
   */
  async calculateInventory() {
    // ONLY inventory_items per audit report
    const inventoryQuery = `
      SELECT 
        SUM(cost_price * current_stock) as total_inventory_value,
        COUNT(*) as item_count
      FROM inventory_items 
      WHERE business_id = $1 AND is_active = true
    `;
    
    const inventoryResult = await this.client.query(inventoryQuery, [this.businessId]);
    const inventoryValue = parseFloat(inventoryResult.rows[0].total_inventory_value) || 0;
    
    // Products are NOT included in inventory valuation per audit
    const productsQuery = `
      SELECT 
        SUM(cost_price * current_stock) as total_products_value,
        COUNT(*) as product_count
      FROM products 
      WHERE business_id = $1 AND is_active = true
    `;
    
    const productsResult = await this.client.query(productsQuery, [this.businessId]);
    const productsValue = parseFloat(productsResult.rows[0].total_products_value) || 0;
    
    this.results.assets.inventory = {
      amount: inventoryValue,
      source: 'inventory_items ONLY (not products)',
      account_code: '1300',
      details: `${inventoryResult.rows[0].item_count} inventory items (${productsResult.rows[0].product_count} products excluded from inventory valuation)`,
      notes: 'Products table exists but NOT in inventory management system per audit report'
    };
    
    this.results.assets.products_excluded = {
      amount: productsValue,
      source: 'products (excluded from inventory)',
      details: 'Products are sold but not tracked in inventory system'
    };
    
    return inventoryValue;
  }

  /**
   * 4. ACCOUNTS RECEIVABLE: USh 3,316.28
   * Source: invoices table (unpaid invoices)
   * Accounting Account: 1200 - Accounts Receivable
   */
  async calculateAccountsReceivable() {
    const query = `
      SELECT 
        SUM(balance_due) as total_receivable,
        COUNT(*) as invoice_count
      FROM invoices 
      WHERE business_id = $1 
        AND status NOT IN ('paid', 'cancelled')
        AND balance_due > 0
    `;
    
    const result = await this.client.query(query, [this.businessId]);
    const totalReceivable = parseFloat(result.rows[0].total_receivable) || 0;
    
    this.results.assets.accounts_receivable = {
      amount: totalReceivable,
      source: 'invoices',
      account_code: '1200',
      details: `${result.rows[0].invoice_count} unpaid invoices`
    };
    
    return totalReceivable;
  }

  /**
   * 5. ACCOUNTS PAYABLE: USh 1,000.00
   * Source: purchase_orders table (unpaid POs)
   * Accounting Account: 2100 - Accounts Payable
   */
  async calculateAccountsPayable() {
    const query = `
      SELECT 
        SUM(total_amount) as total_payable,
        COUNT(*) as po_count
      FROM purchase_orders 
      WHERE business_id = $1 
        AND status NOT IN ('paid', 'cancelled')
        AND total_amount > 0
    `;
    
    const result = await this.client.query(query, [this.businessId]);
    const totalPayable = parseFloat(result.rows[0].total_payable) || 0;
    
    this.results.liabilities.accounts_payable = {
      amount: totalPayable,
      source: 'purchase_orders',
      account_code: '2100',
      details: `${result.rows[0].po_count} unpaid purchase orders`
    };
    
    return totalPayable;
  }

  /**
   * 6. REVENUE BREAKDOWN
   * Source: pos_transaction_items with item_type breakdown
   * BUT total revenue from pos_transactions.final_amount (includes taxes/fees)
   */
  async calculateRevenue() {
    // Get breakdown by item type
    const breakdownQuery = `
      SELECT 
        item_type,
        SUM(total_price) as total_revenue,
        COUNT(*) as transaction_count
      FROM pos_transaction_items pti
      JOIN pos_transactions pt ON pti.pos_transaction_id = pt.id
      WHERE pti.business_id = $1 
        AND pt.status = 'completed'
      GROUP BY item_type
      ORDER BY item_type
    `;
    
    const breakdownResult = await this.client.query(breakdownQuery, [this.businessId]);
    
    let productRevenue = 0;
    let serviceRevenue = 0;
    let equipmentHireRevenue = 0;
    
    for (const row of breakdownResult.rows) {
      switch (row.item_type) {
        case 'product':
          productRevenue = parseFloat(row.total_revenue) || 0;
          this.results.revenue.product_sales = {
            amount: productRevenue,
            source: 'pos_transaction_items (product)',
            account_code: '4100',
            details: `${row.transaction_count} product sales`
          };
          break;
        case 'service':
          serviceRevenue = parseFloat(row.total_revenue) || 0;
          this.results.revenue.service_sales = {
            amount: serviceRevenue,
            source: 'pos_transaction_items (service)',
            account_code: '4200',
            details: `${row.transaction_count} service sales`
          };
          break;
        case 'equipment_hire':
          equipmentHireRevenue = parseFloat(row.total_revenue) || 0;
          this.results.revenue.equipment_hire = {
            amount: equipmentHireRevenue,
            source: 'pos_transaction_items (equipment_hire)',
            account_code: '4200', // Business Rule: Treated as Service Revenue
            details: `${row.transaction_count} equipment hires (treated as service revenue)`
          };
          break;
      }
    }
    
    // Get TOTAL revenue from pos_transactions (includes taxes/fees/adjustments)
    const totalQuery = `
      SELECT SUM(final_amount) as total_pos_revenue
      FROM pos_transactions 
      WHERE business_id = $1 AND status = 'completed'
    `;
    
    const totalResult = await this.client.query(totalQuery, [this.businessId]);
    const totalPosRevenue = parseFloat(totalResult.rows[0].total_pos_revenue) || 0;
    
    // Calculate adjustment (taxes/fees)
    const itemsTotal = productRevenue + serviceRevenue + equipmentHireRevenue;
    const adjustment = totalPosRevenue - itemsTotal;
    
    this.results.revenue.total = {
      amount: totalPosRevenue,
      source: 'pos_transactions.final_amount',
      details: `Total POS revenue (includes taxes/fees/adjustments: ${adjustment.toFixed(2)})`
    };
    
    this.results.revenue.adjustment = {
      amount: adjustment,
      source: 'POS taxes/fees/adjustments',
      details: 'Difference between transaction total and items total'
    };
    
    return {
      productRevenue,
      serviceRevenue: serviceRevenue + equipmentHireRevenue, // Combined per business rule
      equipmentHireRevenue,
      totalPosRevenue,
      adjustment
    };
  }

  /**
   * 7. COGS CALCULATION: USh 1,295.00
   * Source: pos_transaction_items × products.cost_price
   * Accounting Account: 5100 - Cost of Goods Sold
   */
  async calculateCOGS() {
    const query = `
      SELECT 
        SUM(p.cost_price * pti.quantity) as total_cogs,
        COUNT(*) as items_sold
      FROM pos_transaction_items pti
      JOIN products p ON pti.product_id = p.id
      JOIN pos_transactions pt ON pti.pos_transaction_id = pt.id
      WHERE pti.business_id = $1 
        AND pti.item_type = 'product'
        AND pt.status = 'completed'
    `;
    
    const result = await this.client.query(query, [this.businessId]);
    const totalCOGS = parseFloat(result.rows[0].total_cogs) || 0;
    
    this.results.cogs = {
      amount: totalCOGS,
      source: 'pos_transaction_items × products.cost_price',
      account_code: '5100',
      details: `${result.rows[0].items_sold} product items sold`
    };
    
    return totalCOGS;
  }

  /**
   * 8. EXPENSES: USh 82,425.00
   * Source: expenses table (status = 'paid')
   * Accounting Account: Various expense accounts (5200+)
   */
  async calculateExpenses() {
    const query = `
      SELECT 
        SUM(amount) as total_expenses,
        COUNT(*) as expense_count
      FROM expenses 
      WHERE business_id = $1 AND status = 'paid'
    `;
    
    const result = await this.client.query(query, [this.businessId]);
    const totalExpenses = parseFloat(result.rows[0].total_expenses) || 0;
    
    this.results.expenses = {
      amount: totalExpenses,
      source: 'expenses (paid)',
      account_code: '5200', // Base expense account
      details: `${result.rows[0].expense_count} paid expenses`
    };
    
    return totalExpenses;
  }

  /**
   * Generate the 4 journal entries based on calculations
   * FIXED: Journal Entry 2 now properly balanced
   */
  generateJournalEntries() {
    // JOURNAL ENTRY 1: Opening Balances (Assets = Liabilities + Equity)
    const totalAssets = 
      (this.results.assets.cash?.amount || 0) +
      (this.results.assets.fixed_assets?.amount || 0) +
      (this.results.assets.inventory?.amount || 0) +
      (this.results.assets.accounts_receivable?.amount || 0);
    
    const totalLiabilities = this.results.liabilities.accounts_payable?.amount || 0;
    const openingEquity = totalAssets - totalLiabilities;
    
    const journalEntry1 = {
      entry_number: 1,
      description: 'Opening Balance Migration - Assets & Liabilities',
      journal_date: new Date().toISOString().split('T')[0],
      reference_type: 'migration',
      reference_id: `migration_${this.businessId}_${Date.now()}`,
      lines: [
        // Debit Assets
        {
          account_code: '1110',
          description: 'Cash & Equivalents - Opening Balance',
          amount: this.results.assets.cash?.amount || 0,
          line_type: 'debit'
        },
        {
          account_code: '1200',
          description: 'Accounts Receivable - Opening Balance',
          amount: this.results.assets.accounts_receivable?.amount || 0,
          line_type: 'debit'
        },
        {
          account_code: '1300',
          description: 'Fixed Assets - Opening Balance',
          amount: this.results.assets.fixed_assets?.amount || 0,
          line_type: 'debit'
        },
        {
          account_code: '1300',
          description: 'Inventory Assets - Opening Balance',
          amount: this.results.assets.inventory?.amount || 0,
          line_type: 'debit'
        },
        // Credit Liabilities & Equity
        {
          account_code: '2100',
          description: 'Accounts Payable - Opening Balance',
          amount: totalLiabilities,
          line_type: 'credit'
        },
        {
          account_code: '3100',
          description: "Owner's Capital - Opening Equity",
          amount: openingEquity,
          line_type: 'credit'
        }
      ]
    };

    // JOURNAL ENTRY 2: Revenue Recognition
    const revenue = this.results.revenue;
    const totalRevenue = revenue.total?.amount || 0;
    const productRevenue = revenue.product_sales?.amount || 0;
    const serviceRevenue = (revenue.service_sales?.amount || 0) + (revenue.equipment_hire?.amount || 0);
    const adjustment = revenue.adjustment?.amount || 0;
    
    const journalEntry2 = {
      entry_number: 2,
      description: 'Revenue Recognition - Historical Sales (Includes taxes/fees)',
      journal_date: new Date().toISOString().split('T')[0],
      reference_type: 'migration',
      reference_id: `migration_${this.businessId}_${Date.now()}_revenue`,
      lines: []
    };
    
    // Debit side: Cash (since revenue was received in cash)
    journalEntry2.lines.push({
      account_code: '1110',
      description: 'Cash Received from Historical Sales',
      amount: totalRevenue,
      line_type: 'debit'
    });
    
    // Credit side: Revenue accounts + adjustment if any
    if (productRevenue > 0) {
      journalEntry2.lines.push({
        account_code: '4100',
        description: 'Product Sales Revenue',
        amount: productRevenue,
        line_type: 'credit'
      });
    }
    
    if (serviceRevenue > 0) {
      journalEntry2.lines.push({
        account_code: '4200',
        description: 'Service Revenue (Services + Equipment Hire)',
        amount: serviceRevenue,
        line_type: 'credit'
      });
    }
    
    if (adjustment !== 0) {
      journalEntry2.lines.push({
        account_code: adjustment > 0 ? '4100' : '4200', // Allocate to revenue
        description: adjustment > 0 ? 'Revenue Adjustment (Taxes/Fees)' : 'Revenue Adjustment (Discounts)',
        amount: Math.abs(adjustment),
        line_type: adjustment > 0 ? 'credit' : 'debit'
      });
    }

    // JOURNAL ENTRY 3: COGS Recognition
    const journalEntry3 = {
      entry_number: 3,
      description: 'COGS Recognition - Historical Product Sales',
      journal_date: new Date().toISOString().split('T')[0],
      reference_type: 'migration',
      reference_id: `migration_${this.businessId}_${Date.now()}_cogs`,
      lines: [
        // Debit COGS
        {
          account_code: '5100',
          description: 'Cost of Goods Sold - Historical',
          amount: this.results.cogs?.amount || 0,
          line_type: 'debit'
        },
        // Credit Inventory (reduction)
        {
          account_code: '1300',
          description: 'Inventory Reduction - COGS',
          amount: this.results.cogs?.amount || 0,
          line_type: 'credit'
        }
      ]
    };

    // JOURNAL ENTRY 4: Expense Recognition
    const journalEntry4 = {
      entry_number: 4,
      description: 'Expense Recognition - Historical Expenses',
      journal_date: new Date().toISOString().split('T')[0],
      reference_type: 'migration',
      reference_id: `migration_${this.businessId}_${Date.now()}_expenses`,
      lines: [
        // Debit Expenses
        {
          account_code: '5200',
          description: 'Business Expenses - Historical',
          amount: this.results.expenses?.amount || 0,
          line_type: 'debit'
        },
        // Credit Cash (expenses paid from cash)
        {
          account_code: '1110',
          description: 'Cash Payment for Expenses',
          amount: this.results.expenses?.amount || 0,
          line_type: 'credit'
        }
      ]
    };

    this.results.journal_entries = [journalEntry1, journalEntry2, journalEntry3, journalEntry4];
    
    // Verify each journal entry balances
    this.results.journal_entries.forEach((entry, index) => {
      const totalDebits = entry.lines
        .filter(line => line.line_type === 'debit')
        .reduce((sum, line) => sum + line.amount, 0);
      
      const totalCredits = entry.lines
        .filter(line => line.line_type === 'credit')
        .reduce((sum, line) => sum + line.amount, 0);
      
      entry.is_balanced = Math.abs(totalDebits - totalCredits) < 0.01;
      entry.total_debits = totalDebits;
      entry.total_credits = totalCredits;
      entry.difference = Math.abs(totalDebits - totalCredits);
    });
    
    // Verify overall accounting equation
    const totalDebits = this.calculateTotalDebits();
    const totalCredits = this.calculateTotalCredits();
    
    this.results.accounting_equation = {
      total_debits: totalDebits,
      total_credits: totalCredits,
      is_balanced: Math.abs(totalDebits - totalCredits) < 0.01,
      difference: Math.abs(totalDebits - totalCredits)
    };
    
    // Calculate net profit/loss
    const totalRevenueAmount = revenue.total?.amount || 0;
    const totalExpenses = this.results.expenses?.amount || 0;
    const totalCOGS = this.results.cogs?.amount || 0;
    const netProfitLoss = totalRevenueAmount - totalExpenses - totalCOGS;
    
    this.results.profit_loss = {
      total_revenue: totalRevenueAmount,
      total_expenses: totalExpenses,
      total_cogs: totalCOGS,
      net_profit_loss: netProfitLoss,
      is_profit: netProfitLoss > 0
    };
  }

  calculateTotalDebits() {
    let total = 0;
    for (const entry of this.results.journal_entries) {
      for (const line of entry.lines) {
        if (line.line_type === 'debit') {
          total += line.amount;
        }
      }
    }
    return total;
  }

  calculateTotalCredits() {
    let total = 0;
    for (const entry of this.results.journal_entries) {
      for (const line of entry.lines) {
        if (line.line_type === 'credit') {
          total += line.amount;
        }
      }
    }
    return total;
  }

  async calculateAll() {
    try {
      await this.connect();
      
      console.log(`🔍 Calculating opening balances for business: ${this.businessId}`);
      
      // Calculate all components
      await this.calculateCash();
      await this.calculateFixedAssets();
      await this.calculateInventory();
      await this.calculateAccountsReceivable();
      await this.calculateAccountsPayable();
      await this.calculateRevenue();
      await this.calculateCOGS();
      await this.calculateExpenses();
      
      // Generate journal entries
      this.generateJournalEntries();
      
      console.log('✅ All calculations completed successfully');
      
      return this.results;
      
    } catch (error) {
      console.error('❌ Error calculating opening balances:', error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  async saveResultsToFile() {
    const outputDir = join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const filename = `migration_plan_${this.businessId}_${Date.now()}.json`;
    const filepath = join(outputDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
    console.log(`📄 Results saved to: ${filepath}`);
    
    return filepath;
  }
}

// Main execution
async function main() {
  try {
    // Use the test business ID from the audit report
    const businessId = '243a15b5-255a-4852-83bf-5cb46aa62b5e';
    
    const calculator = new OpeningBalanceCalculator(businessId);
    const results = await calculator.calculateAll();
    
    // Save to file
    await calculator.saveResultsToFile();
    
    // Print summary
    console.log('\n📊 MIGRATION CALCULATION SUMMARY:');
    console.log('=' .repeat(50));
    
    console.log('\nASSETS:');
    console.log(`  Cash: USh ${results.assets.cash?.amount?.toFixed(2)}`);
    console.log(`  Fixed Assets: USh ${results.assets.fixed_assets?.amount?.toFixed(2)} (using current_value)`);
    console.log(`  Inventory: USh ${results.assets.inventory?.amount?.toFixed(2)} (inventory_items only)`);
    console.log(`  Accounts Receivable: USh ${results.assets.accounts_receivable?.amount?.toFixed(2)}`);
    if (results.assets.products_excluded) {
      console.log(`  Products Excluded: USh ${results.assets.products_excluded?.amount?.toFixed(2)} (not in inventory system)`);
    }
    
    console.log('\nLIABILITIES:');
    console.log(`  Accounts Payable: USh ${results.liabilities.accounts_payable?.amount?.toFixed(2)}`);
    
    console.log('\nREVENUE:');
    console.log(`  Product Sales: USh ${results.revenue.product_sales?.amount?.toFixed(2)}`);
    console.log(`  Service Sales: USh ${results.revenue.service_sales?.amount?.toFixed(2)}`);
    console.log(`  Equipment Hire: USh ${results.revenue.equipment_hire?.amount?.toFixed(2)} (Treated as Service Revenue)`);
    console.log(`  Adjustment: USh ${results.revenue.adjustment?.amount?.toFixed(2)} (taxes/fees)`);
    console.log(`  Total POS Revenue: USh ${results.revenue.total?.amount?.toFixed(2)}`);
    
    console.log('\nEXPENSES & COGS:');
    console.log(`  Expenses: USh ${results.expenses?.amount?.toFixed(2)}`);
    console.log(`  COGS: USh ${results.cogs?.amount?.toFixed(2)}`);
    
    console.log('\nPROFIT/LOSS:');
    console.log(`  Net Profit/Loss: USh ${results.profit_loss?.net_profit_loss?.toFixed(2)}`);
    console.log(`  Status: ${results.profit_loss?.is_profit ? 'PROFIT' : 'LOSS'}`);
    
    console.log('\nJOURNAL ENTRIES BALANCE CHECK:');
    results.journal_entries.forEach((entry, index) => {
      console.log(`  Entry ${entry.entry_number}: ${entry.is_balanced ? '✅ BALANCED' : '❌ UNBALANCED'} (Debits: ${entry.total_debits?.toFixed(2)}, Credits: ${entry.total_credits?.toFixed(2)})`);
    });
    
    console.log('\nACCOUNTING EQUATION:');
    console.log(`  Total Debits: USh ${results.accounting_equation?.total_debits?.toFixed(2)}`);
    console.log(`  Total Credits: USh ${results.accounting_equation?.total_credits?.toFixed(2)}`);
    console.log(`  Balanced: ${results.accounting_equation?.is_balanced ? '✅ YES' : '❌ NO'} (Difference: ${results.accounting_equation?.difference?.toFixed(2)})`);
    
    console.log('\nJOURNAL ENTRIES TO CREATE:');
    console.log(`  1. Opening Balances (Assets = Liabilities + Equity)`);
    console.log(`  2. Revenue Recognition (Split by type, includes adjustment)`);
    console.log(`  3. COGS Recognition (Reduce inventory)`);
    console.log(`  4. Expense Recognition`);
    
    console.log('\n🎯 READY FOR MIGRATION');
    
  } catch (error) {
    console.error('Migration calculation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { OpeningBalanceCalculator };
