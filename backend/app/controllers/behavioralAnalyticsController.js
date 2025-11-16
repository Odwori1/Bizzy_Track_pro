import { BehavioralAnalyticsService } from '../services/behavioralAnalyticsService.js';
import { log } from '../utils/logger.js';

export class BehavioralAnalyticsController {

  // Record customer behavior
  static async recordCustomerBehavior(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const eventData = req.body;

      log.info('Recording customer behavior', { businessId, userId, eventData: { customer_id: eventData.customer_id, event_type: eventData.event_type } });

      const behaviorEvent = await BehavioralAnalyticsService.recordCustomerBehavior(businessId, eventData, userId);

      res.status(201).json({
        success: true,
        message: 'Customer behavior recorded successfully',
        data: behaviorEvent
      });

    } catch (error) {
      log.error('Error recording customer behavior', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to record customer behavior',
        error: error.message
      });
    }
  }

  // Calculate customer LTV
  static async calculateCustomerLTV(req, res) {
    try {
      const businessId = req.user.businessId;
      const { customerId } = req.params;

      log.info('Calculating customer LTV', { businessId, customerId });

      const ltvData = await BehavioralAnalyticsService.calculateCustomerLTV(businessId, customerId);

      res.json({
        success: true,
        message: 'Customer LTV calculated successfully',
        data: ltvData
      });

    } catch (error) {
      log.error('Error calculating customer LTV', { error: error.message, businessId: req.user.businessId, customerId: req.params.customerId });
      res.status(500).json({
        success: false,
        message: 'Failed to calculate customer LTV',
        error: error.message
      });
    }
  }

  // Get customer insights
  static async getCustomerInsights(req, res) {
    try {
      const businessId = req.user.businessId;
      const { period } = req.query;

      log.info('Fetching customer insights', { businessId, period });

      const insights = await BehavioralAnalyticsService.getCustomerInsights(businessId, period);

      res.json({
        success: true,
        data: insights,
        count: insights.engagement_by_event_type ? insights.engagement_by_event_type.length : 0
      });

    } catch (error) {
      log.error('Error fetching customer insights', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customer insights',
        error: error.message
      });
    }
  }

  // Get customer LTV analysis
  static async getCustomerLTVAnalysis(req, res) {
    try {
      const businessId = req.user.businessId;

      log.info('Fetching customer LTV analysis', { businessId });

      const ltvAnalysis = await BehavioralAnalyticsService.getCustomerLTVAnalysis(businessId);

      res.json({
        success: true,
        data: ltvAnalysis,
        count: ltvAnalysis.length
      });

    } catch (error) {
      log.error('Error fetching customer LTV analysis', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customer LTV analysis',
        error: error.message
      });
    }
  }
}
