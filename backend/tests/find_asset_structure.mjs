import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
    host: 'localhost',
    port: 5434,
    database: 'bizzytrack_pro',
    user: 'postgres',
    password: '0791486006@postgres',
});

const BUSINESS_ID = '243a15b5-255a-4852-83bf-5cb46aa62b5e';

async function findAssetStructure() {
    const client = await pool.connect();
    
    try {
        console.log('🔍 SEARCHING FOR ASSET DATA STRUCTURE');
        console.log('=====================================\n');
        
        // 1. First, let's see all tables
        const allTables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        
        console.log(`Total tables: ${allTables.rows.length}`);
        
        // 2. Look for tables that might contain asset data
        const potentialAssetTables = allTables.rows
            .filter(row => 
                row.table_name.includes('asset') ||
                row.table_name.includes('equipment') ||
                row.table_name.includes('item') ||
                row.table_name.includes('inventory') ||
                row.table_name.includes('product')
            )
            .map(row => row.table_name);
        
        console.log('\nPotential asset-related tables:');
        potentialAssetTables.forEach(table => console.log(`  - ${table}`));
        
        // 3. Check each potential table
        console.log('\n🔎 EXAMINING POTENTIAL TABLES:\n');
        
        for (const tableName of potentialAssetTables) {
            console.log(`\nTable: ${tableName}`);
            console.log('='.repeat(tableName.length + 7));
            
            // Get column structure
            const columns = await client.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = $1
                AND table_schema = 'public'
                ORDER BY ordinal_position
            `, [tableName]);
            
            console.log('Columns:');
            columns.rows.forEach(col => {
                console.log(`  ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
            });
            
            // Check if this table has business_id and might contain our data
            const hasBusinessId = columns.rows.some(col => col.column_name === 'business_id');
            if (hasBusinessId) {
                // Try to get sample data
                const sampleData = await client.query(`
                    SELECT * FROM ${tableName} 
                    WHERE business_id = $1 
                    LIMIT 3
                `, [BUSINESS_ID]);
                
                if (sampleData.rows.length > 0) {
                    console.log('\nSample data for our business:');
                    sampleData.rows.forEach((row, i) => {
                        console.log(`\nRow ${i + 1}:`);
                        // Show only key columns to avoid too much output
                        const keyCols = columns.rows
                            .filter(col => 
                                col.column_name.includes('name') ||
                                col.column_name.includes('code') ||
                                col.column_name.includes('value') ||
                                col.column_name.includes('amount') ||
                                col.column_name.includes('price') ||
                                col.column_name.includes('cost')
                            )
                            .map(col => col.column_name);
                        
                        keyCols.forEach(col => {
                            if (row[col] !== undefined && row[col] !== null) {
                                console.log(`  ${col}: ${row[col]}`);
                            }
                        });
                    });
                    
                    // Get count and total value if possible
                    const countQuery = `SELECT COUNT(*) as count FROM ${tableName} WHERE business_id = $1`;
                    const countResult = await client.query(countQuery, [BUSINESS_ID]);
                    console.log(`\nTotal records for our business: ${countResult.rows[0].count}`);
                    
                    // Try to find value columns
                    const valueColumns = columns.rows
                        .filter(col => 
                            col.column_name.includes('value') ||
                            col.column_name.includes('amount') ||
                            col.column_name.includes('price') ||
                            col.column_name.includes('cost')
                        )
                        .map(col => col.column_name);
                    
                    if (valueColumns.length > 0) {
                        for (const valueCol of valueColumns) {
                            try {
                                const sumQuery = `SELECT SUM(${valueCol}) as total FROM ${tableName} WHERE business_id = $1 AND ${valueCol} IS NOT NULL`;
                                const sumResult = await client.query(sumQuery, [BUSINESS_ID]);
                                if (sumResult.rows[0].total) {
                                    console.log(`Total ${valueCol}: ${sumResult.rows[0].total}`);
                                }
                            } catch (err) {
                                // Column might not be numeric, skip
                            }
                        }
                    }
                } else {
                    console.log('\nNo data found for our business in this table');
                }
            } else {
                console.log('\nNo business_id column - might not be business-specific data');
            }
        }
        
        // 4. Special search for asset codes from your dashboard
        console.log('\n🔍 SEARCHING FOR SPECIFIC ASSET CODES FROM DASHBOARD');
        console.log('====================================================\n');
        
        const assetCodes = [
            'ASSET-012', 'ASSET-011', 'ASSET-010', 'ASSET-009',
            'ASSET-008', 'ASSET-007', 'ASSET-006', 'ASSET-VEHICLE-001',
            'ASSET-COPIER-001', 'ASSET-005', 'ASSET-004', 'ASSET-003',
            'ASSET-002', 'ASSET-001'
        ];
        
        for (const tableName of potentialAssetTables) {
            const columns = await client.query(`
                SELECT column_name 
                FROM information_schema.columns
                WHERE table_name = $1
                AND table_schema = 'public'
                AND column_name IN ('code', 'asset_code', 'reference_code', 'serial_number', 'name')
            `, [tableName]);
            
            if (columns.rows.length > 0) {
                for (const col of columns.rows) {
                    try {
                        const searchQuery = `
                            SELECT COUNT(*) as found_count 
                            FROM ${tableName} 
                            WHERE (${col.column_name}::text LIKE '%ASSET%' OR ${col.column_name}::text LIKE '%asset%')
                            AND business_id = $1
                        `;
                        const result = await client.query(searchQuery, [BUSINESS_ID]);
                        
                        if (parseInt(result.rows[0].found_count) > 0) {
                            console.log(`Found ${result.rows[0].found_count} assets in ${tableName}.${col.column_name}`);
                            
                            // Get sample of these assets
                            const sampleQuery = `
                                SELECT ${col.column_name} as code, 
                                       (SELECT column_name FROM information_schema.columns 
                                        WHERE table_name = $1 
                                        AND column_name IN ('name', 'description', 'purchase_value', 'current_value')
                                        LIMIT 1) as extra_col
                                FROM ${tableName} 
                                WHERE (${col.column_name}::text LIKE '%ASSET%' OR ${col.column_name}::text LIKE '%asset%')
                                AND business_id = $2
                                LIMIT 5
                            `;
                            const sampleResult = await client.query(sampleQuery, [tableName, BUSINESS_ID]);
                            
                            if (sampleResult.rows.length > 0) {
                                console.log('Sample asset codes:');
                                sampleResult.rows.forEach(row => {
                                    console.log(`  - ${row.code}`);
                                });
                            }
                            break;
                        }
                    } catch (err) {
                        // Skip if query fails
                    }
                }
            }
        }
        
        // 5. Let's also check the equipment_hire table since we saw it earlier
        console.log('\n🔍 CHECKING EQUIPMENT_HIRE TABLE');
        console.log('===============================\n');
        
        const equipmentExists = potentialAssetTables.includes('equipment_hire');
        if (equipmentExists) {
            const equipmentData = await client.query(`
                SELECT 
                    COUNT(*) as count,
                    SUM(total_amount) as total_value
                FROM equipment_hire 
                WHERE business_id = $1
                AND status = 'completed'
            `, [BUSINESS_ID]);
            
            if (equipmentData.rows[0].count > 0) {
                console.log(`Equipment Hire: ${equipmentData.rows[0].count} completed hires`);
                console.log(`Total value: ${equipmentData.rows[0].total_value || 0}`);
            }
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

findAssetStructure().then(() => {
    console.log('\n✅ Asset structure search complete.');
    process.exit(0);
}).catch(error => {
    console.error('❌ Search failed:', error);
    process.exit(1);
});
