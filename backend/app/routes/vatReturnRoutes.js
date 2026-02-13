// File: backend/app/routes/vatReturnRoutes.js
// Description: Complete VAT Returns Routes - URA Form 4
// Created: February 13, 2026

import express from 'express';
import { VATReturnController } from '../controllers/vatReturnController.js';

const router = express.Router();

/**
 * @route   POST /api/vat/returns/generate
 * @desc    Generate VAT return from invoices and purchases
 * @access  Private
 */
router.post('/generate', VATReturnController.generateReturn);

/**
 * @route   GET /api/vat/returns
 * @desc    List VAT returns with filtering
 * @access  Private
 */
router.get('/', VATReturnController.listReturns);

/**
 * @route   GET /api/vat/returns/stats
 * @desc    Get VAT return statistics
 * @access  Private
 */
router.get('/stats', VATReturnController.getStatistics);

/**
 * @route   GET /api/vat/returns/:id
 * @desc    Get VAT return by ID
 * @access  Private
 */
router.get('/:id', VATReturnController.getReturn);

/**
 * @route   POST /api/vat/returns/:id/submit
 * @desc    Submit VAT return to URA
 * @access  Private
 */
router.post('/:id/submit', VATReturnController.submitToURA);

/**
 * @route   PUT /api/vat/returns/:id/void
 * @desc    Void a VAT return
 * @access  Private
 */
router.put('/:id/void', VATReturnController.voidReturn);

/**
 * @route   POST /api/vat/returns/test
 * @desc    Test VAT return generation
 * @access  Private
 */
router.post('/test', VATReturnController.testReturn);

export default router;
