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

//addtional service and customer routes
import serviceCategoryRoutes from './routes/serviceCategoryRoutes.js';
import customerCommunicationRoutes from './routes/customerCommunicationRoutes.js';

import discountRuleRoutes from './routes/discountRuleRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import userFeatureToggleRoutes from './routes/userFeatureToggleRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import demoDataRoutes from './routes/demoDataRoutes.js';
import packageRoutes from './routes/packageRoutes.js';
import pricingRuleRoutes from './routes/pricingRuleRoutes.js';
import discountApprovalRoutes from './routes/discountApprovalRoutes.js';
import assetRoutes from './routes/assetRoutes.js';
//hire assets route
import assetHireRoutes from './routes/assetHireRoutes.js';
import equipmentHireRoutes from './routes/equipmentHireRoutes.js';
//additional assets and equipment routes
import maintenanceRoutes from './routes/maintenanceRoutes.js';
import depreciationRoutes from './routes/depreciationRoutes.js';

import businessValuationRoutes from './routes/businessValuationRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import financialReportRoutes from './routes/financialReportRoutes.js';
import productRoutes from './routes/productRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import posRoutes from './routes/posRoutes.js';
import purchaseOrderRoutes from './routes/purchaseOrderRoutes.js';
//additional pos routes
import categoriesRoutes from './routes/categories.js';
import barcodeRoutes from './routes/barcode.js';
import salesAnalyticsRoutes from './routes/salesAnalytics.js';

//department routes
import departmentRoutes from './routes/departmentRoutes.js';
import jobDepartmentAssignmentRoutes from './routes/jobDepartmentAssignmentRoutes.js';
import departmentBillingRoutes from './routes/departmentBillingRoutes.js';
import departmentPerformanceRoutes from './routes/departmentPerformanceRoutes.js';

import jobAssignmentRoutes from './routes/jobAssignmentRoutes.js';
import workforceRoutes from './routes/workforceRoutes.js';
import jobRoutingRoutes from './routes/jobRoutingRoutes.js';
import fieldOperationsRoutes from './routes/fieldOperationsRoutes.js';
import slaMonitoringRoutes from './routes/slaMonitoringRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import reportingRoutes from './routes/reportingRoutes.js';
import behavioralAnalyticsRoutes from './routes/behavioralAnalyticsRoutes.js';
import mobileRoutes from './routes/mobileRoutes.js';
import cameraRoutes from './routes/cameraRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import branchRoutes from './routes/branchRoutes.js';

//accounting route
// Add this import with other route imports
import accountingRoutes from './routes/accountingRoutes.js';


//additional invoice routes
import invoiceTemplateRoutes from './routes/invoiceTemplateRoutes.js';
import recurringInvoiceRoutes from './routes/recurringInvoiceRoutes.js';
import invoicePdfRoutes from './routes/invoicePdfRoutes.js';

//additional week 5 routes
import seasonalPricingRoutes from './routes/seasonalPricingRoutes.js';
import priceHistoryRoutes from './routes/priceHistoryRoutes.js';
import pricingABACRoutes from './routes/pricingABACRoutes.js';

// ✅ WEEK 14: API SECURITY & INTEGRATION ROUTES
import apiKeyRoutes from './routes/apiKeyRoutes.js';
import webhookSecurityRoutes from './routes/webhookSecurityRoutes.js';
import externalIntegrationRoutes from './routes/externalIntegrationRoutes.js';
import apiSecurityRoutes from './routes/apiSecurityRoutes.js';
import externalApiRoutes from './routes/externalApiRoutes.js';
import securityAuditRoutes from './routes/securityAuditRoutes.js';

// Import security middleware
import { authenticate } from './middleware/auth.js';
import { setRLSContext } from './middleware/rlsContext.js'; // REMOVED releaseRLSContext

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

// =============================================================================
// 🟢 PUBLIC ROUTES (No authentication required)
// =============================================================================

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

// =============================================================================
// 🔵 EXTERNAL API ROUTES (API Key authentication only - NO JWT)
// =============================================================================

// External API routes use API key auth, NOT JWT - MUST be before global auth
app.use('/api/external', externalApiRoutes);

// =============================================================================
// 🔒 PROTECTED ROUTES (JWT Authentication required)
// =============================================================================

