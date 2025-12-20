import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class DepartmentBillingService {
  /**
   * Get department billing overview
   */
  static async getDepartmentBilling(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT
          dbe.*,
          d.name as department_name,
          d.code as department_code,
          j.job_number,
          j.title as job_title,
          i.invoice_number,
          i.status as invoice_status,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name
        FROM department_billing_entries dbe
        JOIN departments d ON dbe.department_id = d.id
        JOIN jobs j ON dbe.job_id = j.id
        LEFT JOIN invoices i ON dbe.invoice_id = i.id
        LEFT JOIN customers c ON j.customer_id = c.id
        WHERE dbe.business_id = $1
      `;

      const params = [businessId];
      let paramCount = 1;

      if (filters.department_id) {
        paramCount++;
        queryStr += ` AND dbe.department_id = $${paramCount}`;
        params.push(filters.department_id);
      }

      if (filters.job_id) {
        paramCount++;
        queryStr += ` AND dbe.job_id = $${paramCount}`;
        params.push(filters.job_id);
      }

      if (filters.invoice_id) {
        paramCount++;
        queryStr += ` AND dbe.invoice_id = $${paramCount}`;
        params.push(filters.invoice_id);
      }

      if (filters.date_from) {
        paramCount++;
        queryStr += ` AND dbe.billing_date >= $${paramCount}`;
        params.push(filters.date_from);
      }

      if (filters.date_to) {
        paramCount++;
        queryStr += ` AND dbe.billing_date <= $${paramCount}`;
        params.push(filters.date_to);
      }

      if (filters.is_billable !== undefined) {
        paramCount++;
        queryStr += ` AND dbe.is_billable = $${paramCount}`;
        params.push(filters.is_billable);
      }

      queryStr += ' ORDER BY dbe.billing_date DESC, dbe.created_at DESC';

      if (filters.limit) {
        paramCount++;
        queryStr += ` LIMIT $${paramCount}`;
        params.push(parseInt(filters.limit));
      }

      const result = await client.query(queryStr, params);

      // Calculate summary
      const summary = {
        total_entries: result.rows.length,
        total_amount: result.rows.reduce((sum, entry) => sum + parseFloat(entry.total_amount), 0),
        total_cost: result.rows.reduce((sum, entry) => sum + parseFloat(entry.cost_amount || 0), 0),
        billable_entries: result.rows.filter(entry => entry.is_billable).length,
        billable_amount: result.rows
          .filter(entry => entry.is_billable)
          .reduce((sum, entry) => sum + parseFloat(entry.total_amount), 0)
      };

      return {
        entries: result.rows,
        summary
      };
    } catch (error) {
      log.error('❌ Department billing query failed:', {
        error: error.message,
        businessId,
        filters
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get consolidated billing for hospital-style coordination
   */
  static async getConsolidatedBilling(businessId, filters = {}) {
    const client = await getClient();

    try {
      // Get jobs with multiple department assignments (master tickets)
      const masterTicketsQuery = `
        SELECT
          j.id as job_id,
          j.job_number,
          j.title as job_title,
          j.status as job_status,
          j.final_price as service_price,  -- ADDED: Get service price
          c.first_name as customer_first_name,
          c.last_name as customer_last_name,
          COUNT(DISTINCT jda.department_id) as department_count,
          COUNT(DISTINCT dbe.id) as billing_entry_count,
          COALESCE(SUM(dbe.total_amount), 0) as total_amount,
          COALESCE(SUM(dbe.cost_amount), 0) as total_cost
        FROM jobs j
        JOIN customers c ON j.customer_id = c.id
        LEFT JOIN job_department_assignments jda ON j.id = jda.job_id
        LEFT JOIN department_billing_entries dbe ON j.id = dbe.job_id
        WHERE j.business_id = $1
          AND j.id IN (
            SELECT job_id
            FROM job_department_assignments
            WHERE business_id = $1
            GROUP BY job_id
            HAVING COUNT(DISTINCT department_id) > 0
          )
      `;

      const params = [businessId];
      let paramCount = 1;

      let whereClause = '';

      if (filters.date_from) {
        paramCount++;
        whereClause += ` AND j.created_at >= $${paramCount}`;
        params.push(filters.date_from);
      }

      if (filters.date_to) {
        paramCount++;
        whereClause += ` AND j.created_at <= $${paramCount}`;
        params.push(filters.date_to);
      }

      if (filters.customer_id) {
        paramCount++;
        whereClause += ` AND j.customer_id = $${paramCount}`;
        params.push(filters.customer_id);
      }

      const finalQuery = masterTicketsQuery + whereClause + `
        GROUP BY j.id, j.job_number, j.title, j.status, j.final_price, c.first_name, c.last_name
        ORDER BY j.created_at DESC
      `;

      const result = await client.query(finalQuery, params);

      // Get detailed breakdown for each job
      const consolidatedBills = [];
      for (const job of result.rows) {
        const breakdownQuery = `
          SELECT
            dbe.*,
            d.name as department_name,
            d.code as department_code,
            d.department_type,
            dbe.description,
            dbe.quantity,
            dbe.unit_price,
            dbe.total_amount,
            dbe.billing_type,
            dbe.cost_amount,
            dbe.is_billable
          FROM department_billing_entries dbe
          JOIN departments d ON dbe.department_id = d.id
          WHERE dbe.business_id = $1 AND dbe.job_id = $2
          ORDER BY d.name, dbe.billing_date
        `;

        const breakdownResult = await client.query(breakdownQuery, [businessId, job.job_id]);

        // Check if there's an invoice for this consolidated bill
        const invoiceQuery = `
          SELECT DISTINCT i.*
          FROM invoices i
          JOIN department_billing_entries dbe ON i.id = dbe.invoice_id
          WHERE dbe.business_id = $1 AND dbe.job_id = $2
          LIMIT 1
        `;

        const invoiceResult = await client.query(invoiceQuery, [businessId, job.job_id]);

        // Calculate department total and profit
        const departmentTotal = breakdownResult.rows.reduce((sum, entry) => 
          sum + parseFloat(entry.total_amount || 0), 0
        );
        const servicePrice = parseFloat(job.service_price) || 0;
        const profit = servicePrice - departmentTotal;

        consolidatedBills.push({
          ...job,
          department_total: departmentTotal,
          service_price: servicePrice,
          profit: profit,
          department_breakdown: breakdownResult.rows,
          invoice: invoiceResult.rows[0] || null
        });
      }

      return consolidatedBills;
    } catch (error) {
      log.error('❌ Consolidated billing query failed:', {
        error: error.message,
        businessId,
        filters
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get billing details for a specific department
   */
  static async getBillingByDepartment(businessId, departmentId, filters = {}) {
    const client = await getClient();

    try {
      // Get department info
      const deptQuery = `
        SELECT d.*,
               COUNT(DISTINCT jda.id) as total_assignments,
               COUNT(DISTINCT u.id) as staff_count
        FROM departments d
        LEFT JOIN job_department_assignments jda ON d.id = jda.department_id
        LEFT JOIN users u ON u.department_id = d.id
        WHERE d.business_id = $1 AND d.id = $2
        GROUP BY d.id
      `;

      const deptResult = await client.query(deptQuery, [businessId, departmentId]);

      if (deptResult.rows.length === 0) {
        throw new Error('Department not found');
      }

      const department = deptResult.rows[0];

      // Get billing entries
      let billingQuery = `
        SELECT
          dbe.*,
          j.job_number,
          j.title as job_title,
          j.status as job_status,
          i.invoice_number,
          i.status as invoice_status,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name
        FROM department_billing_entries dbe
        JOIN jobs j ON dbe.job_id = j.id
        LEFT JOIN invoices i ON dbe.invoice_id = i.id
        LEFT JOIN customers c ON j.customer_id = c.id
        WHERE dbe.business_id = $1 AND dbe.department_id = $2
      `;

      const params = [businessId, departmentId];
      let paramCount = 2;

      if (filters.date_from) {
        paramCount++;
        billingQuery += ` AND dbe.billing_date >= $${paramCount}`;
        params.push(filters.date_from);
      }

      if (filters.date_to) {
        paramCount++;
        billingQuery += ` AND dbe.billing_date <= $${paramCount}`;
        params.push(filters.date_to);
      }

      if (filters.is_billable !== undefined) {
        paramCount++;
        billingQuery += ` AND dbe.is_billable = $${paramCount}`;
        params.push(filters.is_billable);
      }

      billingQuery += ' ORDER BY dbe.billing_date DESC';

      const billingResult = await client.query(billingQuery, params);

      // Get billing rules for this department
      const rulesQuery = `
        SELECT * FROM department_billing_rules
        WHERE business_id = $1 AND department_id = $2
        ORDER BY billing_type
      `;

      const rulesResult = await client.query(rulesQuery, [businessId, departmentId]);

      // Calculate metrics
      const metrics = {
        total_entries: billingResult.rows.length,
        billable_entries: billingResult.rows.filter(entry => entry.is_billable).length,
        total_revenue: billingResult.rows.reduce((sum, entry) => sum + parseFloat(entry.total_amount), 0),
        total_cost: billingResult.rows.reduce((sum, entry) => sum + parseFloat(entry.cost_amount || 0), 0),
        average_profit_margin: billingResult.rows.length > 0
          ? (billingResult.rows.reduce((sum, entry) => {
              const revenue = parseFloat(entry.total_amount);
              const cost = parseFloat(entry.cost_amount || 0);
              return sum + (revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0);
            }, 0) / billingResult.rows.length)
          : 0
      };

      return {
        department,
        billing_entries: billingResult.rows,
        billing_rules: rulesResult.rows,
        metrics
      };
    } catch (error) {
      log.error('❌ Department billing details query failed:', {
        error: error.message,
        businessId,
        departmentId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate consolidated bill for a job with multiple departments
   * FIXED: Now uses SERVICE PRICE instead of department costs
   */
  static async generateConsolidatedBill(businessId, jobId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get job details WITH SERVICE PRICE - FIXED QUERY
      const jobQuery = await client.query(`
        SELECT 
          j.*,
          s.base_price as service_base_price,
          s.name as service_name,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name
        FROM jobs j
        JOIN services s ON j.service_id = s.id
        JOIN customers c ON j.customer_id = c.id
        WHERE j.id = $1 AND j.business_id = $2
      `, [jobId, businessId]);

      if (jobQuery.rows.length === 0) {
        throw new Error('Job not found or access denied');
      }

      const job = jobQuery.rows[0];
      
      // Use final_price if available, otherwise use service.base_price
      const servicePrice = parseFloat(job.final_price) || parseFloat(job.service_base_price) || 0;
      
      if (servicePrice === 0) {
        throw new Error('Service price not found. Please set a price for this service.');
      }

      // Check if there are department assignments
      const deptAssignments = await client.query(
        `SELECT COUNT(DISTINCT department_id) as dept_count
         FROM job_department_assignments
         WHERE business_id = $1 AND job_id = $2`,
        [businessId, jobId]
      );

      if (deptAssignments.rows[0].dept_count === 0) {
        throw new Error('Job has no department assignments. Please assign departments first.');
      }

      // Get all department billing entries for this job
      const billingEntries = await client.query(
        `SELECT
          dbe.*,
          d.name as department_name,
          d.code as department_code
         FROM department_billing_entries dbe
         JOIN departments d ON dbe.department_id = d.id
         WHERE dbe.business_id = $1 AND dbe.job_id = $2
         ORDER BY d.name`,
        [businessId, jobId]
      );

      // Calculate department total costs (for profit analysis)
      const departmentTotal = billingEntries.rows.reduce((sum, entry) => 
        sum + parseFloat(entry.total_amount || 0), 0
      );
      const totalCost = billingEntries.rows.reduce((sum, entry) => 
        sum + parseFloat(entry.cost_amount || 0), 0
      );
      const profit = servicePrice - departmentTotal;

      // Check if invoice already exists for this job
      const existingInvoiceQuery = await client.query(
        `SELECT id FROM invoices WHERE business_id = $1 AND job_id = $2`,
        [businessId, jobId]
      );

      if (existingInvoiceQuery.rows.length > 0) {
        throw new Error('An invoice already exists for this job. Please use the existing invoice or delete it first.');
      }

      // Generate appropriate invoice number
      const invoiceCount = await client.query(
        'SELECT COUNT(*) FROM invoices WHERE business_id = $1',
        [businessId]
      );

      const prefix = deptAssignments.rows[0].dept_count > 1 ? 'CONS' : 'DEPT';
      const invoiceNumber = `${prefix}-${(parseInt(invoiceCount.rows[0].count) + 1).toString().padStart(4, '0')}`;

      // Create detailed notes showing both service price and department costs
      const notes = `Consolidated bill for job ${job.job_number || jobId}.
Service: ${job.service_name || 'Unknown'} | Service Price: ${servicePrice}
Department Costs: ${departmentTotal} | Profit: ${profit}
${billingEntries.rows.length} department charge(s) across ${deptAssignments.rows[0].dept_count} department(s)`;

      // Create invoice WITH SERVICE PRICE - FIXED
      const invoiceResult = await client.query(
        `INSERT INTO invoices (
          business_id, invoice_number, job_id, customer_id,
          invoice_date, due_date, subtotal, total_amount,
          amount_paid, status, notes, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        ) RETURNING *`,
        [
          businessId,
          invoiceNumber,
          jobId,
          job.customer_id,
          new Date().toISOString(),
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
          servicePrice,  // FIXED: Use SERVICE PRICE, not department total
          servicePrice,  // FIXED: Use SERVICE PRICE, not department total
          0,  // amount_paid
          'draft',
          notes,
          userId
        ]
      );

      const invoice = invoiceResult.rows[0];

      // Update billing entries with invoice ID
      await client.query(
        `UPDATE department_billing_entries
         SET invoice_id = $1
         WHERE business_id = $2 AND job_id = $3`,
        [invoice.id, businessId, jobId]
      );

      // Create line items for the invoice (with correct pricing)
      for (const entry of billingEntries.rows) {
        await client.query(
          `INSERT INTO invoice_line_items (
            invoice_id, service_id, description,
            quantity, unit_price
          ) VALUES (
            $1, NULL, $2, $3, $4
          )`,
          [
            invoice.id,
            `${entry.department_code}: ${entry.description} (Department Cost)`,
            entry.quantity,
            entry.unit_price
          ]
        );
      }

      // Also add a line item for the service itself
      await client.query(
        `INSERT INTO invoice_line_items (
          invoice_id, service_id, description,
          quantity, unit_price
        ) VALUES (
          $1, $2, $3, 1, $4
        )`,
        [
          invoice.id,
          job.service_id,
          `${job.service_name} - Service Fee`,
          servicePrice
        ]
      );

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'consolidated-bill.generated',
        resourceType: 'invoice',
        resourceId: invoice.id,
        newValues: {
          invoice_number: invoiceNumber,
          service_price: servicePrice,
          department_costs: departmentTotal,
          profit: profit,
          department_count: billingEntries.rows.length,
          job_id: jobId
        }
      });

      await client.query('COMMIT');

      return {
        invoice,
        service_price: servicePrice,
        department_total: departmentTotal,
        profit: profit,
        department_breakdown: billingEntries.rows,
        summary: {
          service_price: servicePrice,
          department_costs: departmentTotal,
          profit: profit,
          department_count: deptAssignments.rows[0].dept_count,
          billing_entries_count: billingEntries.rows.length,
          is_consolidated: deptAssignments.rows[0].dept_count > 1
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error generating consolidated bill:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Allocate a charge to a department
   */
  static async allocateDepartmentCharge(businessId, chargeData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify job exists
      const jobCheck = await client.query(
        'SELECT id, customer_id FROM jobs WHERE id = $1 AND business_id = $2',
        [chargeData.job_id, businessId]
      );

      if (jobCheck.rows.length === 0) {
        throw new Error('Job not found or access denied');
      }

      // Verify department exists
      const deptCheck = await client.query(
        'SELECT id FROM departments WHERE id = $1 AND business_id = $2',
        [chargeData.department_id, businessId]
      );

      if (deptCheck.rows.length === 0) {
        throw new Error('Department not found or access denied');
      }

      // Create billing entry
      const result = await client.query(
        `INSERT INTO department_billing_entries (
          business_id, job_id, department_id,
          description, quantity, unit_price, total_amount,
          billing_type, cost_amount, is_billable, billing_date
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        ) RETURNING *`,
        [
          businessId,
          chargeData.job_id,
          chargeData.department_id,
          chargeData.description,
          chargeData.quantity || 1,
          chargeData.unit_price,
          chargeData.quantity ? chargeData.quantity * chargeData.unit_price : chargeData.unit_price,
          chargeData.billing_type || 'service',
          chargeData.cost_amount || null,
          chargeData.is_billable !== false,
          chargeData.billing_date || new Date().toISOString().split('T')[0]
        ]
      );

      const billingEntry = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'department-charge.allocated',
        resourceType: 'department-billing',
        resourceId: billingEntry.id,
        newValues: {
          job_id: chargeData.job_id,
          department_id: chargeData.department_id,
          amount: billingEntry.total_amount,
          billing_type: billingEntry.billing_type
        }
      });

      await client.query('COMMIT');
      return billingEntry;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
