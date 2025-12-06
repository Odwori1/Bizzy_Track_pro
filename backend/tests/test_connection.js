const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: 5434,
    database: 'bizzytrack_pro',
    user: 'postgres',
});

async function testConnection() {
    try {
        const client = await pool.connect();
        console.log('✅ Database connection successful');
        
        // Test query
        const result = await client.query('SELECT version()');
        console.log('PostgreSQL version:', result.rows[0].version);
        
        // Check if our business exists
        const businessCheck = await client.query(
            'SELECT id, business_name FROM businesses WHERE id = $1',
            ['243a15b5-255a-4852-83bf-5cb46aa62b5e']
        );
        
        if (businessCheck.rows.length > 0) {
            console.log(`✅ Business found: ${businessCheck.rows[0].business_name}`);
        } else {
            console.log('❌ Business not found');
        }
        
        client.release();
        await pool.end();
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }
}

testConnection();
