// File: backend/app/routes/supplierComplianceRoutes.js
import express from 'express';
import { SupplierComplianceController } from '../controllers/supplierComplianceController.js';

const router = express.Router();

/**
 * @route   GET /api/supplier-compliance/test
 * @desc    Test controller endpoint
 * @access  Private
 */
router.get('/test', SupplierComplianceController.testController);

/**
 * @route   GET /api/supplier-compliance/dashboard
 * @desc    Get compliance dashboard
 * @access  Private
 */
router.get('/dashboard', SupplierComplianceController.getComplianceDashboard);

/**
 * @route   GET /api/supplier-compliance/:supplierId
 * @desc    Get specific supplier compliance
 * @access  Private
 */
router.get('/:supplierId', SupplierComplianceController.getSupplierCompliance);

/**
 * @route   POST /api/supplier-compliance/verify/:supplierId
 * @desc    Verify supplier TIN
 * @access  Private
 */
router.post('/verify/:supplierId', SupplierComplianceController.verifySupplierTIN);

/**
 * @route   PUT /api/supplier-compliance/:supplierId/score
 * @desc    Update compliance score
 * @access  Private
 */
router.put('/:supplierId/score', SupplierComplianceController.updateComplianceScore);

export default router;
