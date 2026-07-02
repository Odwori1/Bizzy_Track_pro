import pool from '../config/database.js';
import { getCurrentContext } from './requestContext.js';

const CLEAR_CONTEXT_SQL = `
  SELECT set_config('app.current_business_id', '', false),
         set_config('app.current_user_id', '', false)
`;

export const getClient = async () => {
  console.log('🗄️  Getting database client from pool');
  const client = await pool.connect();
  const { businessId, userId } = getCurrentContext();

  if (businessId) {
    try {
      await client.query(
        `SELECT set_config('app.current_business_id', $1, false),
                set_config('app.current_user_id', $2, false)`,
        [businessId, userId || '']
      );
    } catch (err) {
      client.release(true); // discard — don't return a possibly-tainted connection to the pool
      throw err;
    }
  }

  // PRODUCTION FIX: always clear tenant context before the physical
  // connection goes back to the pool. Guarantees a future checkout that
  // forgets to set context (or runs before any context exists, e.g.
  // health checks) can never inherit a previous request's business_id.
  const originalRelease = client.release.bind(client);
  client.release = (err) => {
    client.query(CLEAR_CONTEXT_SQL).catch(() => {}).finally(() => {
      originalRelease(err);
    });
  };

  return client;
};

export const query = async (text, params) => {
  console.log(`🗄️  Database Query: ${text}`, params ? `Params: ${JSON.stringify(params)}` : '');
  // PRODUCTION FIX: route through getClient() instead of pool.query()
  // directly, so plain query() calls also get tenant context applied.
  const client = await getClient();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
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
