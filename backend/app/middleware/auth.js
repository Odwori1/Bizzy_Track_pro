import jwt from 'jsonwebtoken';
import { log } from '../utils/logger.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Set user context for RLS and permission checking
      req.user = {
        userId: decoded.userId,
        businessId: decoded.businessId,
        email: decoded.email,
        role: decoded.role,
        timezone: decoded.timezone
      };

      log.info('User authenticated', { 
        userId: decoded.userId, 
        businessId: decoded.businessId,
        role: decoded.role 
      });

      next();
    } catch (jwtError) {
      log.warn('JWT verification failed', { error: jwtError.message });
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
  } catch (error) {
    log.error('Authentication middleware error', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};
