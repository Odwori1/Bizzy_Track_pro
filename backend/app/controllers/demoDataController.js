import { demoDataService } from '../services/demoDataService.js';
import { log } from '../utils/logger.js';

export const demoDataController = {
  /**
   * Generate comprehensive demo data for the current business
   */
  async generateDemoData(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Only owners can generate demo data
      if (userRole !== 'owner') {
        return res.status(403).json({
          success: false,
          error: 'Only business owners can generate demo data'
        });
      }

      const {
        customers_count = 10,
        services_count = 8,
        jobs_count = 15,
        invoices_count = 12,
        include_staff = true
      } = req.body;

      log.info('Generating demo data', {
        businessId,
        userId,
        options: {
          customers_count,
          services_count,
          jobs_count,
          invoices_count,
          include_staff
        }
      });

      const options = {
        customersCount: parseInt(customers_count),
        servicesCount: parseInt(services_count),
        jobsCount: parseInt(jobs_count),
        invoicesCount: parseInt(invoices_count),
        includeStaff: include_staff !== false
      };

      // Validate counts
      if (options.customersCount < 1 || options.customersCount > 100) {
        return res.status(400).json({
          success: false,
          error: 'Customers count must be between 1 and 100'
        });
      }

      if (options.servicesCount < 1 || options.servicesCount > 20) {
        return res.status(400).json({
          success: false,
          error: 'Services count must be between 1 and 20'
        });
      }

      if (options.jobsCount < 1 || options.jobsCount > 50) {
        return res.status(400).json({
          success: false,
          error: 'Jobs count must be between 1 and 50'
        });
      }

      if (options.invoicesCount < 1 || options.invoicesCount > 30) {
        return res.status(400).json({
          success: false,
          error: 'Invoices count must be between 1 and 30'
        });
      }

      const results = await demoDataService.generateDemoData(businessId, userId, options);

      res.json({
        success: true,
        message: 'Demo data generated successfully',
        data: {
          summary: {
            customers: results.customers.length,
            services: results.services.length,
            jobs: results.jobs.length,
            invoices: results.invoices.length,
            staff: results.staff.length,
            categories: results.categories.length
          },
          generated_at: new Date().toISOString()
        }
      });

    } catch (error) {
      log.error('Demo data generation controller error', error);
      next(error);
    }
  },

  /**
   * Clean up all demo data for the current business
   */
  async cleanupDemoData(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Only owners can clean up demo data
      if (userRole !== 'owner') {
        return res.status(403).json({
          success: false,
          error: 'Only business owners can clean up demo data'
        });
      }

      log.info('Cleaning up demo data', {
        businessId,
        userId
      });

      const results = await demoDataService.cleanupDemoData(businessId, userId);

      res.json({
        success: true,
        message: 'Demo data cleaned up successfully',
        data: {
          deleted_records: results.deletedCount,
          cleaned_at: new Date().toISOString()
        }
      });

    } catch (error) {
      log.error('Demo data cleanup controller error', error);
      next(error);
    }
  },

  /**
   * Get demo data generation options and limits
   */
  async getDemoDataOptions(req, res, next) {
    try {
      res.json({
        success: true,
        data: {
          options: {
            customers_count: {
              min: 1,
              max: 100,
              default: 10,
              description: 'Number of demo customers to generate'
            },
            services_count: {
              min: 1,
              max: 20,
              default: 8,
              description: 'Number of demo services to generate'
            },
            jobs_count: {
              min: 1,
              max: 50,
              default: 15,
              description: 'Number of demo jobs to generate'
            },
            invoices_count: {
              min: 1,
              max: 30,
              default: 12,
              description: 'Number of demo invoices to generate'
            },
            include_staff: {
              default: true,
              description: 'Whether to generate demo staff users'
            }
          },
          notes: [
            'Demo data includes realistic customer information, services, jobs, and invoices',
            'All generated data will have proper timezone-aware timestamps',
            'Staff users will have password: demo123',
            'Only business owners can generate or clean up demo data'
          ]
        }
      });

    } catch (error) {
      log.error('Demo data options controller error', error);
      next(error);
    }
  }
};
