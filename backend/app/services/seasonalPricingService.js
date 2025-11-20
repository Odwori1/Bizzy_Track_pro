import { query, getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class SeasonalPricingService {
  static async createSeasonalPricing(businessId, ruleData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO seasonal_pricing (
          business_id, name, description, start_date, end_date,
          is_recurring, recurrence_type, adjustment_type, adjustment_value,
          target_type, target_id, target_name, min_order_amount,
          applies_to_new_customers, applies_to_existing_customers,
          is_active, priority, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *`,
        [
          businessId,
          ruleData.name,
          ruleData.description || '',
          ruleData.start_date,
          ruleData.end_date,
          ruleData.is_recurring || false,
          ruleData.recurrence_type,
          ruleData.adjustment_type,
          ruleData.adjustment_value,
          ruleData.target_type,
          ruleData.target_id,
          ruleData.target_name,
          ruleData.min_order_amount,
          ruleData.applies_to_new_customers !== false,
          ruleData.applies_to_existing_customers !== false,
          ruleData.is_active !== false,
          ruleData.priority || 50,
          userId
        ]
      );

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'seasonal_pricing.created',
        resourceType: 'seasonal_pricing',
        resourceId: result.rows[0].id,
        newValues: {
          name: ruleData.name,
          target_type: ruleData.target_type
        }
      });

      log.info('Seasonal pricing rule created', {
        businessId,
        userId,
        ruleId: result.rows[0].id,
        rule_name: ruleData.name
      });

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getSeasonalPricingRules(businessId, filters = {}) {
    const client = await getClient();
    try {
      let queryStr = `SELECT * FROM seasonal_pricing WHERE business_id = $1`;
      const params = [businessId];
      let paramCount = 2;

      if (filters.activeOnly) {
        queryStr += ` AND is_active = true`;
      }

      if (filters.current) {
        queryStr += ` AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE`;
      }

      if (filters.upcoming) {
        queryStr += ` AND start_date > CURRENT_DATE`;
      }

      queryStr += ` ORDER BY priority DESC, start_date ASC`;

      const result = await client.query(queryStr, params);
      return result.rows;
    } catch (error) {
      log.error('Error getting seasonal pricing rules:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async getSeasonalPricingById(businessId, ruleId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT * FROM seasonal_pricing
         WHERE id = $1 AND business_id = $2`,
        [ruleId, businessId]
      );
      return result.rows[0];
    } catch (error) {
      log.error('Error getting seasonal pricing rule by ID:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateSeasonalPricing(businessId, ruleId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const existingRule = await client.query(
        'SELECT * FROM seasonal_pricing WHERE id = $1 AND business_id = $2',
        [ruleId, businessId]
      );

      if (!existingRule.rows[0]) {
        throw new Error('Seasonal pricing rule not found');
      }

      const result = await client.query(
        `UPDATE seasonal_pricing
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             start_date = COALESCE($3, start_date),
             end_date = COALESCE($4, end_date),
             is_recurring = COALESCE($5, is_recurring),
             recurrence_type = COALESCE($6, recurrence_type),
             adjustment_type = COALESCE($7, adjustment_type),
             adjustment_value = COALESCE($8, adjustment_value),
             target_type = COALESCE($9, target_type),
             target_id = COALESCE($10, target_id),
             target_name = COALESCE($11, target_name),
             min_order_amount = COALESCE($12, min_order_amount),
             applies_to_new_customers = COALESCE($13, applies_to_new_customers),
             applies_to_existing_customers = COALESCE($14, applies_to_existing_customers),
             is_active = COALESCE($15, is_active),
             priority = COALESCE($16, priority),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $17 AND business_id = $18
         RETURNING *`,
        [
          updateData.name,
          updateData.description,
          updateData.start_date,
          updateData.end_date,
          updateData.is_recurring,
          updateData.recurrence_type,
          updateData.adjustment_type,
          updateData.adjustment_value,
          updateData.target_type,
          updateData.target_id,
          updateData.target_name,
          updateData.min_order_amount,
          updateData.applies_to_new_customers,
          updateData.applies_to_existing_customers,
          updateData.is_active,
          updateData.priority,
          ruleId,
          businessId
        ]
      );

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'seasonal_pricing.updated',
        resourceType: 'seasonal_pricing',
        resourceId: ruleId,
        newValues: updateData
      });

      log.info('Seasonal pricing rule updated', {
        businessId,
        userId,
        ruleId: ruleId
      });

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async deleteSeasonalPricing(businessId, ruleId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        'DELETE FROM seasonal_pricing WHERE id = $1 AND business_id = $2 RETURNING *',
        [ruleId, businessId]
      );

      if (result.rows[0]) {
        await auditLogger.logAction({
          businessId,
          userId,
          action: 'seasonal_pricing.deleted',
          resourceType: 'seasonal_pricing',
          resourceId: ruleId,
          oldValues: {
            name: result.rows[0].name,
            target_type: result.rows[0].target_type
          }
        });

        log.info('Seasonal pricing rule deleted', {
          businessId,
          userId,
          ruleId: ruleId,
          rule_name: result.rows[0].name
        });
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getActiveSeasonalPricingForService(businessId, serviceId, date = new Date()) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT * FROM get_current_seasonal_pricing($1, $2, $3)`,
        [businessId, serviceId, date]
      );
      return result.rows;
    } catch (error) {
      log.error('Error getting active seasonal pricing for service:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async bulkUpdateSeasonalPricingStatus(businessId, ruleIds, isActive, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE seasonal_pricing 
         SET is_active = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($2) AND business_id = $3
         RETURNING id, name, is_active`,
        [isActive, ruleIds, businessId]
      );

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'seasonal_pricing.bulk_updated',
        resourceType: 'seasonal_pricing',
        resourceId: null,
        newValues: {
          rule_ids: ruleIds,
          is_active: isActive,
          updated_count: result.rows.length
        }
      });

      log.info('Seasonal pricing rules bulk status updated', {
        businessId,
        userId,
        ruleCount: result.rows.length,
        isActive: isActive
      });

      await client.query('COMMIT');
      return result.rows;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getSeasonalPricingStats(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT
           COUNT(*) as total_rules,
           COUNT(*) FILTER (WHERE is_active = true) as active_rules,
           COUNT(*) FILTER (WHERE is_active = false) as inactive_rules,
           COUNT(*) FILTER (WHERE start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE) as current_rules,
           COUNT(*) FILTER (WHERE start_date > CURRENT_DATE) as upcoming_rules,
           COUNT(*) FILTER (WHERE end_date < CURRENT_DATE) as expired_rules,
           COUNT(*) FILTER (WHERE is_recurring = true) as recurring_rules,
           COUNT(*) FILTER (WHERE target_type = 'all_services') as all_services_rules,
           COUNT(*) FILTER (WHERE target_type = 'specific_service') as specific_service_rules,
           COUNT(*) FILTER (WHERE target_type = 'category') as category_rules
         FROM seasonal_pricing
         WHERE business_id = $1`,
        [businessId]
      );

      return result.rows[0];
    } catch (error) {
      log.error('Error getting seasonal pricing stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async evaluateSeasonalPricing(businessId, evaluationData) {
    const client = await getClient();
    try {
      const {
        service_id,
        base_price,
        quantity = 1,
        evaluation_date = new Date(),
        customer_is_new = false
      } = evaluationData;

      const seasonalRules = await this.getActiveSeasonalPricingForService(
        businessId, 
        service_id, 
        evaluation_date
      );

      let adjustedPrice = base_price;
      let appliedRules = [];

      for (const rule of seasonalRules) {
        // Check customer type restrictions
        if (customer_is_new && !true) {
          continue;
        }
        if (!customer_is_new && !true) {
          continue;
        }

        // Apply the pricing adjustment
        const originalPrice = adjustedPrice;
        adjustedPrice = this.applySeasonalAdjustment(rule, adjustedPrice);
        
        appliedRules.push({
          rule_id: rule.seasonal_pricing_id,
          rule_name: rule.rule_name,
          adjustment_type: rule.adjustment_type,
          adjustment_value: rule.adjustment_value,
          original_price: originalPrice,
          new_price: adjustedPrice
        });
      }

      return {
        original_price: base_price,
        final_price: adjustedPrice,
        total_adjustment: base_price - adjustedPrice,
        adjustment_percentage: ((base_price - adjustedPrice) / base_price) * 100,
        applied_rules: appliedRules,
        seasonal_rules_count: appliedRules.length
      };
    } catch (error) {
      log.error('Error evaluating seasonal pricing:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static applySeasonalAdjustment(rule, currentPrice) {
    switch (rule.adjustment_type) {
      case 'percentage':
        return currentPrice * (1 - rule.adjustment_value / 100);
      case 'fixed':
        return Math.max(0, currentPrice - rule.adjustment_value);
      case 'override':
        return rule.adjustment_value;
      default:
        return currentPrice;
    }
  }
}
