import express from 'express';
import { auditController } from '../controllers/auditController.js';

const router = express.Router();

// Audit log search and retrieval routes
router.get('/search', auditController.searchAuditLogs);
router.get('/summary', auditController.getAuditSummary);
router.get('/recent', auditController.getRecentActivity);
router.get('/:id', auditController.getAuditLogById);

export default router;
