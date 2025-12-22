// Fix the getTimesheets method in workforceService.js
const fs = require('fs');
let content = fs.readFileSync('app/services/workforceService.js', 'utf8');

// Replace the getTimesheets method
const oldMethod = `  /**
   * Get timesheets
   */
  static async getTimesheets(businessId, filters = {}) {
    const client = await getClient();

    try {
      let query = \`
        SELECT t.*, sp.user_id, sp.employee_id, u.full_name, u.email
        FROM timesheet_entries t
        JOIN staff_profiles sp ON t.staff_profile_id = sp.id
        JOIN users u ON sp.user_id = u.id
        WHERE t.business_id = \$1
      \`;
      const params = [businessId];
      let paramCount = 2;

      if (filters.start_date) {
        query += \` AND t.entry_date >= \$\${paramCount}\`;
        params.push(filters.start_date);
        paramCount++;
      }

      if (filters.end_date) {
        query += \` AND t.entry_date <= \$\${paramCount}\`;
        params.push(filters.end_date);
        paramCount++;
      }

      if (filters.staff_profile_id) {
        query += \` AND t.staff_profile_id = \$\${paramCount}\`;
        params.push(filters.staff_profile_id);
        paramCount++;
      }

      query += ' ORDER BY t.entry_date DESC, t.clock_in DESC';

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }`;

const newMethod = `  /**
   * Get timesheets
   */
  static async getTimesheets(businessId, filters = {}) {
    const client = await getClient();

    try {
      let query = \`
        SELECT 
          t.*, 
          sp.employee_id, 
          u.full_name, 
          u.email,
          tp.period_name,
          tp.start_date as period_start_date,
          tp.end_date as period_end_date,
          tp.pay_date
        FROM timesheet_entries t
        JOIN staff_profiles sp ON t.staff_profile_id = sp.id
        JOIN users u ON sp.user_id = u.id
        JOIN timesheet_periods tp ON t.timesheet_period_id = tp.id
        WHERE t.business_id = \$1
      \`;
      const params = [businessId];
      let paramCount = 2;

      if (filters.staff_profile_id) {
        query += \` AND t.staff_profile_id = \$\${paramCount}\`;
        params.push(filters.staff_profile_id);
        paramCount++;
      }

      if (filters.timesheet_period_id) {
        query += \` AND t.timesheet_period_id = \$\${paramCount}\`;
        params.push(filters.timesheet_period_id);
        paramCount++;
      }

      if (filters.status) {
        query += \` AND t.status = \$\${paramCount}\`;
        params.push(filters.status);
        paramCount++;
      }

      query += ' ORDER BY tp.start_date DESC, sp.employee_id';

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }`;

content = content.replace(oldMethod, newMethod);
fs.writeFileSync('app/services/workforceService.js', content);
console.log("✅ Timesheet service fixed");
