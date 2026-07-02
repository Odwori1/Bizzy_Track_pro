import { log } from '../utils/logger.js';
import { requestContext } from '../utils/requestContext.js';

export const setRLSContext = async (req, res, next) => {
  if (req.path.includes('/register') || req.path === '/api/health') {
    return next();
  }
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required for RLS context' });
  }

  req.businessId = req.user.businessId;
  req.userId = req.user.userId;

  log.debug('RLS context prepared', { businessId: req.user.businessId, userId: req.user.userId });

  // PRODUCTION FIX: propagate context via AsyncLocalStorage so every DB
  // client checked out for the rest of this request — no matter how deep
  // in the service layer, regardless of whether that service remembers to
  // set_config itself — automatically gets the right tenant scope.
  requestContext.run(
    { businessId: req.user.businessId, userId: req.user.userId },
    () => next()
  );
};
