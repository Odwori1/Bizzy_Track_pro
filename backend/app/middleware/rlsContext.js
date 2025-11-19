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

  // NO CLIENT CREATION HERE - services will handle this
  // Just set the business ID on the request for services to use
  
  req.businessId = req.user.businessId;
  req.userId = req.user.userId;

  log.debug('RLS context prepared', {
    businessId: req.user.businessId,
    userId: req.user.userId
  });

  next();
};
