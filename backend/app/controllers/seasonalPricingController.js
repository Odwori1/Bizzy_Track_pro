import { SeasonalPricingService } from '../services/seasonalPricingService.js';
import { log } from '../utils/logger.js';

export const seasonalPricingController = {
  async create(req, res, next) {
    try {
      const ruleData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating seasonal pricing rule', {
        ruleName: ruleData.name,
        userId,
        businessId
      });

      const newRule = await SeasonalPricingService.createSeasonalPricing(businessId, ruleData, userId);

      res.status(201).json({
        success: true,
        message: 'Seasonal pricing rule created successfully',
        data: newRule
      });

    } catch (error) {
      log.error('Seasonal pricing rule creation controller error', error);
      next(error);
    }
  },

  async getAll(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { active_only, upcoming, current } = req.query;

      log.info('Fetching seasonal pricing rules', {
        businessId,
        filters: { active_only, upcoming, current }
      });

      const rules = await SeasonalPricingService.getSeasonalPricingRules(businessId, {
        activeOnly: active_only === 'true',
        upcoming: upcoming === 'true',
        current: current === 'true'
      });

      res.json({
        success: true,
        data: rules,
        count: rules.length,
        message: 'Seasonal pricing rules fetched successfully'
      });

    } catch (error) {
      log.error('Seasonal pricing rules fetch controller error', error);
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      log.info('Fetching seasonal pricing rule by ID', {
        ruleId: id,
        businessId
      });

      const rule = await SeasonalPricingService.getSeasonalPricingById(businessId, id);

      if (!rule) {
        return res.status(404).json({
          success: false,
          message: 'Seasonal pricing rule not found'
        });
      }

      res.json({
        success: true,
        data: rule,
        message: 'Seasonal pricing rule fetched successfully'
      });

    } catch (error) {
      log.error('Seasonal pricing rule fetch by ID controller error', error);
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating seasonal pricing rule', {
        ruleId: id,
        userId,
        businessId
      });

      const updatedRule = await SeasonalPricingService.updateSeasonalPricing(businessId, id, updateData, userId);

      if (!updatedRule) {
        return res.status(404).json({
          success: false,
          message: 'Seasonal pricing rule not found'
        });
      }

      res.json({
        success: true,
        message: 'Seasonal pricing rule updated successfully',
        data: updatedRule
      });

    } catch (error) {
      log.error('Seasonal pricing rule update controller error', error);
      next(error);
    }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Deleting seasonal pricing rule', {
        ruleId: id,
        userId,
        businessId
      });

      const deletedRule = await SeasonalPricingService.deleteSeasonalPricing(businessId, id, userId);

      if (!deletedRule) {
        return res.status(404).json({
          success: false,
          message: 'Seasonal pricing rule not found'
        });
      }

      res.json({
        success: true,
        message: 'Seasonal pricing rule deleted successfully',
        data: deletedRule
      });

    } catch (error) {
      log.error('Seasonal pricing rule deletion controller error', error);
      next(error);
    }
  },

  async getActiveForService(req, res, next) {
    try {
      const { serviceId } = req.params;
      const businessId = req.user.businessId;
      const { date } = req.query;

      log.info('Getting active seasonal pricing for service', {
        serviceId,
        businessId,
        date
      });

      const activeRules = await SeasonalPricingService.getActiveSeasonalPricingForService(
        businessId, 
        serviceId, 
        date ? new Date(date) : new Date()
      );

      res.json({
        success: true,
        data: activeRules,
        message: 'Active seasonal pricing rules fetched successfully'
      });

    } catch (error) {
      log.error('Active seasonal pricing fetch controller error', error);
      next(error);
    }
  },

  async bulkUpdateStatus(req, res, next) {
    try {
      const { rule_ids, is_active } = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Bulk updating seasonal pricing rule status', {
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

      const results = await SeasonalPricingService.bulkUpdateSeasonalPricingStatus(
        businessId, 
        rule_ids, 
        is_active, 
        userId
      );

      res.json({
        success: true,
        data: results,
        message: `Seasonal pricing rules status updated successfully`
      });

    } catch (error) {
      log.error('Seasonal pricing rules bulk update controller error', error);
      next(error);
    }
  },

  async getStats(req, res, next) {
    try {
      const businessId = req.user.businessId;

      log.info('Fetching seasonal pricing statistics', {
        businessId
      });

      const stats = await SeasonalPricingService.getSeasonalPricingStats(businessId);

      res.json({
        success: true,
        data: stats,
        message: 'Seasonal pricing statistics fetched successfully'
      });

    } catch (error) {
      log.error('Seasonal pricing stats fetch controller error', error);
      next(error);
    }
  },

  async evaluateSeasonalPricing(req, res, next) {
    try {
      const evaluationData = req.body;
      const businessId = req.user.businessId;

      log.info('Evaluating seasonal pricing', {
        businessId,
        evaluationData
      });

      const result = await SeasonalPricingService.evaluateSeasonalPricing(businessId, evaluationData);

      res.json({
        success: true,
        data: result,
        message: 'Seasonal pricing evaluation completed successfully'
      });

    } catch (error) {
      log.error('Seasonal pricing evaluation controller error', error);
      next(error);
    }
  }
};
