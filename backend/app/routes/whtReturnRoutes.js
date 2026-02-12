// File: backend/app/routes/whtReturnRoutes.js
// Description: Complete WHT Returns Routes - Phase 5
// Created: February 12, 2026
// Status: ✅ PRODUCTION READY

import express from 'express';
import { WHTReturnController } from '../controllers/whtReturnController.js';

const router = express.Router();

/**
 * @route   POST /api/wht/returns/generate
 * @desc    Generate WHT return from certificates in period
 * @access  Private
 */
router.post('/generate', WHTReturnController.generateReturn);

/**
 * @route   GET /api/wht/returns
 * @desc    List WHT returns with filtering
 * @access  Private
 */
router.get('/', WHTReturnController.listReturns);

/**
 * @route   GET /api/wht/returns/stats
 * @desc    Get return statistics
 * @access  Private
 */
router.get('/stats', WHTReturnController.getStatistics);

/**
 * @route   GET /api/wht/returns/:id
 * @desc    Get return by ID
 * @access  Private
 */
router.get('/:id', WHTReturnController.getReturn);

/**
 * @route   POST /api/wht/returns/:id/submit
 * @desc    Submit return to URA
 * @access  Private
 */
router.post('/:id/submit', WHTReturnController.submitToURA);

/**
 * @route   POST /api/wht/returns/:id/penalty
 * @desc    Calculate late filing penalty
 * @access  Private
 */
router.post('/:id/penalty', WHTReturnController.calculatePenalty);

/**
 * @route   POST /api/wht/returns/:id/approve
 * @desc    Add approval level to return
 * @access  Private
 */
router.post('/:id/approve', WHTReturnController.addApproval);

/**
 * @route   POST /api/wht/returns/:id/pay
 * @desc    Record payment for return
 * @access  Private
 */
router.post('/:id/pay', WHTReturnController.recordPayment);

/**
 * @route   PUT /api/wht/returns/:id/void
 * @desc    Void a return
 * @access  Private
 */
router.put('/:id/void', WHTReturnController.voidReturn);

/**
 * @route   POST /api/wht/returns/test
 * @desc    Test return generation
 * @access  Private
 */
router.post('/test', WHTReturnController.testReturn);

export default router;
