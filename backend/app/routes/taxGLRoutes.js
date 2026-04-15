// File: backend/app/routes/taxGLRoutes.js
// Pattern follows: openingBalanceRoutes.js, taxRoutes.js
// Purpose: Tax-to-GL API routes

import express from 'express';
import { TaxGLController } from '../controllers/taxGLController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { validateRequest } from '../middleware/validation.js';
import { TaxGLSchemas } from '../schemas/taxGLSchemas.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============================================================================
// TAX GL ROUTES
// ============================================================================

// Get unposted taxes (read permission)
router.get(
    '/unposted',
    requirePermission('accounting:read'),
    (req, res, next) => {
        const validation = TaxGLSchemas.validateUnpostedQuery(req.query);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            });
        }
        next();
    },
    TaxGLController.getUnpostedTaxes
);

// Get tax liability report (read permission)
router.get(
    '/liability-report',
    requirePermission('accounting:read'),
    (req, res, next) => {
        const validation = TaxGLSchemas.validateLiabilityReportQuery(req.query);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            });
        }
        next();
    },
    TaxGLController.getTaxLiabilityReport
);

// Batch post taxes for date range (write permission)
router.post(
    '/batch-post',
    requirePermission('accounting:write'),
    (req, res, next) => {
        const validation = TaxGLSchemas.validateBatchPost(req.body);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            });
        }
        next();
    },
    TaxGLController.batchPostTaxes
);

// Backfill all taxes (write permission)
router.post(
    '/backfill',
    requirePermission('accounting:write'),
    TaxGLController.backfillTaxes
);

// Post single tax to GL (write permission)
router.post(
    '/post/:taxId',
    requirePermission('accounting:write'),
    TaxGLController.postTaxToGL
);

export default router;
