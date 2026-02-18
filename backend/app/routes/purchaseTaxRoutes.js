// File: backend/app/routes/purchaseTaxRoutes.js
import express from 'express';
import { PurchaseTaxController } from '../controllers/purchaseTaxController.js';

const router = express.Router();

/**
 * @route   GET /api/purchase-tax/test
 * @desc    Test controller endpoint
 * @access  Private
 */
router.get('/test', PurchaseTaxController.testController);

/**
 * @route   GET /api/purchase-tax/credits
 * @desc    Get tax credit summary
 * @access  Private
 */
router.get('/credits', PurchaseTaxController.getTaxCreditSummary);

/**
 * @route   POST /api/purchase-tax/calculate/:purchaseOrderId
 * @desc    Calculate input tax for a purchase order
 * @access  Private
 */
router.post('/calculate/:purchaseOrderId', PurchaseTaxController.calculateInputTax);

/**
 * @route   POST /api/purchase-tax/import-duty
 * @desc    Calculate import duty
 * @access  Private
 */
router.post('/import-duty', PurchaseTaxController.calculateImportDuty);

/**
 * @route   POST /api/purchase-tax/generate-wht/:paymentId
 * @desc    Generate WHT certificate for a payment
 * @access  Private
 */
router.post('/generate-wht/:paymentId', PurchaseTaxController.generateWhtCertificate);

/**
 * @route   POST /api/purchase-tax/credits/:creditId/utilize
 * @desc    Utilize a tax credit
 * @access  Private
 */
router.post('/credits/:creditId/utilize', PurchaseTaxController.utilizeTaxCredit);

export default router;
