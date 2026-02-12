// File: backend/app/routes/whtCertificateRoutes.js
import express from 'express';
import { WHTCertificateController } from '../controllers/whtCertificateController.js';

const router = express.Router();

/**
 * @route   POST /api/wht/certificates/generate
 * @desc    Generate WHT certificate for an invoice
 * @access  Private
 */
router.post('/generate', WHTCertificateController.generateCertificate);

/**
 * @route   GET /api/wht/certificates
 * @desc    List WHT certificates with filtering
 * @access  Private
 */
router.get('/', WHTCertificateController.listCertificates);

/**
 * @route   GET /api/wht/certificates/stats
 * @desc    Get certificate statistics
 * @access  Private
 */
router.get('/stats', WHTCertificateController.getStats);

/**
 * @route   GET /api/wht/certificates/:id
 * @desc    Get certificate by ID
 * @access  Private
 */
router.get('/:id', WHTCertificateController.getCertificate);

/**
 * @route   GET /api/wht/certificates/:id/download
 * @desc    Download certificate PDF
 * @access  Private
 */
router.get('/:id/download', WHTCertificateController.downloadCertificate);

/**
 * @route   PUT /api/wht/certificates/:id/status
 * @desc    Update certificate status
 * @access  Private
 */
router.put('/:id/status', WHTCertificateController.updateStatus);

/**
 * @route   POST /api/wht/certificates/:id/resend-email
 * @desc    Resend certificate email
 * @access  Private
 */
router.post('/:id/resend-email', WHTCertificateController.resendEmail);

/**
 * @route   POST /api/wht/certificates/test
 * @desc    Test certificate generation
 * @access  Private
 */
router.post('/test', WHTCertificateController.testCertificate);

export default router;
