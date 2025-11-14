import { database } from './app/utils/database.js';

async function testConnection() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test basic connection
    const result = await database.query('SELECT version()');
    console.log('✅ Database connection successful:', result.rows[0].version);
    
    // Test discount_approvals table access
    const tableTest = await database.query(`
      SELECT COUNT(*) as count FROM discount_approvals 
      WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
    `);
    console.log('✅ Discount approvals table accessible. Count:', tableTest.rows[0].count);
    
    // Test the exact query from the service
    const serviceQueryTest = await database.query(`
      SELECT da.*,
             u.full_name as requested_by_name,
             j.job_number,
             i.invoice_number,
             approver.full_name as approved_by_name
      FROM discount_approvals da
      LEFT JOIN users u ON da.requested_by = u.id
      LEFT JOIN jobs j ON da.job_id = j.id
      LEFT JOIN invoices i ON da.invoice_id = i.id
      LEFT JOIN users approver ON da.approved_by = approver.id
      WHERE da.business_id = $1
      ORDER BY da.created_at DESC
    `, ['243a15b5-255a-4852-83bf-5cb46aa62b5e']);
    
    console.log('✅ Service query successful. Rows returned:', serviceQueryTest.rows.length);
    
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    console.error('Full error:', error);
  }
}

testConnection();
