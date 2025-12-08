import { DepartmentPerformanceService } from '../services/departmentPerformanceService.js';
import { log } from '../utils/logger.js';

export const departmentPerformanceController = {
  async getDepartmentPerformance(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const filters = req.query;

      const performanceData = await DepartmentPerformanceService.getDepartmentPerformance(businessId, filters);

      res.json({
        success: true,
        data: performanceData,
        message: 'Department performance fetched successfully'
      });

    } catch (error) {
      log.error('Department performance fetch controller error', error);
      next(error);
    }
  },

  async getDepartmentPerformanceById(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { departmentId } = req.params;
      const filters = req.query;

      const performanceData = await DepartmentPerformanceService.getDepartmentPerformanceById(
        businessId, 
        departmentId, 
        filters
      );

      res.json({
        success: true,
        data: performanceData,
        message: 'Department performance details fetched successfully'
      });

    } catch (error) {
      log.error('Department performance details fetch controller error', error);
      next(error);
    }
  },

  async getDepartmentMetrics(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { period } = req.query;

      const metrics = await DepartmentPerformanceService.getDepartmentMetrics(businessId, period);

      res.json({
        success: true,
        data: metrics,
        message: 'Department metrics fetched successfully'
      });

    } catch (error) {
      log.error('Department metrics fetch controller error', error);
      next(error);
    }
  }
};
