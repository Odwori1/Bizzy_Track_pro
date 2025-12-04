import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/debug-user', authenticate, (req, res) => {
  console.log('=== DEBUG req.user ===');
  console.log('Full req.user:', JSON.stringify(req.user, null, 2));
  console.log('Type of req.user:', typeof req.user);
  console.log('Keys:', Object.keys(req.user || {}));
  
  return res.json({
    success: true,
    user: req.user,
    user_type: typeof req.user,
    keys: Object.keys(req.user || {}),
    businessId: req.user?.businessId,
    business_id: req.user?.business_id,
    userId: req.user?.userId,
    id: req.user?.id
  });
});

export default router;
