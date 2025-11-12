import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { healthCheck } from './utils/database.js';
import logger from './middleware/logger.js';
import businessRoutes from './routes/businessRoutes.js';
import customerCategoryRoutes from './routes/customerCategoryRoutes.js';
import customerRoutes from './routes/customerRoutes.js'; // ✅ ADD THIS IMPORT
import serviceRoutes from './routes/serviceRoutes.js';
import discountRuleRoutes from './routes/discountRuleRoutes.js';
import jobRoutes from './routes/jobRoutes.js';

// Import security middleware
import { authenticate } from './middleware/auth.js';
import { setRLSContext, releaseRLSContext } from './middleware/rlsContext.js';

// Load environment variables
dotenv.config();

const app = express();

// Add logger middleware early in the chain
app.use(logger);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3003',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (public)
app.get('/api/health', async (req, res) => {
  try {
    const dbStatus = await healthCheck();

    res.json({
      status: 'OK',
      message: '🚀 Bizzy Track Pro API is running!',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV,
      database: dbStatus
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Public routes (no authentication required)
app.use('/api/businesses', businessRoutes);

// 🔐 PROTECTED ROUTES - Add authentication and RLS context
app.use('/api/customer-categories', authenticate, setRLSContext, customerCategoryRoutes);
app.use('/api/customers', authenticate, setRLSContext, customerRoutes); // ✅ ADD THIS LINE
app.use('/api/services', authenticate, setRLSContext, serviceRoutes);
app.use('/api/discount-rules', authenticate, setRLSContext, discountRuleRoutes);
app.use('/api/jobs', authenticate, setRLSContext, jobRoutes);
// RLS context cleanup middleware (should be after all routes)
app.use(releaseRLSContext);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    message: 'Check the API documentation for available endpoints',
    availableEndpoints: [
      'GET /api/health',
      'GET /api/businesses/config',
      'POST /api/businesses/validate-timezone',
      'POST /api/businesses/register',
      'GET /api/customer-categories',
      'POST /api/customer-categories',
      'GET /api/customer-categories/:id',
      'PUT /api/customer-categories/:id',
      'DELETE /api/customer-categories/:id',
      'GET /api/customers', // ✅ ADD THESE
      'POST /api/customers',
      'GET /api/services',	    
      'GET /api/customers/search',
      'GET /api/customers/:id',
      'PUT /api/customers/:id',
      'DELETE /api/customers/:id'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

export default app;
