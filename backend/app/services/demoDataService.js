import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import bcrypt from 'bcryptjs';

export const demoDataService = {
  /**
   * Generate comprehensive demo data for a business
   */
  async generateDemoData(businessId, userId, options = {}) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const {
        customersCount = 10,
        servicesCount = 8,
        jobsCount = 15,
        invoicesCount = 12,
        includeStaff = true
      } = options;

      // Get business info
      const businessResult = await client.query(
        'SELECT * FROM businesses WHERE id = $1',
        [businessId]
      );
      const business = businessResult.rows[0];

      if (!business) {
        throw new Error('Business not found');
      }

      const results = {
        business: business.name,
        customers: [],
        services: [],
        jobs: [],
        invoices: [],
        staff: []
      };

      // 1. Create customer categories - FIXED: Handle existing categories
      const categories = await this.createCustomerCategories(client, businessId, userId);
      results.categories = categories;

      // 2. Create customers - FIXED: Use simpler data to avoid JSON issues
      results.customers = await this.createCustomers(client, businessId, userId, customersCount, categories);

      // 3. Create services
      results.services = await this.createServices(client, businessId, userId, servicesCount);

      // 4. Create staff users if requested
      if (includeStaff) {
        results.staff = await this.createStaffUsers(client, businessId);
      }

      // 5. Create jobs - FIXED: Using correct status values
      results.jobs = await this.createJobs(client, businessId, userId, jobsCount, results.customers, results.services, results.staff);

      // 6. Create invoices - FIXED: Unique invoice numbers
      results.invoices = await this.createInvoices(client, businessId, userId, invoicesCount, results.jobs, results.customers, results.services);

      await client.query('COMMIT');

      log.info('Demo data generated successfully', {
        businessId,
        userId,
        results: {
          customers: results.customers.length,
          services: results.services.length,
          jobs: results.jobs.length,
          invoices: results.invoices.length,
          staff: results.staff.length
        }
      });

      return results;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Demo data generation failed', { 
        error: error.message, 
        code: error.code,
        businessId,
        userId 
      });
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Create customer categories - FIXED: Handle existing categories
   */
  async createCustomerCategories(client, businessId, userId) {
    const categories = [
      { name: 'Regular', description: 'Regular customers', color: '#3B82F6', discount_percentage: 0, is_active: true },
      { name: 'Premium', description: 'Premium members', color: '#10B981', discount_percentage: 10, is_active: true },
      { name: 'VIP', description: 'VIP customers', color: '#8B5CF6', discount_percentage: 15, is_active: true },
      { name: 'Corporate', description: 'Business clients', color: '#F59E0B', discount_percentage: 12, is_active: true }
    ];

    const createdCategories = [];

    // First, check which categories already exist
    const existingCategoriesResult = await client.query(
      'SELECT name FROM customer_categories WHERE business_id = $1',
      [businessId]
    );
    
    const existingCategoryNames = existingCategoriesResult.rows.map(row => row.name);
    
    for (const category of categories) {
      // Skip if category already exists
      if (existingCategoryNames.includes(category.name)) {
        log.debug(`Category ${category.name} already exists, skipping creation`);
        continue;
      }

      const result = await client.query(
        `INSERT INTO customer_categories
         (business_id, name, description, color, discount_percentage, is_active, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING *`,
        [businessId, category.name, category.description, category.color,
         category.discount_percentage, category.is_active, userId]
      );
      createdCategories.push(result.rows[0]);
    }

    // Get all categories (both existing and newly created)
    const allCategoriesResult = await client.query(
      'SELECT * FROM customer_categories WHERE business_id = $1 ORDER BY name',
      [businessId]
    );

    return allCategoriesResult.rows;
  },

  /**
   * Create demo customers - SIMPLIFIED to avoid JSON issues
   */
  async createCustomers(client, businessId, userId, count, categories) {
    const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia'];

    const customers = [];

    for (let i = 0; i < count; i++) {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
      const phone = `+2547${Math.floor(10000000 + Math.random() * 90000000)}`;
      const category = categories[Math.floor(Math.random() * categories.length)];

      // SIMPLIFIED: No complex address or notes to avoid JSON issues
      const result = await client.query(
        `INSERT INTO customers
         (business_id, category_id, first_name, last_name, email, phone, is_active, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() - INTERVAL '${Math.floor(Math.random() * 90)} days', NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days')
         RETURNING *`,
        [
          businessId,
          category.id,
          firstName,
          lastName,
          email,
          phone,
          true,
          userId
        ]
      );

      customers.push(result.rows[0]);
    }

    return customers;
  },

  /**
   * Create demo services
   */
  async createServices(client, businessId, userId, count) {
    const services = [
      { name: 'Hair Cutting', description: 'Professional hair cutting service', base_price: 25.00, duration_minutes: 45, category: 'Beauty' },
      { name: 'Hair Styling', description: 'Advanced hair styling and treatment', base_price: 45.00, duration_minutes: 60, category: 'Beauty' },
      { name: 'Manicure', description: 'Professional nail care service', base_price: 20.00, duration_minutes: 30, category: 'Beauty' },
      { name: 'Pedicure', description: 'Foot care and treatment', base_price: 25.00, duration_minutes: 45, category: 'Beauty' }
    ];

    const createdServices = [];

    for (let i = 0; i < Math.min(count, services.length); i++) {
      const service = services[i];
      const result = await client.query(
        `INSERT INTO services
         (business_id, name, description, base_price, duration_minutes, category, is_active, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() - INTERVAL '${Math.floor(Math.random() * 60)} days', NOW() - INTERVAL '${Math.floor(Math.random() * 15)} days')
         RETURNING *`,
        [
          businessId,
          service.name,
          service.description,
          service.base_price,
          service.duration_minutes,
          service.category,
          true,
          userId
        ]
      );
      createdServices.push(result.rows[0]);
    }

    return createdServices;
  },

  /**
   * Create staff users
   */
  async createStaffUsers(client, businessId) {
    const staffData = [
      { full_name: 'Sarah Johnson', email: 'sarah.johnson@demo.com', role: 'manager' },
      { full_name: 'Mike Chen', email: 'mike.chen@demo.com', role: 'staff' }
    ];

    const createdStaff = [];

    for (const staff of staffData) {
      const passwordHash = await bcrypt.hash('demo123', 10);
      const result = await client.query(
        `INSERT INTO users
         (business_id, email, full_name, password_hash, role, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id, email, full_name, role`,
        [businessId, staff.email, staff.full_name, passwordHash, staff.role, true]
      );
      createdStaff.push(result.rows[0]);
    }

    return createdStaff;
  },

  /**
   * Create demo jobs - FIXED: Correct status values to match database constraint
   */
  async createJobs(client, businessId, userId, count, customers, services, staff) {
    // CORRECTED: Use only valid statuses from database constraint
    const statuses = ['pending', 'in-progress', 'completed', 'cancelled'];
    const priorities = ['low', 'medium', 'high'];

    const jobs = [];

    for (let i = 0; i < count; i++) {
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const service = services[Math.floor(Math.random() * services.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const priority = priorities[Math.floor(Math.random() * priorities.length)];

      // Calculate dates based on status for more realistic data
      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() - Math.floor(Math.random() * 60));

      let scheduledDate = null;
      let startedAt = null;
      let completedAt = null;

      // Set realistic timestamps based on status
      if (status === 'in-progress' || status === 'completed') {
        scheduledDate = new Date(baseDate);
        scheduledDate.setHours(9 + Math.floor(Math.random() * 8), 0, 0, 0);
      }

      if (status === 'in-progress') {
        startedAt = new Date(baseDate);
        startedAt.setHours(9 + Math.floor(Math.random() * 8), 0, 0, 0);
      }

      if (status === 'completed') {
        startedAt = new Date(baseDate);
        startedAt.setHours(9 + Math.floor(Math.random() * 4), 0, 0, 0);
        completedAt = new Date(baseDate);
        completedAt.setHours(startedAt.getHours() + 1 + Math.floor(Math.random() * 4), 0, 0, 0);
      }

      const result = await client.query(
        `INSERT INTO jobs
         (business_id, job_number, title, customer_id, service_id, scheduled_date,
          estimated_duration_minutes, base_price, final_price, discount_amount,
          status, priority, started_at, completed_at, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                 NOW() - INTERVAL '${Math.floor(Math.random() * 60)} days',
                 NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days')
         RETURNING *`,
        [
          businessId,
          `DEMO-JOB-${100 + i}`,
          `${service.name} for ${customer.first_name}`,
          customer.id,
          service.id,
          scheduledDate,
          service.duration_minutes,
          service.base_price,
          service.base_price,
          0,
          status,
          priority,
          startedAt,
          completedAt,
          userId
        ]
      );

      jobs.push(result.rows[0]);
    }

    return jobs;
  },

  /**
   * Create demo invoices - FIXED: Unique invoice numbers using timestamp
   */
  async createInvoices(client, businessId, userId, count, jobs, customers, services) {
    const statuses = ['draft', 'sent', 'paid'];

    const invoices = [];

    // Generate unique base number using timestamp to avoid conflicts
    const timestamp = Date.now().toString().slice(-6);
    
    for (let i = 0; i < count; i++) {
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      // Simple amounts
      const subtotal = 100 + (Math.floor(Math.random() * 150)); // 100-250
      const taxRate = 16;
      const taxAmount = subtotal * (taxRate / 100);
      const totalAmount = subtotal + taxAmount;
      const amountPaid = status === 'paid' ? totalAmount : 0;
      // NOTE: balance_due is a generated column, so we don't insert it

      // Create invoice - FIXED: Unique invoice number using timestamp
      const invoiceResult = await client.query(
        `INSERT INTO invoices
         (business_id, invoice_number, invoice_date, due_date, customer_id,
          subtotal, tax_amount, tax_rate, total_amount, amount_paid,
          status, created_by, created_at, updated_at)
         VALUES ($1, $2, NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days',
                NOW() + INTERVAL '15 days', $3, $4, $5, $6, $7, $8, $9, $10,
                NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days',
                NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days')
         RETURNING *`,
        [
          businessId,
          `DEMO-INV-${timestamp}-${i}`, // FIXED: Unique invoice number
          customer.id,
          subtotal,
          taxAmount,
          taxRate,
          totalAmount,
          amountPaid,
          status,
          userId
        ]
      );

      invoices.push(invoiceResult.rows[0]);
    }

    return invoices;
  },

  /**
   * Clean up demo data - FIXED: Handle tables without business_id and use individual transactions
   */
  async cleanupDemoData(businessId, userId) {
    let client;
    
    try {
      client = await getClient();

      // Verify user has permission to clean up this business
      const userCheck = await client.query(
        'SELECT role FROM users WHERE id = $1 AND business_id = $2',
        [userId, businessId]
      );

      if (userCheck.rows.length === 0 || userCheck.rows[0].role !== 'owner') {
        throw new Error('Only business owners can clean up demo data');
      }

      let deletedCount = 0;

      // Use individual transactions for each table to avoid aborting the entire process
      
      // 1. Clean up invoice_line_items (no business_id, so delete via invoices)
      try {
        await client.query('BEGIN');
        const lineItemsResult = await client.query(
          `DELETE FROM invoice_line_items 
           WHERE invoice_id IN (SELECT id FROM invoices WHERE business_id = $1)`,
          [businessId]
        );
        await client.query('COMMIT');
        deletedCount += lineItemsResult.rowCount;
        log.debug(`Cleaned up ${lineItemsResult.rowCount} records from invoice_line_items`);
      } catch (error) {
        await client.query('ROLLBACK');
        log.warn('Could not clean up invoice_line_items:', error.message);
      }

      // 2. Clean up job_status_history (no business_id, so delete via jobs)
      try {
        await client.query('BEGIN');
        const jobHistoryResult = await client.query(
          `DELETE FROM job_status_history 
           WHERE job_id IN (SELECT id FROM jobs WHERE business_id = $1)`,
          [businessId]
        );
        await client.query('COMMIT');
        deletedCount += jobHistoryResult.rowCount;
        log.debug(`Cleaned up ${jobHistoryResult.rowCount} records from job_status_history`);
      } catch (error) {
        await client.query('ROLLBACK');
        log.warn('Could not clean up job_status_history:', error.message);
      }

      // 3. Clean up tables with business_id (use individual transactions)
      const tablesWithBusinessId = [
        'audit_logs',
        'invoices',
        'jobs',
        'customers',
        'services',
        'customer_categories'
      ];

      for (const table of tablesWithBusinessId) {
        try {
          await client.query('BEGIN');
          const result = await client.query(
            `DELETE FROM ${table} WHERE business_id = $1`,
            [businessId]
          );
          await client.query('COMMIT');
          deletedCount += result.rowCount;
          log.debug(`Cleaned up ${result.rowCount} records from ${table}`);
        } catch (error) {
          await client.query('ROLLBACK');
          log.warn(`Could not clean up ${table}:`, error.message);
        }
      }

      // 4. Clean up users except the current user
      try {
        await client.query('BEGIN');
        const usersResult = await client.query(
          `DELETE FROM users WHERE business_id = $1 AND id != $2`,
          [businessId, userId]
        );
        await client.query('COMMIT');
        deletedCount += usersResult.rowCount;
        log.debug(`Cleaned up ${usersResult.rowCount} users`);
      } catch (error) {
        await client.query('ROLLBACK');
        log.warn('Could not clean up users:', error.message);
      }

      log.info('Demo data cleanup completed', {
        businessId,
        userId,
        deletedCount
      });

      return { deletedCount };

    } catch (error) {
      log.error('Demo data cleanup failed', { 
        error: error.message,
        code: error.code,
        businessId,
        userId 
      });
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }
};
