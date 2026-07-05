import { Router } from 'express';
import {
  registerWorker, heartbeat, claimJob,
  completeJob, getWorkers, deregisterWorker,
} from '../controllers/workerController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Internal worker endpoints (API key auth in production)
router.post('/register', registerWorker);
router.post('/heartbeat/:workerId', heartbeat);
router.post('/claim', claimJob);
router.post('/complete/:executionId', completeJob);
router.post('/deregister/:workerId', deregisterWorker);

// Dashboard
router.get('/', authenticate, getWorkers);

export default router;
