import express from 'express';
import { timezoneTestController } from '../controllers/timezoneTestController.js';

const router = express.Router();

router.get('/test', timezoneTestController.testTimezone);

export default router;
