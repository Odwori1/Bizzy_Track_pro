// File: backend/app/routes/taxRoutes.js
import express from 'express';
import { TaxController } from '../controllers/taxController.js';

const router = express.Router();

/**
 * @route   POST /api/tax/calculate-item
 * @desc    Calculate tax for a single item
 * @access  Private
 */
router.post('/calculate-item', TaxController.calculateItem);

/**
 * @route   POST /api/tax/calculate-invoice
 * @desc    Calculate tax for multiple line items (invoice)
 * @access  Private
 */
router.post('/calculate-invoice', TaxController.calculateInvoice);

/**
 * @route   GET /api/tax/categories
 * @desc    Get available tax categories for a country
 * @access  Private
 */
router.get('/categories', TaxController.getCategories);

/**
 * @route   GET /api/tax/configuration
 * @desc    Get tax configuration for a country
 * @access  Private
 */
router.get('/configuration', TaxController.getConfiguration);

/**
 * @route   GET /api/tax/rate
 * @desc    Get tax rate for a specific category
 * @access  Private
 */
router.get('/rate', TaxController.getTaxRate);

/**
 * @route   GET /api/tax/rules
 * @desc    Get all tax rules for a country
 * @access  Private
 */
router.get('/rules', TaxController.getTaxRules);

/**
 * @route   GET /api/tax/test
 * @desc    Run tax test scenarios
 * @access  Private
 */
router.get('/test', TaxController.runTests);

/**
 * @route   GET /api/tax/test-controller
 * @desc    Test controller endpoint
 * @access  Private
 */
router.get('/test-controller', TaxController.testController);

export default router;
