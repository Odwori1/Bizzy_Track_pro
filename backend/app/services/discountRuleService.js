import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

export const discountRuleService = {
  async createDiscountRule(ruleData, userId, businessId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const createQuery = `
        INSERT INTO category_discount_rules
        (business_id, category_id, service_id, discount_type, discount_value,
         min_amount, max_discount, valid_from, valid_until, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const values = [
        businessId,
        ruleData.category_id,
        ruleData.service_id,
        ruleData.discount_type,
        ruleData.discount_value,
        ruleData.min_amount || 0,
        ruleData.max_discount || null,
        ruleData.valid_from || new Date(),
        ruleData.valid_until || null,
        userId
      ];

      const result = await client.query(createQuery, values);
      const newRule = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'discount_rule.created',
        resourceType: 'discount_rule',
        resourceId: newRule.id,
        newValues: newRule
      });

      await client.query('COMMIT');

      log.info('Discount rule created', { ruleId: newRule.id, businessId, userId });
      return newRule;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Discount rule creation failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getDiscountRules(businessId, options = {}) {
    const client = await getClient();
    try {
      let selectQuery = `
        SELECT
          dr.*,
          cc.name as category_name,
          s.name as service_name
        FROM category_discount_rules dr
        JOIN customer_categories cc ON dr.category_id = cc.id
        JOIN services s ON dr.service_id = s.id
        WHERE dr.business_id = $1
      `;

      const values = [businessId];
      let paramCount = 2;

      if (options.activeOnly) {
        selectQuery += ` AND dr.is_active = $${paramCount}`;
        values.push(true);
        paramCount++;
      }

      if (options.category_id) {
        selectQuery += ` AND dr.category_id = $${paramCount}`;
        values.push(options.category_id);
        paramCount++;
      }

      if (options.service_id) {
        selectQuery += ` AND dr.service_id = $${paramCount}`;
        values.push(options.service_id);
        paramCount++;
      }

      selectQuery += ` ORDER BY cc.name, s.name`;

      const result = await client.query(selectQuery, values);
      return result.rows;
    } catch (error) {
      log.error('Failed to fetch discount rules', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async calculateDiscount(customerCategoryId, serviceId, servicePrice) {
    const client = await getClient();
    try {
      const discountQuery = `
        SELECT discount_type, discount_value, max_discount, min_amount
        FROM category_discount_rules
        WHERE category_id = $1 AND service_id = $2
          AND is_active = true
          AND (valid_from IS NULL OR valid_from <= NOW())
          AND (valid_until IS NULL OR valid_until >= NOW())
        LIMIT 1
      `;

      const result = await client.query(discountQuery, [customerCategoryId, serviceId]);

      if (result.rows.length === 0) {
        return { discount: 0, finalPrice: servicePrice };
      }

      const rule = result.rows[0];
      let discount = 0;

      if (servicePrice >= rule.min_amount) {
        if (rule.discount_type === 'percentage') {
          discount = servicePrice * (rule.discount_value / 100);
          if (rule.max_discount) {
            discount = Math.min(discount, rule.max_discount);
          }
        } else {
          discount = rule.discount_value;
        }
      }

      const finalPrice = Math.max(0, servicePrice - discount);

      return {
        discount: parseFloat(discount.toFixed(2)),
        finalPrice: parseFloat(finalPrice.toFixed(2)),
        ruleApplied: rule
      };
    } catch (error) {
      log.error('Discount calculation failed', error);
      throw error;
    } finally {
      client.release();
    }
  }
};
