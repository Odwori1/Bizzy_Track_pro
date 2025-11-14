import express from 'express';
import { demoDataController } from '../controllers/demoDataController.js';

const router = express.Router();

// Demo data generation routes
router.post('/generate', demoDataController.generateDemoData);
router.post('/cleanup', demoDataController.cleanupDemoData);
router.get('/options', demoDataController.getDemoDataOptions);

export default router;