// Apply global middleware to ALL protected routes (after external API)
app.use(authenticate);
app.use(setRLSContext);
app.use(timezoneMiddleware.setTimezoneContext);
app.use(timezoneMiddleware.formatResponseDates); // CRITICAL: This must be BEFORE routes

// Protected routes (all get timezone context and date formatting)
app.use('/api/customer-categories', customerCategoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/services', serviceRoutes);

//additional service and customer routes
app.use('/api/service-categories', serviceCategoryRoutes);
app.use('/api/customer-communications', customerCommunicationRoutes);

app.use('/api/discount-rules', discountRuleRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/user-feature-toggles', userFeatureToggleRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/timezone-test', timezoneTestRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/demo-data', demoDataRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/pricing-rules', pricingRuleRoutes);
app.use('/api/discount-approvals', discountApprovalRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/asset-hire', assetHireRoutes);
app.use('/api/equipment-hire', equipmentHireRoutes);
//additional assets and equipment routes
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/depreciation', depreciationRoutes);

app.use('/api/business-valuation', businessValuationRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/financial-reports', financialReportRoutes);
app.use('/api/products', productRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
//additional pos routes
app.use('/api/categories', categoriesRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/analytics/sales', salesAnalyticsRoutes);

//Acconting route
// Add this with other protected routes (after authentication middleware)
app.use('/api/accounting', accountingRoutes);


//department routes
app.use('/api/departments', departmentRoutes);
app.use('/api/job-department-assignments', jobDepartmentAssignmentRoutes);
app.use('/api/department-billing', departmentBillingRoutes);
app.use('/api/department-performance', departmentPerformanceRoutes);


app.use('/api/job-assignments', jobAssignmentRoutes);
app.use('/api/workforce', workforceRoutes);
app.use('/api/job-routing', jobRoutingRoutes);
app.use('/api/field-operations', fieldOperationsRoutes);
app.use('/api/sla-monitoring', slaMonitoringRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reporting', reportingRoutes);
app.use('/api/behavioral-analytics', behavioralAnalyticsRoutes);
app.use('/api/mobile', mobileRoutes);
app.use('/api/camera', cameraRoutes);
app.use('/api/notifications', notificationRoutes);

//additional invoice routes
app.use('/api/invoice-templates', invoiceTemplateRoutes);
app.use('/api/recurring-invoices', recurringInvoiceRoutes);
app.use('/api/invoices', invoicePdfRoutes);

//additional week 5 routes
app.use('/api/seasonal-pricing', seasonalPricingRoutes);
app.use('/api/price-history', priceHistoryRoutes);
app.use('/api/pricing-abac', pricingABACRoutes);

// ✅ WEEK 14: API SECURITY & INTEGRATION PROTECTED ROUTES
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/webhooks', webhookSecurityRoutes);
app.use('/api/integrations', externalIntegrationRoutes);
app.use('/api/security', apiSecurityRoutes);

app.use('/api', branchRoutes);
app.use('/api', securityAuditRoutes);

// REMOVED: app.use(releaseRLSContext); - Services handle their own connection cleanup

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
      // Add with the other endpoints
      'GET /api/service-categories',
      'POST /api/service-categories', 
      'GET /api/service-categories/:id',
      'PUT /api/service-categories/:id',
      'DELETE /api/service-categories/:id',

      'GET /api/customer-communications',
      'POST /api/customer-communications',
      'GET /api/customer-communications/customer/:customerId',
      'GET /api/customer-communications/:id',
      'PUT /api/customer-communications/:id',
      'DELETE /api/customer-communications/:id',	    
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
      'GET /api/demo-data/options',
      // ✅ WEEK 14: API SECURITY ENDPOINTS
      'GET /api/external/business/profile',
      'GET /api/external/customers',
      'POST /api/api-keys',
      'GET /api/api-keys',
      'POST /api/api-keys/:apiKeyId/rotate',
      'DELETE /api/api-keys/:apiKeyId',
      'GET /api/api-keys/:apiKeyId/usage',
      'POST /api/webhooks/endpoints',
      'GET /api/webhooks/endpoints',
      'POST /api/webhooks/verify-signature',
      'GET /api/webhooks/endpoints/:webhookEndpointId/delivery-logs',
      'POST /api/integrations',
      'GET /api/integrations',
      'PUT /api/integrations/:integrationId',
      'POST /api/integrations/:integrationId/test',
      'GET /api/integrations/:integrationId/activity-logs',
      'GET /api/security/overview',
      'GET /api/security/analytics/usage'
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
