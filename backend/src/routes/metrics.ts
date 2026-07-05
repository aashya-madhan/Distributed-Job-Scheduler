import { Router } from 'express';
import { getDashboardMetrics } from '../controllers/metricsController';
import { authenticate } from '../middleware/auth';

const router = Router();
router.get('/dashboard', authenticate, getDashboardMetrics);

export default router;
