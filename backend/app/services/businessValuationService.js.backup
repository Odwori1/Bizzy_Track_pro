import { query } from '../utils/database.js';
import { log } from '../utils/logger.js';

export class BusinessValuationService {
  /**
   * Get comprehensive business valuation with robust error handling
   */
  static async getBusinessValuation(businessId, asOfDate = new Date()) {
    try {
      log.info('Calculating business valuation', { businessId, asOfDate });

      // Get all valuation components with individual error handling
      const [
        liquidAssets,
        fixedAssets,
        equipmentAssets,
        accountsReceivable
      ] = await Promise.all([
        this.getLiquidAssets(businessId, asOfDate).catch(error => {
          log.error('Error getting liquid assets:', error);
          return { total_liquid_assets: 0, cash_in_hand: 0, bank_balances: 0, outstanding_receivables: 0 };
        }),
        this.getFixedAssetsValue(businessId, asOfDate).catch(error => {
          log.error('Error getting fixed assets:', error);
          return { total_fixed_assets_value: 0, by_category: {}, asset_count: 0 };
        }),
        this.getEquipmentAssetsValue(businessId, asOfDate).catch(error => {
          log.error('Error getting equipment assets:', error);
          return { total_equipment_value: 0, equipment_count: 0, by_category: { hire_equipment: { count: 0, value: 0 } } };
        }),
        this.getAccountsReceivable(businessId, asOfDate).catch(error => {
          log.error('Error getting accounts receivable:', error);
          return { total_receivable: 0, invoice_count: 0 };
        })
      ]);

      // Get trends with error handling
      const [monthlyAppreciation, monthlyDepreciation] = await Promise.all([
        this.getMonthlyAppreciation(businessId).catch(() => 0),
        this.getMonthlyDepreciation(businessId).catch(() => 0)
      ]);

      // Calculate total valuation
      const totalValuation = 
        liquidAssets.total_liquid_assets +
        fixedAssets.total_fixed_assets_value +
        equipmentAssets.total_equipment_value +
        accountsReceivable.total_receivable;

      const valuation = {
        valuation_date: asOfDate,
        total_business_value: totalValuation,
        breakdown: {
          liquid_assets: liquidAssets.total_liquid_assets,
          fixed_assets: fixedAssets.total_fixed_assets_value,
          equipment_assets: equipmentAssets.total_equipment_value,
          accounts_receivable: accountsReceivable.total_receivable,
          inventory_value: 0,
          intangible_assets: 0
        },
        asset_categories: {
          ...fixedAssets.by_category,
          ...equipmentAssets.by_category
        },
        trends: {
          monthly_appreciation: monthlyAppreciation,
          monthly_depreciation: monthlyDepreciation,
          net_asset_growth: monthlyAppreciation - monthlyDepreciation
        },
        details: {
          liquid_assets: liquidAssets,
          fixed_assets: fixedAssets,
          equipment_assets: equipmentAssets,
          accounts_receivable: accountsReceivable
        }
      };

      log.info('Business valuation calculated successfully', { 
        businessId, 
        totalValuation,
        components: valuation.breakdown
      });

      return valuation;
    } catch (error) {
      log.error('Critical error calculating business valuation:', error);
      
      // Return fallback valuation
      return {
        valuation_date: asOfDate,
        total_business_value: 0,
        breakdown: {
          liquid_assets: 0,
          fixed_assets: 0,
          equipment_assets: 0,
          accounts_receivable: 0,
          inventory_value: 0,
          intangible_assets: 0
        },
        asset_categories: {},
        trends: {
          monthly_appreciation: 0,
          monthly_depreciation: 0,
          net_asset_growth: 0
        },
        details: {},
        warning: 'Valuation calculation partially failed, using fallback values'
      };
    }
  }

