import { Router } from 'express';
import { body } from 'express-validator';
import {
  getQueues, createQueue, getQueue,
  updateQueue, deleteQueue, pauseQueue, resumeQueue, getQueueStats,
} from '../controllers/queueController';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router({ mergeParams: true });
router.use(authenticate);

// Read-only — all roles
router.get('/', getQueues);
router.get('/:queueId', getQueue);
router.get('/:queueId/stats', getQueueStats);

// Write — ADMIN or MEMBER only
router.post('/',
  requireRole('ADMIN', 'MEMBER'),
  body('name').trim().notEmpty(),
  body('concurrencyLimit').optional().isInt({ min: 1, max: 100 }),
  body('maxRetries').optional().isInt({ min: 0, max: 50 }),
  validate,
  createQueue
);
router.put('/:queueId',   requireRole('ADMIN', 'MEMBER'), updateQueue);
router.post('/:queueId/pause',  requireRole('ADMIN', 'MEMBER'), pauseQueue);
router.post('/:queueId/resume', requireRole('ADMIN', 'MEMBER'), resumeQueue);

// Destructive — ADMIN only
router.delete('/:queueId', requireRole('ADMIN'), deleteQueue);

export default router;
