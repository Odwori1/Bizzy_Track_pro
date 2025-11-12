import express from 'express';
import { businessController } from '../controllers/businessController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';

const router = express.Router();

// Public routes
router.post('/register', businessController.register);
router.get('/config', businessController.getConfig);
router.post('/validate-timezone', businessController.validateTimezone);

// Protected route for testing security
router.get('/profile', authenticate, setRLSContext, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Access granted to protected route',
      user: {
        userId: req.user.userId,
        businessId: req.user.businessId,
        email: req.user.email,
        role: req.user.role,
        timezone: req.user.timezone
      },
      security: {
        authenticated: true,
        rlsContext: true
      }
    });
  } catch (error) {
    console.error('Profile route error:', error);
    res.status(500).json({
      success: false,
      error: 'Profile fetch failed'
    });
  }
});

export default router;
