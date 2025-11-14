import { PricingRuleService } from '../services/pricingRuleService.js';
import { log } from '../utils/logger.js';

export const pricingRuleController = {
  async create(req, res, next) {
    try {
      const ruleData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating pricing rule', {
        ruleName: ruleData.name,
        userId,
        businessId
      });

      const newRule = await PricingRuleService.createPricingRule(businessId, ruleData, userId);

      res.status(201).json({
        success: true,
        message: 'Pricing rule created successfully',
        data: newRule
      });

    } catch (error) {
      log.error('Pricing rule creation controller error', error);
      next(error);
    }
  },

  async getAll(req, res, next) {
    try {
      const businessId = req.user.businessId;

      log.info('Fetching all pricing rules', {
        businessId
      });

      const rules = await PricingRuleService.getPricingRules(businessId);

      res.json({
        success: true,
        data: rules,
        count: rules.length,
        message: 'Pricing rules fetched successfully'
      });

    } catch (error) {
      log.error('Pricing rules fetch controller error', error);
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      log.info('Fetching pricing rule by ID', {
        ruleId: id,
        businessId
      });

      const rule = await PricingRuleService.getPricingRuleById(businessId, id);

      if (!rule) {
        return res.status(404).json({
          success: false,
          message: 'Pricing rule not found'
        });
      }

      res.json({
        success: true,
        data: rule,
        message: 'Pricing rule fetched successfully'
      });

    } catch (error) {
      log.error('Pricing rule fetch by ID controller error', error);
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating pricing rule', {
        ruleId: id,
        userId,
        businessId
      });

      const updatedRule = await PricingRuleService.updatePricingRule(businessId, id, updateData, userId);

      if (!updatedRule) {
        return res.status(404).json({
          success: false,
          message: 'Pricing rule not found'
        });
      }

      res.json({
        success: true,
        message: 'Pricing rule updated successfully',
        data: updatedRule
      });

    } catch (error) {
      log.error('Pricing rule update controller error', error);
      next(error);
    }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Deleting pricing rule', {
        ruleId: id,
        userId,
        businessId
      });

      const deletedRule = await PricingRuleService.deletePricingRule(businessId, id, userId);

      if (!deletedRule) {
        return res.status(404).json({
          success: false,
          message: 'Pricing rule not found'
        });
      }

      res.json({
        success: true,
        message: 'Pricing rule deleted successfully',
        data: deletedRule
      });

    } catch (error) {
      log.error('Pricing rule deletion controller error', error);
      next(error);
    }
  },

  async evaluate(req, res, next) {
    try {
      const evaluationContext = req.body;
      const businessId = req.user.businessId;

      log.info('Evaluating pricing rules', {
        businessId,
        context: evaluationContext
      });

      const result = await PricingRuleService.evaluatePricingRules(businessId, evaluationContext);

      res.json({
        success: true,
        data: result,
        message: 'Pricing rules evaluated successfully'
      });

    } catch (error) {
      log.error('Pricing rules evaluation controller error', error);
      next(error);
    }
  },

  async evaluateWithABAC(req, res, next) {
    try {
      const pricingData = req.body;
      const businessId = req.user.businessId;
      const userId = req.user.userId;

      log.info('Evaluating pricing with ABAC rules', {
        businessId,
        userId,
        customer_category_id: pricingData.customer_category_id,
        service_id: pricingData.service_id,
        base_price: pricingData.base_price,
        quantity: pricingData.quantity || 1
      });

      const result = await PricingRuleService.evaluatePricingWithABAC(
        businessId,
        pricingData,
        userId
      );

      res.json({
        success: true,
        data: result.data,
        message: 'Pricing evaluation with ABAC completed successfully'
      });

    } catch (error) {
      log.error('ABAC pricing evaluation controller error', error);
      
      // Provide specific error response
      res.status(500).json({
        success: false,
        error: 'Failed to evaluate pricing with ABAC rules',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  async getStats(req, res, next) {
    try {
      const businessId = req.user.businessId;

      log.info('Fetching pricing rules statistics', {
        businessId
      });

      const stats = await PricingRuleService.getPricingStats(businessId);

      res.json({
        success: true,
        data: stats,
        message: 'Pricing rules statistics fetched successfully'
      });

    } catch (error) {
      log.error('Pricing rules stats fetch controller error', error);
      next(error);
    }
  },

  async getActiveRules(req, res, next) {
    try {
      const businessId = req.user.businessId;

      log.info('Fetching active pricing rules', {
        businessId
      });

      const result = await PricingRuleService.getPricingRules(businessId);
      const activeRules = result.filter(rule => rule.is_active === true);

      res.json({
        success: true,
        data: activeRules,
        count: activeRules.length,
        message: 'Active pricing rules fetched successfully'
      });

    } catch (error) {
      log.error('Active pricing rules fetch controller error', error);
      next(error);
    }
  },

  async bulkUpdateStatus(req, res, next) {
    try {
      const { rule_ids, is_active } = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Bulk updating pricing rule status', {
        businessId,
        userId,
        ruleCount: rule_ids?.length || 0,
        is_active
      });

      if (!rule_ids || !Array.isArray(rule_ids)) {
        return res.status(400).json({
          success: false,
          error: 'rule_ids must be an array of rule IDs'
        });
      }

      const updatePromises = rule_ids.map(ruleId => 
        PricingRuleService.updatePricingRule(businessId, ruleId, { is_active }, userId)
      );

      const results = await Promise.allSettled(updatePromises);
      
      const successfulUpdates = results.filter(result => result.status === 'fulfilled' && result.value).length;
      const failedUpdates = results.filter(result => result.status === 'rejected').length;

      log.info('Bulk update completed', {
        businessId,
        userId,
        successfulUpdates,
        failedUpdates
      });

      res.json({
        success: true,
        data: {
          total_rules: rule_ids.length,
          successful_updates: successfulUpdates,
          failed_updates: failedUpdates
        },
        message: `Successfully updated ${successfulUpdates} out of ${rule_ids.length} pricing rules`
      });

    } catch (error) {
      log.error('Pricing rules bulk update controller error', error);
      next(error);
    }
  }
};
