import { jobService } from '../services/jobService.js';
import { log } from '../utils/logger.js';

export const jobController = {
  async create(req, res, next) {
    try {
      const jobData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Creating job', {
        jobTitle: jobData.title,
        userId,
        businessId,
        isPackageJob: jobData.is_package_job || false
      });

      const newJob = await jobService.createJob(
        jobData,
        userId,
        businessId
      );

      res.status(201).json({
        success: true,
        message: jobData.is_package_job ? 'Package job created successfully' : 'Job created successfully',
        data: newJob
      });

    } catch (error) {
      log.error('Job creation controller error', error);
      next(error);
    }
  },

  async getAll(req, res, next) {
    try {
      const businessId = req.user.businessId;
      const { status, assigned_to, is_package_job } = req.query;

      log.info('Fetching all jobs', {
        businessId,
        filters: { status, assigned_to, is_package_job }
      });

      const options = {};
      if (status) options.status = status;
      if (assigned_to) options.assigned_to = assigned_to;
      if (is_package_job !== undefined) options.is_package_job = is_package_job === 'true';

      const jobs = await jobService.getAllJobs(businessId, options);

      res.json({
        success: true,
        data: jobs
      });

    } catch (error) {
      log.error('Jobs fetch controller error', error);
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId;

      log.info('Fetching job by ID', {
        jobId: id,
        businessId
      });

      const job = await jobService.getJobById(id, businessId);

      if (!job) {
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }

      res.json({
        success: true,
        data: job
      });

    } catch (error) {
      log.error('Job fetch by ID controller error', error);
      next(error);
    }
  },

  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const statusData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating job status', {
        jobId: id,
        newStatus: statusData.status,
        userId,
        businessId
      });

      const updatedJob = await jobService.updateJobStatus(
        id,
        statusData,
        userId,
        businessId
      );

      if (!updatedJob) {
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }

      res.json({
        success: true,
        message: 'Job status updated successfully',
        data: updatedJob
      });

    } catch (error) {
      log.error('Job status update controller error', error);
      next(error);
    }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Updating job', {
        jobId: id,
        userId,
        businessId
      });

      const updatedJob = await jobService.updateJob(
        id,
        updateData,
        userId,
        businessId
      );

      if (!updatedJob) {
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }

      res.json({
        success: true,
        message: 'Job updated successfully',
        data: updatedJob
      });

    } catch (error) {
      log.error('Job update controller error', error);
      next(error);
    }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const businessId = req.user.businessId;

      log.info('Deleting job', {
        jobId: id,
        userId,
        businessId
      });

      const deletedJob = await jobService.deleteJob(
        id,
        userId,
        businessId
      );

      if (!deletedJob) {
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }

      res.json({
        success: true,
        message: 'Job deleted successfully',
        data: deletedJob
      });

    } catch (error) {
      log.error('Job deletion controller error', error);
      next(error);
    }
  }
};
