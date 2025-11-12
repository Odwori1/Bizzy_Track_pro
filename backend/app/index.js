import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { healthCheck } from './utils/database.js';
import logger from './middleware/logger.js';
import businessRoutes from './routes/businessRoutes.js';

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
// Example protected routes (uncomment and customize as needed)
// app.use('/api/customers', authenticate, setRLSContext, customerRoutes);
// app.use('/api/services', authenticate, setRLSContext, serviceRoutes);

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
      'POST /api/businesses/register'
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
