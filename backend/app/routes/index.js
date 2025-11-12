import express from 'express';
import businessRoutes from './businessRoutes.js';
import customerCategoryRoutes from './customerCategoryRoutes.js';

const router = express.Router();

// Health check route (no authentication required)
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Bizzy Track Pro API is running',
    timestamp: new Date().toISOString()
  });
});

// Business routes
router.use('/businesses', businessRoutes);

// Customer category routes
router.use('/customer-categories', customerCategoryRoutes);

// 404 handler for undefined routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

export default router;