  static async getLiquidAssets(businessId, asOfDate) {
    try {
      const result = await query(
        `SELECT 
           COALESCE(SUM(amount_paid), 0) as total_cash_received,
           COALESCE(SUM(balance_due), 0) as outstanding_cash
         FROM invoices 
         WHERE business_id = $1 
           AND invoice_date <= $2
           AND status IN ('paid', 'sent')`,
        [businessId, asOfDate]
      );

      const cashData = result.rows[0];
      
      return {
        total_liquid_assets: parseFloat(cashData.total_cash_received) || 0,
        cash_in_hand: parseFloat(cashData.total_cash_received) || 0,
        bank_balances: 0,
        outstanding_receivables: parseFloat(cashData.outstanding_cash) || 0
      };
    } catch (error) {
      log.error('Error in getLiquidAssets:', error);
      throw error;
    }
  }

  static async getFixedAssetsValue(businessId, asOfDate) {
    try {
      const result = await query(
        `SELECT 
           category,
           COUNT(*) as asset_count,
           SUM(current_value) as total_value
         FROM fixed_assets 
         WHERE business_id = $1 
           AND is_active = true
           AND disposal_date IS NULL
         GROUP BY category`,
        [businessId]
      );

      const byCategory = {};
      let totalValue = 0;

      result.rows.forEach(row => {
        byCategory[row.category] = {
          count: parseInt(row.asset_count),
          current_value: parseFloat(row.total_value)
        };
        totalValue += parseFloat(row.total_value);
      });

      return {
        total_fixed_assets_value: totalValue,
        by_category: byCategory,
        asset_count: result.rows.reduce((sum, row) => sum + parseInt(row.asset_count), 0)
      };
    } catch (error) {
      log.error('Error in getFixedAssetsValue:', error);
      throw error;
    }
  }

  static async getEquipmentAssetsValue(businessId, asOfDate) {
    try {
      const result = await query(
        `SELECT 
           COUNT(*) as equipment_count,
           SUM(fa.current_value) as total_equipment_value
         FROM equipment_assets ea
         JOIN fixed_assets fa ON ea.asset_id = fa.id
         WHERE ea.business_id = $1 
           AND fa.is_active = true`,
        [businessId]
      );

      const equipmentData = result.rows[0];

      return {
        total_equipment_value: parseFloat(equipmentData.total_equipment_value) || 0,
        equipment_count: parseInt(equipmentData.equipment_count) || 0,
        by_category: {
          hire_equipment: {
            count: parseInt(equipmentData.equipment_count) || 0,
            value: parseFloat(equipmentData.total_equipment_value) || 0
          }
        }
      };
    } catch (error) {
      log.error('Error in getEquipmentAssetsValue:', error);
      throw error;
    }
  }

  static async getAccountsReceivable(businessId, asOfDate) {
    try {
      const result = await query(
        `SELECT 
           COUNT(*) as invoice_count,
           SUM(balance_due) as total_receivable
         FROM invoices 
         WHERE business_id = $1 
           AND status = 'sent'
           AND due_date <= $2`,
        [businessId, asOfDate]
      );

      const receivableData = result.rows[0];
      return {
        total_receivable: parseFloat(receivableData.total_receivable) || 0,
        invoice_count: parseInt(receivableData.invoice_count) || 0
      };
    } catch (error) {
      log.error('Error in getAccountsReceivable:', error);
      throw error;
    }
  }

  static async getMonthlyAppreciation(businessId) {
    try {
      const result = await query(
        `SELECT COALESCE(SUM(purchase_price), 0) as monthly_purchases
         FROM fixed_assets 
         WHERE business_id = $1 
           AND purchase_date >= CURRENT_DATE - INTERVAL '30 days'`,
        [businessId]
      );
      return parseFloat(result.rows[0].monthly_purchases) || 0;
    } catch (error) {
      log.error('Error in getMonthlyAppreciation:', error);
      return 0;
    }
  }

  static async getMonthlyDepreciation(businessId) {
    try {
      const result = await query(
        `SELECT COALESCE(SUM(depreciation_amount), 0) as monthly_depreciation
         FROM asset_depreciation 
         WHERE business_id = $1 
           AND period_date >= CURRENT_DATE - INTERVAL '30 days'`,
        [businessId]
      );
      return parseFloat(result.rows[0].monthly_depreciation) || 0;
    } catch (error) {
      log.error('Error in getMonthlyDepreciation:', error);
      return 0;
    }
  }
}
