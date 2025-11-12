import pool from '../config/database.js';

export const query = (text, params) => {
  console.log(`🗄️  Database Query: ${text}`, params ? `Params: ${JSON.stringify(params)}` : '');
  return pool.query(text, params);
};

export const getClient = () => {
  console.log('🗄️  Getting database client from pool');
  return pool.connect();
};

export const healthCheck = async () => {
  try {
    console.log('🗄️  Performing database health check...');
    console.log('🗄️  Connection details:', {
      host: pool.options.host,
      port: pool.options.port,
      database: pool.options.database,
      user: pool.options.user
    });
    
    const result = await query('SELECT NOW()');
    console.log('✅ Database health check passed');
    return { status: 'healthy', timestamp: result.rows[0].now };
  } catch (error) {
    console.error('❌ Database health check failed:', error.message);
    console.error('❌ Connection details were:', {
      host: pool.options.host,
      port: pool.options.port,
      database: pool.options.database,
      user: pool.options.user
    });
    return { status: 'unhealthy', error: error.message };
  }
};
