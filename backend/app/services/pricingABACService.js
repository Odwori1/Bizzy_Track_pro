import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';

export class PricingABACService {
  /**
   * Check if user has permission to override pricing with fallback
   */
  static async canOverridePricing(userId, businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT up.value as can_override
         FROM user_permissions up
         JOIN permissions p ON up.permission_id = p.id
         WHERE up.user_id = $1
           AND up.business_id = $2
           AND p.name = 'pricing:override'
           AND up.value = 'true'`,
        [userId, businessId]
      );

      return result.rows.length > 0;
    } catch (error) {
      log.error('Error checking pricing override permission:', error);

      // Fallback: Only owners can override pricing by default
      const fallbackResult = await client.query(
        'SELECT role FROM users WHERE id = $1 AND business_id = $2',
        [userId, businessId]
      );

      if (fallbackResult.rows.length > 0) {
        return fallbackResult.rows[0].role === 'owner';
      }

      return false; // Default to no override permission
    } finally {
      client.release();
    }
  }

  /**
   * Check if user has permission to approve discounts with fallback
   */
  static async canApproveDiscounts(userId, businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT up.value as can_approve
         FROM user_permissions up
         JOIN permissions p ON up.permission_id = p.id
         WHERE up.user_id = $1
           AND up.business_id = $2
           AND p.name = 'discount:approve'
           AND up.value = 'true'`,
        [userId, businessId]
      );

      return result.rows.length > 0;
    } catch (error) {
      log.error('Error checking discount approval permission:', error);

      // Fallback: Owners and managers can approve by default
      const fallbackResult = await client.query(
        'SELECT role FROM users WHERE id = $1 AND business_id = $2',
        [userId, businessId]
      );

      if (fallbackResult.rows.length > 0) {
        const role = fallbackResult.rows[0].role;
        return role === 'owner' || role === 'manager';
      }

      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Get user's maximum discount approval limit with fallback
   */
  static async getUserDiscountLimit(userId, businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT up.value as discount_limit
         FROM user_permissions up
         JOIN permissions p ON up.permission_id = p.id
         WHERE up.user_id = $1
           AND up.business_id = $2
           AND p.name = 'discount:limit'`,
        [userId, businessId]
      );

      if (result.rows.length > 0) {
        return parseFloat(result.rows[0].discount_limit) || 20; // Default 20%
      }

      return 20; // Default limit if no specific permission
    } catch (error) {
      log.error('Error getting user discount limit:', error);

      // Fallback: Role-based default limits
      const fallbackResult = await client.query(
        'SELECT role FROM users WHERE id = $1 AND business_id = $2',
        [userId, businessId]
      );

      if (fallbackResult.rows.length > 0) {
        const role = fallbackResult.rows[0].role;
        switch (role) {
          case 'owner': return 50; // Owners can approve up to 50%
          case 'manager': return 30; // Managers up to 30%
          case 'staff': return 20; // Staff up to 20%
          default: return 20;
        }
      }

      return 20; // Default fallback
    } finally {
      client.release();
    }
  }

  /**
   * Check if discount requires approval based on user's permissions
   */
  static async checkDiscountApprovalRequired(userId, businessId, discountPercentage) {
    try {
      const userLimit = await this.getUserDiscountLimit(userId, businessId);
      const requiresApproval = discountPercentage > userLimit;

      log.info('Discount approval check', {
        userId,
        businessId,
        discountPercentage,
        userLimit,
        requiresApproval
      });

      return {
        requires_approval: requiresApproval,
        user_discount_limit: userLimit,
        exceeds_limit: requiresApproval
      };
    } catch (error) {
      log.error('Error in discount approval check:', error);
      return {
        requires_approval: discountPercentage > 20, // Fallback to 20%
        user_discount_limit: 20,
        exceeds_limit: discountPercentage > 20
      };
    }
  }

  /**
   * Apply ABAC rules to pricing calculation with robust error handling
   */
  static async applyPricingRules(userId, businessId, basePrice, customerCategoryId, serviceId) {
    try {
      const canOverride = await this.canOverridePricing(userId, businessId);

      // If user can override pricing, they can bypass some restrictions
      const pricingContext = {
        base_price: basePrice,
        final_price: basePrice,
        adjustments: [],
        can_override: canOverride,
        user_restrictions: !canOverride
      };

      // Apply customer category discounts if user cannot override
      if (!canOverride && customerCategoryId) {
        try {
          const categoryDiscount = await this.getCategoryDiscount(businessId, customerCategoryId);
          if (categoryDiscount && categoryDiscount > 0) {
            const discountAmount = basePrice * (categoryDiscount / 100);
            pricingContext.final_price = basePrice - discountAmount;
            pricingContext.adjustments.push({
              type: 'customer_category_discount',
              value: categoryDiscount,
              amount: discountAmount
            });
          }
        } catch (error) {
          log.error('Error applying category discount:', error);
          // Continue without category discount
        }
      }

      log.info('ABAC pricing rules applied', {
        userId,
        businessId,
        basePrice,
        finalPrice: pricingContext.final_price,
        canOverride
      });

      return pricingContext;
    } catch (error) {
      log.error('Error applying ABAC pricing rules:', error);
      // Return base price if ABAC fails completely
      return {
        base_price: basePrice,
        final_price: basePrice,
        adjustments: [],
        can_override: false,
        user_restrictions: true,
        abac_failed: true
      };
    }
  }

  /**
   * Get customer category discount percentage with error handling
   */
  static async getCategoryDiscount(businessId, customerCategoryId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT discount_percentage
         FROM customer_categories
         WHERE id = $1 AND business_id = $2`,
        [customerCategoryId, businessId]
      );

      return result.rows[0]?.discount_percentage || 0;
    } catch (error) {
      log.error('Error getting category discount:', error);
      return 0;
    } finally {
      client.release();
    }
  }

  /**
   * Simple permission check without complex joins (for better performance)
   */
  static async hasSimplePermission(userId, businessId, permissionName) {
    const client = await getClient();
    try {
      // Simplified query for better performance
      const result = await client.query(
        `SELECT 1 FROM user_permissions up
         WHERE up.user_id = $1
           AND up.business_id = $2
           AND up.permission_id IN (
             SELECT id FROM permissions WHERE name = $3
           )
           AND up.value = 'true'
         LIMIT 1`,
        [userId, businessId, permissionName]
      );

      return result.rows.length > 0;
    } catch (error) {
      log.error(`Error checking permission ${permissionName}:`, error);
      return false;
    } finally {
      client.release();
    }
  }
}
