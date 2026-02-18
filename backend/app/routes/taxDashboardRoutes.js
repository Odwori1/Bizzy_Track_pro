// File: backend/app/routes/taxDashboardRoutes.js
import express from 'express';
import { TaxDashboardController } from '../controllers/taxDashboardController.js';

const router = express.Router();

/**
 * Dashboard Routes
 * Base path: /api/tax/dashboard
 */

// Summary endpoint
router.get('/summary', TaxDashboardController.getDashboardSummary);

// Individual dashboard widgets
router.get('/liabilities', TaxDashboardController.getTaxLiabilities);
router.get('/deadlines', TaxDashboardController.getUpcomingDeadlines);
router.get('/compliance', TaxDashboardController.getComplianceScore);
router.get('/forecast', TaxDashboardController.getTaxForecast);
router.get('/alerts', TaxDashboardController.getTaxAlerts);

// User preferences
router.get('/preferences', TaxDashboardController.getPreferences);
router.put('/preferences', TaxDashboardController.updatePreferences);

/**
 * Report Routes
 * Base path: /api/tax/reports
 */

// Generate a report
router.get('/:reportName', TaxDashboardController.generateReport);

// Schedule a report
router.post('/:reportName/schedule', TaxDashboardController.scheduleReport);

// List scheduled reports
router.get('/scheduled/all', TaxDashboardController.getScheduledReports);

// Delete a scheduled report
router.delete('/schedule/:scheduleId', TaxDashboardController.deleteSchedule);

export default router;
