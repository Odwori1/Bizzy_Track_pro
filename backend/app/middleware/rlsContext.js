import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';

export const setRLSContext = async (req, res, next) => {
  // Skip RLS context for public routes
  if (req.path.includes('/register') || req.path === '/api/health') {
    return next();
  }

  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required for RLS context'
    });
  }

  const client = await getClient();
  
  try {
    // Set the current business ID for RLS policies
    // Use template literal since SET doesn't support parameterized queries
    await client.query(`SET app.current_business_id = '${req.user.businessId}'`);
    
    // Store client in request for proper cleanup
    req.dbClient = client;
    
    log.debug('RLS context set', { 
      businessId: req.user.businessId,
      userId: req.user.userId 
    });
    
    next();
  } catch (error) {
    client.release();
    log.error('RLS context setup failed', error);
    return res.status(500).json({
      success: false,
      error: 'Database security context setup failed'
    });
  }
};

export const releaseRLSContext = (req, res, next) => {
  // Release database client after request
  if (req.dbClient) {
    req.dbClient.release();
    delete req.dbClient;
  }
  next();
};
