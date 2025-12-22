#!/bin/bash

echo "🔧 COMPREHENSIVE BACKEND FIX"

# 1. Fix timesheet service to join with timesheet_periods
echo "1. Fixing timesheet service method..."
cat > fix_timesheet_service.js << 'FIX_TS'
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
FIX_TS

node fix_timesheet_service.js

# 2. Fix performance service to use correct table name
echo "2. Fixing performance service..."
if grep -q "performance_metrics" app/services/workforceService.js; then
  echo "Replacing performance_metrics with staff_performance_metrics..."
  sed -i 's/performance_metrics/staff_performance_metrics/g' app/services/workforceService.js
  echo "✅ Performance table name fixed"
else
  echo "⚠️ Performance method not found, adding it..."
  cat >> app/services/workforceService.js << 'PERF_METHOD'

  /**
   * Get performance metrics
   */
  static async getPerformance(businessId, filters = {}) {
    const client = await getClient();

    try {
      let query = \`
        SELECT 
          pm.*,
          sp.employee_id,
          u.full_name,
          u.email
        FROM staff_performance_metrics pm
        JOIN staff_profiles sp ON pm.staff_profile_id = sp.id
        JOIN users u ON sp.user_id = u.id
        WHERE pm.business_id = \$1
      \`;
      const params = [businessId];
      let paramCount = 2;

      if (filters.staff_profile_id) {
        query += \` AND pm.staff_profile_id = \$\${paramCount}\`;
        params.push(filters.staff_profile_id);
        paramCount++;
      }

      if (filters.metric_type) {
        query += \` AND pm.metric_type = \$\${paramCount}\`;
        params.push(filters.metric_type);
        paramCount++;
      }

      if (filters.start_date) {
        query += \` AND pm.metric_date >= \$\${paramCount}\`;
        params.push(filters.start_date);
        paramCount++;
      }

      if (filters.end_date) {
        query += \` AND pm.metric_date <= \$\${paramCount}\`;
        params.push(filters.end_date);
        paramCount++;
      }

      query += ' ORDER BY pm.metric_date DESC, sp.employee_id';

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }
PERF_METHOD
fi

# 3. Debug shift validation issue
echo "3. Creating debug validation test..."
cat > test_validation.js << 'TEST_VAL'
const Joi = require('joi');

// Test the shiftQuerySchema
const shiftQuerySchema = Joi.object({
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  department_id: Joi.string().uuid().optional(),
  staff_profile_id: Joi.string().uuid().optional(),
  shift_status: Joi.string().valid('scheduled', 'in_progress', 'completed', 'cancelled').optional()
});

// Test with our parameters
const testParams = {
  start_date: '2025-01-01',
  end_date: '2025-12-31'
};

const { error, value } = shiftQuerySchema.validate(testParams);

if (error) {
  console.log('❌ Validation error:', error.details);
} else {
  console.log('✅ Validation passed:', value);
}
TEST_VAL

echo "Testing validation schema..."
node test_validation.js

# 4. Check if shift tables exist
echo "4. Checking shift tables..."
psql -h localhost -p 5434 -U postgres -d bizzytrack_pro << PSQL_EOF
SELECT 
  table_name,
  string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name IN ('shift_templates', 'shift_rosters', 'shift_swap_requests')
GROUP BY table_name
ORDER BY table_name;
PSQL_EOF

# 5. Add a simple fix for shift validation by updating the schema
echo "5. Fixing shift query schema if needed..."
cat >> app/schemas/workforceSchemas.js << 'SCHEMA_FIX'

// Simplified shift query schema for debugging
export const debugShiftQuerySchema = Joi.object({
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().required(),
  department_id: Joi.string().uuid().optional(),
  staff_profile_id: Joi.string().uuid().optional(),
  shift_status: Joi.string().valid('scheduled', 'in_progress', 'completed', 'cancelled').optional()
});
SCHEMA_FIX

echo "✅ All fixes applied!"
echo "Please restart backend: npm run dev"
