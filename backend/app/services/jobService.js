import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

// Helper function to set RLS context on a client
const setRLSContext = async (client, businessId, userId) => {
  if (!businessId || typeof businessId !== 'string') {
    throw new Error('Invalid businessId for RLS context');
  }

  await client.query(`SET app.current_business_id = '${businessId}'`);

  if (userId && typeof userId === 'string') {
    await client.query(`SET app.current_user_id = '${userId}'`);
  }
};

export const jobService = {
  async createJob(jobData, userId, businessId) {
    const client = await getClient();
    try {
      // SET RLS CONTEXT FIRST
      await setRLSContext(client, businessId, userId);

      await client.query('BEGIN');

      let service = null;
      let finalPrice = 0;
      let totalDuration = 0;

      // Handle single service jobs (existing functionality)
      if (jobData.service_id && !jobData.is_package_job) {
        // Get service details for pricing
        const serviceQuery = `
          SELECT base_price, name, duration_minutes
          FROM services
          WHERE id = $1 AND business_id = $2
        `;
        const serviceResult = await client.query(serviceQuery, [jobData.service_id, businessId]);

        if (serviceResult.rows.length === 0) {
          throw new Error('Service not found');
        }

        service = serviceResult.rows[0];
        finalPrice = service.base_price - (jobData.discount_amount || 0);
        totalDuration = service.duration_minutes;
      }
      // Handle package jobs (new functionality)
      else if (jobData.is_package_job && jobData.package_id) {
        // Verify package exists and get details
        const packageQuery = `
          SELECT name, base_price, duration_minutes
          FROM service_packages
          WHERE id = $1 AND business_id = $2
        `;
        const packageResult = await client.query(packageQuery, [jobData.package_id, businessId]);

        if (packageResult.rows.length === 0) {
          throw new Error('Package not found');
        }

        const packageData = packageResult.rows[0];
        service = { name: packageData.name, base_price: packageData.base_price };
        finalPrice = packageData.base_price - (jobData.discount_amount || 0);
        totalDuration = packageData.duration_minutes;
      } else {
        throw new Error('Either service_id or package_id with is_package_job must be provided');
      }

      // Generate job number
      const jobNumberQuery = `
        SELECT COUNT(*) as job_count
        FROM jobs
        WHERE business_id = $1
      `;
      const countResult = await client.query(jobNumberQuery, [businessId]);
      const jobNumber = `JOB-${(parseInt(countResult.rows[0].job_count) + 1).toString().padStart(3, '0')}`;

      const createQuery = `
        INSERT INTO jobs (
          business_id, job_number, title, description, customer_id, service_id,
          package_id, is_package_job, package_configuration,
          scheduled_date, estimated_duration_minutes, base_price, final_price,
          discount_amount, priority, assigned_to, created_by, location
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *
      `;

      const values = [
        businessId,
        jobNumber,
        jobData.title,
        jobData.description || '',
        jobData.customer_id,
        jobData.service_id || null, // Can be null for package jobs
        jobData.package_id || null, // Can be null for single service jobs
        jobData.is_package_job || false,
        jobData.package_configuration || null,
        jobData.scheduled_date || null,
        jobData.estimated_duration_minutes || totalDuration,
        service.base_price,
        finalPrice,
        jobData.discount_amount || 0,
        jobData.priority || 'medium',
        jobData.assigned_to || null,
        userId,
        jobData.location || null
      ];

      const result = await client.query(createQuery, values);
      const newJob = result.rows[0];

      // Create job services for package jobs
      if (jobData.is_package_job && jobData.job_services && jobData.job_services.length > 0) {
        for (const jobService of jobData.job_services) {
          const serviceDetailQuery = `
            SELECT base_price, duration_minutes, name
            FROM services
            WHERE id = $1 AND business_id = $2
          `;
          const serviceDetailResult = await client.query(serviceDetailQuery, [jobService.service_id, businessId]);
          
          if (serviceDetailResult.rows.length === 0) {
            throw new Error(`Service ${jobService.service_id} not found`);
          }

          const serviceDetail = serviceDetailResult.rows[0];
          const unitPrice = jobService.unit_price || serviceDetail.base_price;
          const quantity = jobService.quantity || 1;

          const jobServiceQuery = `
            INSERT INTO job_services (
              job_id, service_id, quantity, unit_price, total_price,
              estimated_duration_minutes, sequence_order
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `;

          await client.query(jobServiceQuery, [
            newJob.id,
            jobService.service_id,
            quantity,
            unitPrice,
            unitPrice * quantity,
            serviceDetail.duration_minutes * quantity,
            jobService.sequence_order || 0
          ]);
        }
      }

      // Create initial status history
      const statusHistoryQuery = `
        INSERT INTO job_status_history (job_id, from_status, to_status, changed_by)
        VALUES ($1, NULL, $2, $3)
      `;
      await client.query(statusHistoryQuery, [newJob.id, 'pending', userId]);

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'job.created',
        resourceType: 'job',
        resourceId: newJob.id,
        newValues: newJob
      });

      await client.query('COMMIT');

      log.info('Job created successfully', {
        jobId: newJob.id,
        jobNumber: newJob.job_number,
        businessId,
        userId,
        isPackageJob: newJob.is_package_job
      });

      // Return the complete job with services if it's a package job
      return await this.getJobById(newJob.id, businessId);

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Job creation failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getAllJobs(businessId, options = {}) {
    const client = await getClient();
    try {
      // SET RLS CONTEXT FIRST
      await setRLSContext(client, businessId);

      let selectQuery = `
        SELECT
          j.*,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name,
          c.email as customer_email,
          c.phone as customer_phone,
          s.name as service_name,
          s.base_price as service_base_price,
          u.full_name as assigned_to_name,
          sp.name as package_name
        FROM jobs j
        LEFT JOIN customers c ON j.customer_id = c.id
        LEFT JOIN services s ON j.service_id = s.id
        LEFT JOIN users u ON j.assigned_to = u.id
        LEFT JOIN service_packages sp ON j.package_id = sp.id
        WHERE j.business_id = $1
      `;

      const values = [businessId];
      let paramCount = 2;

      // Filter by status if provided
      if (options.status) {
        selectQuery += ` AND j.status = $${paramCount}`;
        values.push(options.status);
        paramCount++;
      }

      // Filter by assigned_to if provided
      if (options.assigned_to) {
        selectQuery += ` AND j.assigned_to = $${paramCount}`;
        values.push(options.assigned_to);
        paramCount++;
      }

      // Filter by package jobs if provided
      if (options.is_package_job !== undefined) {
        selectQuery += ` AND j.is_package_job = $${paramCount}`;
        values.push(options.is_package_job);
        paramCount++;
      }

      selectQuery += ` ORDER BY j.created_at DESC`;

      const result = await client.query(selectQuery, values);

      log.debug('Fetched jobs', {
        businessId,
        count: result.rows.length,
        filters: options
      });

      return result.rows;
    } catch (error) {
      log.error('Failed to fetch jobs', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getJobById(id, businessId) {
    const client = await getClient();
    try {
      // SET RLS CONTEXT FIRST
      await setRLSContext(client, businessId);

      const selectQuery = `
        SELECT
          j.*,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name,
          c.email as customer_email,
          c.phone as customer_phone,
          s.name as service_name,
          s.base_price as service_base_price,
          u.full_name as assigned_to_name,
          sp.name as package_name
        FROM jobs j
        LEFT JOIN customers c ON j.customer_id = c.id
        LEFT JOIN services s ON j.service_id = s.id
        LEFT JOIN users u ON j.assigned_to = u.id
        LEFT JOIN service_packages sp ON j.package_id = sp.id
        WHERE j.id = $1 AND j.business_id = $2
      `;

      const result = await client.query(selectQuery, [id, businessId]);
      const job = result.rows[0] || null;

      if (job) {
        // If it's a package job, fetch the job services
        if (job.is_package_job) {
          const jobServicesQuery = `
            SELECT
              js.*,
              s.name as service_name,
              s.description as service_description
            FROM job_services js
            JOIN services s ON js.service_id = s.id
            WHERE js.job_id = $1
            ORDER BY js.sequence_order
          `;
          const jobServicesResult = await client.query(jobServicesQuery, [id]);
          job.job_services = jobServicesResult.rows;
        }

        log.debug('Fetched job by ID', { 
          jobId: id, 
          businessId,
          isPackageJob: job.is_package_job,
          serviceCount: job.job_services?.length || 0
        });
      } else {
        log.debug('Job not found', { jobId: id, businessId });
      }

      return job;
    } catch (error) {
      log.error('Failed to fetch job by ID', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async updateJobStatus(id, statusData, userId, businessId) {
    const client = await getClient();
    try {
      await setRLSContext(client, businessId, userId);
      await client.query('BEGIN');

      // Get current job status
      const currentJob = await this.getJobById(id, businessId);
      if (!currentJob) {
        throw new Error('Job not found');
      }

      const updateQuery = `
        UPDATE jobs
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND business_id = $3
        RETURNING *
      `;

      const result = await client.query(updateQuery, [statusData.status, id, businessId]);
      const updatedJob = result.rows[0];

      // Add to status history
      const statusHistoryQuery = `
        INSERT INTO job_status_history (job_id, from_status, to_status, changed_by, notes)
        VALUES ($1, $2, $3, $4, $5)
      `;
      await client.query(statusHistoryQuery, [
        id,
        currentJob.status,
        statusData.status,
        userId,
        statusData.notes || ''
      ]);

      // Update timestamps based on status
      if (statusData.status === 'in-progress' && !currentJob.started_at) {
        await client.query('UPDATE jobs SET started_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
      } else if (statusData.status === 'completed' && !currentJob.completed_at) {
        await client.query('UPDATE jobs SET completed_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
      }

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'job.status_updated',
        resourceType: 'job',
        resourceId: id,
        oldValues: { status: currentJob.status },
        newValues: { status: statusData.status, notes: statusData.notes }
      });

      await client.query('COMMIT');

      // FIX: Get fresh data AFTER commit to ensure we have the latest state
      const freshJob = await this.getJobById(id, businessId);

      log.info('Job status updated', {
        jobId: id,
        fromStatus: currentJob.status,
        toStatus: statusData.status,
        businessId,
        userId
      });

      return freshJob; // FIX: Return the fresh job data with updated timestamps

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Job status update failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async updateJob(id, jobData, userId, businessId) {
    const client = await getClient();
    try {
      await setRLSContext(client, businessId, userId);

      // First get the current values for audit logging
      const currentJob = await this.getJobById(id, businessId);
      if (!currentJob) {
        throw new Error('Job not found');
      }

      await client.query('BEGIN');

      const updateFields = [];
      const values = [];
      let paramCount = 1;

      // Build dynamic update query - FIXED: Added location field
      const fields = {
        title: jobData.title,
        description: jobData.description,
        scheduled_date: jobData.scheduled_date,
        estimated_duration_minutes: jobData.estimated_duration_minutes,
        actual_duration_minutes: jobData.actual_duration_minutes,
        priority: jobData.priority,
        assigned_to: jobData.assigned_to,
        discount_amount: jobData.discount_amount,
        location: jobData.location  // FIX: Added location field
      };

      Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined) {
          updateFields.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      });

      // Recalculate final price if discount changes
      if (jobData.discount_amount !== undefined) {
        updateFields.push(`final_price = base_price - $${paramCount}`);
        values.push(jobData.discount_amount);
        paramCount++;
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      values.push(id, businessId);

      const updateQuery = `
        UPDATE jobs
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount} AND business_id = $${paramCount + 1}
        RETURNING *
      `;

      const result = await client.query(updateQuery, values);
      const updatedJob = result.rows[0];

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'job.updated',
        resourceType: 'job',
        resourceId: id,
        oldValues: currentJob,
        newValues: updatedJob
      });

      await client.query('COMMIT');

      log.info('Job updated', {
        jobId: id,
        businessId,
        userId
      });

      return updatedJob;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Job update failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async deleteJob(id, userId, businessId) {
    const client = await getClient();
    try {
      await setRLSContext(client, businessId, userId);

      // First get the current values for audit logging
      const currentJob = await this.getJobById(id, businessId);
      if (!currentJob) {
        throw new Error('Job not found');
      }

      await client.query('BEGIN');

      const deleteQuery = `
        DELETE FROM jobs
        WHERE id = $1 AND business_id = $2
        RETURNING *
      `;

      const result = await client.query(deleteQuery, [id, businessId]);
      const deletedJob = result.rows[0];

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'job.deleted',
        resourceType: 'job',
        resourceId: id,
        oldValues: currentJob
      });

      await client.query('COMMIT');

      log.info('Job deleted', {
        jobId: id,
        businessId,
        userId
      });

      return deletedJob;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Job deletion failed', error);
      throw error;
    } finally {
      client.release();
    }
  }
};
