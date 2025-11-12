import { discountRuleService } from '../services/discountRuleService.js';
import { log } from '../utils/logger.js';

export const discountRuleController = {
  async create(req, res, next) {
    try {
      const ruleData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;
      
      const newRule = await discountRuleService.createDiscountRule(
        ruleData,
        userId,
        businessId
      );
      
      res.status(201).json({
        success: true,
        message: 'Discount rule created successfully',
        data: newRule
      });
    } catch (error) {
      log.error('Discount rule creation controller error', error);
      next(error);
    }
  },

  async getAll(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { activeOnly, category_id, service_id } = req.query;
      
      const options = {};
      if (activeOnly === 'true') options.activeOnly = true;
      if (category_id) options.category_id = category_id;
      if (service_id) options.service_id = service_id;
      
      const rules = await discountRuleService.getDiscountRules(businessId, options);
      
      res.json({
        success: true,
        data: rules
      });
    } catch (error) {
      log.error('Discount rules fetch controller error', error);
      next(error);
    }
  },

  async calculate(req, res, next) {
    try {
      const { category_id, service_id, service_price } = req.query;
      
      if (!category_id || !service_id || !service_price) {
        return res.status(400).json({
          success: false,
          message: 'category_id, service_id, and service_price are required'
        });
      }
      
      const result = await discountRuleService.calculateDiscount(
        category_id,
        service_id,
        parseFloat(service_price)
      );
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      log.error('Discount calculation controller error', error);
      next(error);
    }
  }
};
