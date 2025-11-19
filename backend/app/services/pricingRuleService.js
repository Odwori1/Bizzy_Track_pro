import { query, getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { PricingABACService } from './pricingABACService.js';

export class PricingRuleService {
  static async createPricingRule(businessId, ruleData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO pricing_rules (
          business_id, name, description, rule_type, conditions,
          adjustment_type, adjustment_value, target_entity, target_id,
          priority, is_active, valid_from, valid_until, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          businessId,
          ruleData.name,
          ruleData.description || '',
          ruleData.rule_type,
          JSON.stringify(ruleData.conditions || {}),
          ruleData.adjustment_type,
          ruleData.adjustment_value,
          ruleData.target_entity,
          ruleData.target_id,
          ruleData.priority || 50,
          ruleData.is_active !== false,
          ruleData.valid_from,
          ruleData.valid_until,
          userId
        ]
      );

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'pricing_rule.created',
        resourceType: 'pricing_rule',
        resourceId: result.rows[0].id,
        newValues: {
          name: ruleData.name,
          rule_type: ruleData.rule_type
        }
      });

      log.info('Pricing rule created', {
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

  static async getPricingRules(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT * FROM pricing_rules
         WHERE business_id = $1
         ORDER BY priority DESC, created_at DESC`,
        [businessId]
      );
      return result.rows;
    } catch (error) {
      log.error('Error getting pricing rules:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async getPricingRuleById(businessId, ruleId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT * FROM pricing_rules
         WHERE id = $1 AND business_id = $2`,
        [ruleId, businessId]
      );
      return result.rows[0];
    } catch (error) {
      log.error('Error getting pricing rule by ID:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async updatePricingRule(businessId, ruleId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const existingRule = await client.query(
        'SELECT * FROM pricing_rules WHERE id = $1 AND business_id = $2',
        [ruleId, businessId]
      );

      if (!existingRule.rows[0]) {
        throw new Error('Pricing rule not found');
      }

      const result = await client.query(
        `UPDATE pricing_rules
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             rule_type = COALESCE($3, rule_type),
             conditions = COALESCE($4, conditions),
             adjustment_type = COALESCE($5, adjustment_type),
             adjustment_value = COALESCE($6, adjustment_value),
             target_entity = COALESCE($7, target_entity),
             target_id = COALESCE($8, target_id),
             priority = COALESCE($9, priority),
             is_active = COALESCE($10, is_active),
             valid_from = COALESCE($11, valid_from),
             valid_until = COALESCE($12, valid_until),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $13 AND business_id = $14
         RETURNING *`,
        [
          updateData.name,
          updateData.description,
          updateData.rule_type,
          updateData.conditions ? JSON.stringify(updateData.conditions) : undefined,
          updateData.adjustment_type,
          updateData.adjustment_value,
          updateData.target_entity,
          updateData.target_id,
          updateData.priority,
          updateData.is_active,
          updateData.valid_from,
          updateData.valid_until,
          ruleId,
          businessId
        ]
      );

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'pricing_rule.updated',
        resourceType: 'pricing_rule',
        resourceId: ruleId,
        newValues: updateData
      });

      log.info('Pricing rule updated', {
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

  static async deletePricingRule(businessId, ruleId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        'DELETE FROM pricing_rules WHERE id = $1 AND business_id = $2 RETURNING *',
        [ruleId, businessId]
      );

      if (result.rows[0]) {
        await auditLogger.logAction({
          businessId,
          userId,
          action: 'pricing_rule.deleted',
          resourceType: 'pricing_rule',
          resourceId: ruleId,
          oldValues: {
            name: result.rows[0].name,
            rule_type: result.rows[0].rule_type
          }
        });

        log.info('Pricing rule deleted', {
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

  static async evaluatePricingRules(businessId, context) {
    const client = await getClient();
    try {
      const {
        customer_category_id,
        service_id,
        package_id,
        customer_id,
        quantity = 1,
        base_price,
        current_time = new Date()
      } = context;

      const rules = await client.query(
        `SELECT * FROM pricing_rules
         WHERE business_id = $1
           AND is_active = true
           AND (valid_from IS NULL OR valid_from <= $2)
           AND (valid_until IS NULL OR valid_until >= $2)
         ORDER BY priority DESC`,
        [businessId, current_time]
      );

      let finalPrice = base_price;
      let appliedRules = [];

      for (const rule of rules.rows) {
        if (this.doesRuleApply(rule, context)) {
          finalPrice = this.applyRule(rule, finalPrice);
          appliedRules.push({
            rule_id: rule.id,
            rule_name: rule.name,
            rule_type: rule.rule_type,
            adjustment_type: rule.adjustment_type,
            adjustment_value: rule.adjustment_value,
            new_price: finalPrice
          });
        }
      }

      return {
        original_price: base_price,
        final_price: finalPrice,
        applied_rules: appliedRules
      };
    } catch (error) {
      log.error('Error evaluating pricing rules:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async evaluatePricingWithABAC(businessId, pricingData, userId) {
    try {
      const { customer_category_id, service_id, base_price, quantity = 1 } = pricingData;

      log.info('Evaluating pricing with ABAC', {
        businessId,
        userId,
        customer_category_id,
        service_id,
        base_price,
        quantity
      });

      let abacContext;
      try {
        // Apply ABAC rules first
        abacContext = await PricingABACService.applyPricingRules(
          userId,
          businessId,
          base_price,
          customer_category_id,
          service_id
        );
      } catch (abacError) {
        log.error('ABAC service failed, using fallback:', abacError);
        abacContext = {
          base_price: base_price,
          final_price: base_price,
          adjustments: [],
          can_override: false,
          user_restrictions: true,
          abac_failed: true
        };
      }

      // Then apply standard pricing rules
      let ruleResult;
      try {
        ruleResult = await this.evaluatePricingRules(businessId, {
          customer_category_id,
          service_id,
          base_price: abacContext.final_price, // Use ABAC-adjusted price
          quantity
        });
      } catch (ruleError) {
        log.error('Pricing rules evaluation failed:', ruleError);
        ruleResult = {
          original_price: base_price,
          final_price: abacContext.final_price,
          applied_rules: []
        };
      }

      // Get user discount limit (with fallback)
      let userDiscountLimit = 20;
      try {
        userDiscountLimit = await PricingABACService.getUserDiscountLimit(userId, businessId);
      } catch (limitError) {
        log.error('Failed to get user discount limit:', limitError);
      }

      // Calculate total discount for approval check
      const totalDiscount = base_price - ruleResult.final_price;
      const totalDiscountPercentage = totalDiscount > 0 ? (totalDiscount / base_price) * 100 : 0;

      // Check if approval is required
      let approvalCheck;
      try {
        approvalCheck = await PricingABACService.checkDiscountApprovalRequired(
          userId,
          businessId,
          totalDiscountPercentage
        );
      } catch (approvalError) {
        log.error('Approval check failed:', approvalError);
        approvalCheck = {
          requires_approval: totalDiscountPercentage > userDiscountLimit,
          user_discount_limit: userDiscountLimit,
          exceeds_limit: totalDiscountPercentage > userDiscountLimit
        };
      }

      // Combine ABAC and pricing rule results
      const result = {
        success: true,
        data: {
          original_price: base_price,
          base_price_after_abac: abacContext.final_price,
          final_price: ruleResult.final_price,
          quantity,
          total_amount: ruleResult.final_price * quantity,
          adjustments: [
            ...abacContext.adjustments,
            ...ruleResult.applied_rules.map(rule => ({
              type: 'pricing_rule',
              rule_name: rule.rule_name,
              adjustment_type: rule.adjustment_type,
              value: rule.adjustment_value,
              amount: rule.new_price - (ruleResult.applied_rules.indexOf(rule) === 0 ? abacContext.final_price : ruleResult.applied_rules[ruleResult.applied_rules.indexOf(rule) - 1].new_price)
            }))
          ],
          applied_rules: ruleResult.applied_rules,
          abac_context: {
            can_override: abacContext.can_override,
            user_restrictions: abacContext.user_restrictions,
            user_discount_limit: userDiscountLimit,
            abac_failed: abacContext.abac_failed || false
          },
          summary: {
            total_discount: totalDiscount,
            total_discount_percentage: totalDiscountPercentage,
            requires_approval: approvalCheck
          }
        }
      };

      // Add warning if ABAC failed
      if (abacContext.abac_failed) {
        result.warning = 'ABAC evaluation partially failed, using fallback values';
      }

      log.info('ABAC pricing evaluation completed', {
        businessId,
        userId,
        originalPrice: base_price,
        finalPrice: ruleResult.final_price,
        totalDiscount: totalDiscount,
        abacFailed: abacContext.abac_failed || false
      });

      return result;
    } catch (error) {
      log.error('Critical error in evaluatePricingWithABAC:', error);

      // Ultimate fallback - return basic pricing without ABAC
      return {
        success: true,
        data: {
          original_price: pricingData.base_price,
          base_price_after_abac: pricingData.base_price,
          final_price: pricingData.base_price,
          quantity: pricingData.quantity || 1,
          total_amount: pricingData.base_price * (pricingData.quantity || 1),
          adjustments: [],
          applied_rules: [],
          abac_context: {
            can_override: false,
            user_restrictions: true,
            user_discount_limit: 20,
            abac_failed: true
          },
          summary: {
            total_discount: 0,
            total_discount_percentage: 0,
            requires_approval: {
              requires_approval: false,
              user_discount_limit: 20,
              exceeds_limit: false
            }
          }
        },
        warning: 'ABAC evaluation failed completely, using basic pricing'
      };
    }
  }

  static doesRuleApply(rule, context) {
    const conditions = rule.conditions || {};

    if (rule.rule_type === 'customer_category') {
      if (conditions.customer_category_id && conditions.customer_category_id !== context.customer_category_id) {
        return false;
      }
    }

    if (rule.rule_type === 'quantity') {
      if (conditions.min_quantity && context.quantity < conditions.min_quantity) {
        return false;
      }
      if (conditions.max_quantity && context.quantity > conditions.max_quantity) {
        return false;
      }
    }

    if (rule.rule_type === 'time_based') {
      if (conditions.day_of_week && conditions.day_of_week.length > 0) {
        const currentDay = new Date().getDay();
        if (!conditions.day_of_week.includes(currentDay)) {
          return false;
        }
      }
    }

    if (rule.target_entity === 'service' && rule.target_id && rule.target_id !== context.service_id) {
      return false;
    }
    if (rule.target_entity === 'package' && rule.target_id && rule.target_id !== context.package_id) {
      return false;
    }
    if (rule.target_entity === 'customer' && rule.target_id && rule.target_id !== context.customer_id) {
      return false;
    }

    return true;
  }

  static applyRule(rule, currentPrice) {
    switch (rule.adjustment_type) {
      case 'percentage':
        return currentPrice * (1 - rule.adjustment_value / 100);
      case 'fixed':
        return currentPrice - rule.adjustment_value;
      case 'override':
        return rule.adjustment_value;
      default:
        return currentPrice;
    }
  }

  static async getPricingStats(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT
           COUNT(*) as total_rules,
           COUNT(*) FILTER (WHERE is_active = true) as active_rules,
           COUNT(*) FILTER (WHERE is_active = false) as inactive_rules,
           COUNT(*) FILTER (WHERE rule_type = 'customer_category') as customer_category_rules,
           COUNT(*) FILTER (WHERE rule_type = 'quantity') as quantity_rules,
           COUNT(*) FILTER (WHERE rule_type = 'time_based') as time_based_rules
         FROM pricing_rules
         WHERE business_id = $1`,
        [businessId]
      );

      return result.rows[0];
    } catch (error) {
      log.error('Error getting pricing stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
