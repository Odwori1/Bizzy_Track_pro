import express from 'express';
import { assetBulkController } from '../controllers/assetBulkController.js';
import { authenticate } from '../middleware/auth.js';
import { setRLSContext } from '../middleware/rlsContext.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// Apply authentication and RLS context
router.use(authenticate);
router.use(setRLSContext);

// Bulk asset operations
router.post('/bulk-import', 
  requirePermission('assets', 'write'), 
  assetBulkController.bulkImport
);

router.get('/export', 
  requirePermission('assets', 'read'), 
  assetBulkController.exportAssets
);

export default router;
