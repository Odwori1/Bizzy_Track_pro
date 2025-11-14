import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { healthCheck } from './utils/database.js';
import logger from './middleware/logger.js';
import businessRoutes from './routes/businessRoutes.js';
import customerCategoryRoutes from './routes/customerCategoryRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import serviceRoutes from './routes/serviceRoutes.js';
import discountRuleRoutes from './routes/discountRuleRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import userFeatureToggleRoutes from './routes/userFeatureToggleRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import demoDataRoutes from './routes/demoDataRoutes.js';

// Import security middleware
import { authenticate } from './middleware/auth.js';
import { setRLSContext, releaseRLSContext } from './middleware/rlsContext.js';

// Import timezone middleware
import { timezoneMiddleware } from './middleware/timezone.js';

// Import timezone test routes
import timezoneTestRoutes from './routes/timezoneTestRoutes.js';

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

// Apply global middleware to ALL protected routes
app.use(authenticate);
app.use(setRLSContext);
app.use(timezoneMiddleware.setTimezoneContext);
app.use(timezoneMiddleware.formatResponseDates); // CRITICAL: This must be BEFORE routes

// Protected routes (all get timezone context and date formatting)
app.use('/api/customer-categories', customerCategoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/discount-rules', discountRuleRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/user-feature-toggles', userFeatureToggleRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/timezone-test', timezoneTestRoutes);
app.use('/api/audit', authenticate, setRLSContext, timezoneMiddleware.setTimezoneContext, auditRoutes);
app.use('/api/demo-data', authenticate, setRLSContext, timezoneMiddleware.setTimezoneContext, demoDataRoutes);
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
      'GET /api/customers',
      'POST /api/customers',
      'GET /api/services',
      'GET /api/customers/search',
      'GET /api/customers/:id',
      'PUT /api/customers/:id',
      'DELETE /api/customers/:id',
      'GET /api/dashboard/overview',
      'GET /api/dashboard/financial-summary',
      'GET /api/dashboard/activity-timeline',
      'GET /api/dashboard/quick-stats',
      'GET /api/timezone-test/test',
      'GET /api/audit/search',
      'GET /api/audit/summary', 
      'GET /api/audit/recent',
      'GET /api/audit/:id',
      'POST /api/demo-data/generate',
      'POST /api/demo-data/cleanup', 
      'GET /api/demo-data/options'	    
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
