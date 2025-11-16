import { AnalyticsService } from '../services/analyticsService.js';
import { log } from '../utils/logger.js';

export class AnalyticsController {

  // Create analytics dashboard
  static async createAnalyticsDashboard(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const dashboardData = req.body;

      log.info('Creating analytics dashboard', { businessId, userId, dashboardData: { name: dashboardData.name } });

      const dashboard = await AnalyticsService.createAnalyticsDashboard(businessId, dashboardData, userId);

      res.status(201).json({
        success: true,
        message: 'Analytics dashboard created successfully',
        data: dashboard
      });

    } catch (error) {
      log.error('Error creating analytics dashboard', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to create analytics dashboard',
        error: error.message
      });
    }
  }

  // Get analytics dashboards
  static async getAnalyticsDashboards(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      log.info('Fetching analytics dashboards', { businessId, filters });

      const dashboards = await AnalyticsService.getAnalyticsDashboards(businessId, filters);

      res.json({
        success: true,
        data: dashboards,
        count: dashboards.length
      });

    } catch (error) {
      log.error('Error fetching analytics dashboards', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch analytics dashboards',
        error: error.message
      });
    }
  }

  // Create customer segment
  static async createCustomerSegment(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const segmentData = req.body;

      log.info('Creating customer segment', { businessId, userId, segmentData: { name: segmentData.name } });

      const segment = await AnalyticsService.createCustomerSegment(businessId, segmentData, userId);

      res.status(201).json({
        success: true,
        message: 'Customer segment created successfully',
        data: segment
      });

    } catch (error) {
      log.error('Error creating customer segment', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to create customer segment',
        error: error.message
      });
    }
  }

  // Get customer segments
  static async getCustomerSegments(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      log.info('Fetching customer segments', { businessId, filters });

      const segments = await AnalyticsService.getCustomerSegments(businessId, filters);

      res.json({
        success: true,
        data: segments,
        count: segments.length
      });

    } catch (error) {
      log.error('Error fetching customer segments', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customer segments',
        error: error.message
      });
    }
  }

  // Get business overview
  static async getBusinessOverview(req, res) {
    try {
      const businessId = req.user.businessId;
      const { period } = req.query;

      log.info('Fetching business overview', { businessId, period });

      const overview = await AnalyticsService.getBusinessOverview(businessId, period);

      res.json({
        success: true,
        data: overview
      });

    } catch (error) {
      log.error('Error fetching business overview', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch business overview',
        error: error.message
      });
    }
  }

  // Create export job
  static async createExportJob(req, res) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const exportData = req.body;

      log.info('Creating export job', { businessId, userId, exportData: { export_type: exportData.export_type } });

      const exportJob = await AnalyticsService.createExportJob(businessId, exportData, userId);

      res.status(201).json({
        success: true,
        message: 'Export job created successfully',
        data: exportJob
      });

    } catch (error) {
      log.error('Error creating export job', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to create export job',
        error: error.message
      });
    }
  }

  // Get export jobs
  static async getExportJobs(req, res) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      log.info('Fetching export jobs', { businessId, filters });

      const exportJobs = await AnalyticsService.getExportJobs(businessId, filters);

      res.json({
        success: true,
        data: exportJobs,
        count: exportJobs.length
      });

    } catch (error) {
      log.error('Error fetching export jobs', { error: error.message, businessId: req.user.businessId });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch export jobs',
        error: error.message
      });
    }
  }
}
