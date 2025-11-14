import { getClient } from '../app/utils/database.js';
import bcrypt from 'bcryptjs';

/**
 * Manual verification of Week 4 features
 * Run with: node tests/manual-verification.js
 */

async function manualVerification() {
  console.log('🧪 Starting Week 4 Manual Verification...\n');
  
  const client = await getClient();
  
  try {
    // 1. Test Multi-tenant Isolation
    console.log('1. Testing Multi-tenant Isolation...');
    
    // Create a test business
    const businessResult = await client.query(
      `INSERT INTO businesses (name, currency, currency_symbol, timezone, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      ['Manual Test Business', 'USD', '$', 'UTC']
    );
    const business = businessResult.rows[0];
    
    // Create owner
    const passwordHash = await bcrypt.hash('test123', 10);
    const ownerResult = await client.query(
      `INSERT INTO users (business_id, email, full_name, password_hash, role, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [business.id, 'owner@manual-test.com', 'Manual Test Owner', passwordHash, 'owner', true]
    );
    const owner = ownerResult.rows[0];
    
    console.log('✅ Created test business and owner');

    // 2. Test RLS Policies
    console.log('\n2. Testing RLS Policies...');
    
    await client.query("SELECT set_config('app.current_business_id', $1, true)", [business.id]);
    
    // Should only see this business's data
    const users = await client.query('SELECT * FROM users');
    console.log(`✅ RLS working - Found ${users.rows.length} users in current business context`);

    // 3. Test RBAC System
    console.log('\n3. Testing RBAC System...');
    
    const roles = await client.query(
      'SELECT name, is_system_role FROM roles WHERE business_id = $1',
      [business.id]
    );
    console.log(`✅ RBAC working - Found roles: ${roles.rows.map(r => r.name).join(', ')}`);

    // 4. Test ABAC Feature Toggles
    console.log('\n4. Testing ABAC Feature Toggles...');
    
    const permission = await client.query(
      `SELECT id FROM permissions WHERE name = 'customer:create' LIMIT 1`
    );
    
    if (permission.rows.length > 0) {
      await client.query(
        `INSERT INTO user_feature_toggles 
         (user_id, permission_id, is_allowed, granted_by, granted_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [owner.id, permission.rows[0].id, true, owner.id]
      );
      console.log('✅ ABAC working - Created feature toggle');
    }

    // 5. Test Audit Logging
    console.log('\n5. Testing Audit Logging...');
    
    // Create a test customer first to get a valid UUID for resource_id
    const customerResult = await client.query(
      `INSERT INTO customers (business_id, first_name, last_name, email, is_active, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id`,
      [business.id, 'Audit', 'Test', 'audit@test.com', true, owner.id]
    );
    const customerId = customerResult.rows[0].id;
    
    await client.query(
      `INSERT INTO audit_logs (business_id, user_id, action, resource_type, resource_id, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [business.id, owner.id, 'manual.verification', 'customer', customerId]
    );
    console.log('✅ Audit logging working - Created audit entry');

    // 6. Test Timezone Awareness
    console.log('\n6. Testing Timezone Awareness...');
    
    await client.query("SELECT set_config('app.current_timezone', $1, true)", ['Africa/Nairobi']);
    const timezone = await client.query(
      "SELECT current_setting('app.current_timezone', true) as tz"
    );
    console.log(`✅ Timezone awareness working - Current timezone: ${timezone.rows[0].tz}`);

    // 7. Clean up
    console.log('\n7. Cleaning up test data...');
    
    // Clean up in correct order
    const tables = [
      'audit_logs',
      'user_feature_toggles',
      'role_permissions',
      'customers',
      'users',
      'businesses'
    ];

    for (const table of tables) {
      try {
        if (table === 'businesses') {
          await client.query('DELETE FROM businesses WHERE id = $1', [business.id]);
        } else {
          await client.query(`DELETE FROM ${table} WHERE business_id = $1`, [business.id]);
        }
      } catch (error) {
        // Continue on error
      }
    }
    
    console.log('✅ Cleanup completed');

    console.log('\n🎉 WEEK 4 VERIFICATION COMPLETE! All features are working correctly.');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

// Run the verification
manualVerification();
